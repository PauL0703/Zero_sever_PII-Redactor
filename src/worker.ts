/// <reference lib="webworker" />
import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import * as Comlink from 'comlink';
import type { HardwareDiagnostics } from './core/diagnostics';
import type { PIIEntity } from './core/types';
import { runRegexEngine } from './core/regexEngine';
import { chunkDocument, overlapReconciliation } from './core/chunking';
import { loadPDF } from './core/pdf/pdfLoader';
import { detectPDFType } from './core/pdf/pdfDetector';
import { extractPDFText } from './core/pdf/pdfExtractor';
import { mapEntitiesToPDFCoordinates } from './core/pdf/coordinateMapper';
import type { PDFProcessingResult, PDFProgressEvent } from './core/pdf/types';

// Enforce browser caching for models so weights persist locally
env.useBrowserCache = true;

let nlpPipeline: TokenClassificationPipeline | null = null;

export type ProgressCallback = (progress: {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}) => void;

export type PDFProgressCallback = (event: PDFProgressEvent) => void;

export async function initEngine(
  diagnostics: HardwareDiagnostics,
  onProgress: ProgressCallback
): Promise<boolean> {
  try {
    const modelId = 'openai/privacy-filter';
    
    let device: any = 'wasm';
    let dtype: any = 'fp32';
    
    if (diagnostics.webGPUSupport) {
      device = 'webgpu';
      dtype = 'q4f16';
    }

    nlpPipeline = await pipeline('token-classification', modelId, {
      device,
      dtype,
      progress_callback: onProgress
    });
    
    return true;
  } catch (error) {
    console.error('Failed to initialize transformers pipeline:', error);
    return false;
  }
}

