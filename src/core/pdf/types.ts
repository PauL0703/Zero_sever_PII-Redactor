import type { PIIEntity } from '../types';

/** Bounding box in PDF coordinate space */
export interface PDFBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single text item extracted from a PDF page, with character offset tracking */
export interface PDFTextItem {
  text: string;

  /** 1-indexed page number */
  page: number;

  x: number;
  y: number;
  width: number;
  height: number;

  /** Character offset start in normalized full-text */
  start: number;
  /** Character offset end in normalized full-text */
  end: number;
}

/** A PII entity mapped to PDF coordinates */
export interface PDFPIIEntity {
  entity_group: string;
  score: number;
  word: string;

  /** Character offset start in normalized full-text */
  start: number;
  /** Character offset end in normalized full-text */
  end: number;

  /** 1-indexed page number (page of the first box) */
  page: number;

  /** Bounding boxes — an array because PII can span multiple text items/lines */
  boxes: PDFBoundingBox[];
}

export type PDFType = 'TEXT' | 'SCANNED';

export interface PDFExtractionResult {
  /** Full normalized text from the PDF */
  text: string;
  /** All text items with position data and character offsets */
  textItems: PDFTextItem[];
  /** Total page count */
  pageCount: number;
}

export interface PDFProcessingResult {
  type: PDFType;

  pageCount: number;

  /** Full extracted text */
  text: string;

  /** Detected PII entities mapped to PDF coordinates */
  entities: PDFPIIEntity[];

  /** Summary statistics */
  statistics: {
    total: number;
    byCategory: Record<string, number>;
  };

  /** Message for user — e.g. scanned PDF notice */
  message?: string;
}

export interface PDFProgressEvent {
  status: 'loading' | 'extracting' | 'detecting' | 'analyzing' | 'mapping' | 'complete' | 'error';
  page?: number;
  totalPages?: number;
  progress?: number;
  message?: string;
}

/** Re-export PIIEntity for convenience */
export type { PIIEntity };

/** Maximum PDF file size in bytes (50 MB) */
export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

/** Minimum text length per page to consider the page as having selectable text */
export const MIN_TEXT_LENGTH_PER_PAGE = 20;

/** Number of pages to sample when detecting PDF type */
export const DETECTION_SAMPLE_PAGES = 5;