export async function sanitizeDocument(text: string): Promise<PIIEntity[]> {
  if (!nlpPipeline) {
    throw new Error('Pipeline not initialized. Call initEngine first.');
  }

  // 1. Layer 1: Regex Engine execution
  const regexEntities = runRegexEngine(text);

  // 2. Overlapping Chunking Strategy
  // Use a 200-word window with a 150-word stride
  const chunks = chunkDocument(text, 200, 150);
  
  // 3. Sequential AI execution on chunks
  const aiEntities: PIIEntity[] = [];
  
  for (const chunk of chunks) {
    const results: any = await nlpPipeline(chunk.text, {
      aggregation_strategy: 'simple'
    });
    
    const entities = Array.isArray(results) ? results : [results];
    
    let cursor = 0;
    for (const entity of entities) {
      if (!entity || !entity.word) continue;
      
      // Filter out low-confidence AI hallucinations
      if (entity.score < 0.75) continue;
      
      const rawWord = entity.word as string;
      const normalizedWord = rawWord.replace(/\u2581/g, ' ').trim();
      
      if (!normalizedWord) continue;
      
      const searchStart = cursor;
      const localIndex = chunk.text.indexOf(normalizedWord, searchStart);
      
      if (localIndex !== -1) {
        aiEntities.push({
          entity_group: entity.entity_group,
          score: entity.score,
          word: normalizedWord,
          start: chunk.globalOffset + localIndex,
          end: chunk.globalOffset + localIndex + normalizedWord.length
        });
        cursor = localIndex + normalizedWord.length;
      } else {
        const approxStart = Math.max(cursor, entity.start);
        const approxEnd = Math.max(approxStart, entity.end);
        const approxWord = chunk.text.substring(approxStart, approxEnd);
        
        aiEntities.push({
          entity_group: entity.entity_group,
          score: entity.score,
          word: approxWord,
          start: chunk.globalOffset + approxStart,
          end: chunk.globalOffset + approxEnd
        });
        cursor = approxEnd;
      }
    }
  }

  // 4. Pool entities and reconcile overlaps deterministically
  const pooledEntities = [...regexEntities, ...aiEntities];
  const finalEntities = overlapReconciliation(pooledEntities, text);

  // 5. Boundary Snapping & Hallucination Defense
  const isPunct = (char: string) => /[\s\-.,;:'"!?()\[\]{}<>]/.test(char);
  const isAlphaNum = (char: string) => /[a-zA-Z0-9]/.test(char);
  
  for (const entity of finalEntities) {
    // A. Punctuation snapping
    while (entity.start < entity.end && isPunct(text[entity.start])) {
      entity.start++;
    }
    while (entity.end > entity.start && isPunct(text[entity.end - 1])) {
      entity.end--;
    }
    
    // B. Subword Hallucination Defense
    // If the entity starts or ends in the middle of a continuous alphanumeric word,
    // it is a subword tokenization failure (like "er" inside "server"). 
    // We invalidate it by collapsing its boundaries.
    if (entity.start > 0 && isAlphaNum(text[entity.start - 1])) {
      entity.start = entity.end;
    }
    if (entity.end < text.length && isAlphaNum(text[entity.end])) {
      entity.start = entity.end;
    }

    if (entity.start < entity.end) {
      entity.word = text.substring(entity.start, entity.end);
    }
  }

  // Return strictly valid spans that survived boundary snapping and hallucination defense
  return finalEntities.filter(e => e.start < e.end);
}

/**
 * Process a PDF file: load → detect type → extract text → detect PII → map coordinates.
 *
 * For scanned PDFs, returns early with a message — OCR is not implemented in Phase 1.
 * For text PDFs, reuses the existing sanitizeDocument() pipeline.
 */
export async function processPDF(
  buffer: ArrayBuffer,
  onProgress?: PDFProgressCallback
): Promise<PDFProcessingResult> {
  const notify = (event: PDFProgressEvent) => {
    if (onProgress) onProgress(event);
  };

  // 1. Load the PDF
  notify({ status: 'loading', progress: 0, message: 'Loading PDF...' });
  const pdf = await loadPDF(buffer);
  const pageCount = pdf.numPages;

  // 2. Detect whether it's a text or scanned PDF
  notify({ status: 'detecting', progress: 10, message: 'Detecting PDF type...', totalPages: pageCount });
  const pdfType = await detectPDFType(pdf);

  if (pdfType === 'SCANNED') {
    notify({ status: 'complete', progress: 100, message: 'Scanned PDF detected.' });
    return {
      type: 'SCANNED',
      pageCount,
      text: '',
      entities: [],
      statistics: { total: 0, byCategory: {} },
      message: 'This PDF appears to be scanned/image-based. OCR support will be available in a future version.',
    };
  }

  // 3. Extract text with coordinate tracking
  notify({ status: 'extracting', progress: 15, message: 'Extracting text...', totalPages: pageCount });
  const extraction = await extractPDFText(pdf, (event) => {
    notify({
      ...event,
      progress: 15 + Math.round(((event.page || 0) / pageCount) * 40),
    });
  });

  if (!extraction.text.trim()) {
    notify({ status: 'complete', progress: 100, message: 'No text found in PDF.' });
    return {
      type: 'TEXT',
      pageCount,
      text: '',
      entities: [],
      statistics: { total: 0, byCategory: {} },
      message: 'No selectable text was found in this PDF.',
    };
  }

  // 4. Run existing PII detection on the normalized text
  notify({ status: 'analyzing', progress: 55, message: 'Analyzing PII...' });
  const piiEntities: PIIEntity[] = await sanitizeDocument(extraction.text);

  // 5. Map PII offsets to PDF coordinates
  notify({ status: 'mapping', progress: 85, message: 'Mapping PII to PDF coordinates...' });
  const pdfEntities = mapEntitiesToPDFCoordinates(piiEntities, extraction.textItems);

  // 6. Compute statistics
  const byCategory: Record<string, number> = {};
  for (const entity of pdfEntities) {
    const group = entity.entity_group;
    byCategory[group] = (byCategory[group] || 0) + 1;
  }

  notify({ status: 'complete', progress: 100, message: 'Analysis complete.' });

  return {
    type: 'TEXT',
    pageCount,
    text: extraction.text,
    entities: pdfEntities,
    statistics: {
      total: pdfEntities.length,
      byCategory,
    },
  };
}

// Expose the worker methods via Comlink
Comlink.expose({
  initEngine,
  sanitizeDocument,
  processPDF
});
