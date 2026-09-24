import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Configure PDF.js worker — use bundled worker for web worker context
// In a bundled (Vite) environment, we disable the separate worker thread
// since we're already inside a web worker. PDF.js will use the main thread
// of the web worker for parsing.
GlobalWorkerOptions.workerSrc = '';

/**
 * Load a PDF document from an ArrayBuffer.
 *
 * @param buffer - The raw PDF file bytes
 * @returns A PDF.js document proxy
 * @throws Error if the PDF cannot be loaded or is corrupted
 */
export async function loadPDF(buffer: ArrayBuffer): Promise<PDFDocumentProxy> {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('PDF file is empty or invalid.');
  }

  try {
    // Use a copy of the buffer to avoid detached ArrayBuffer issues
    const data = new Uint8Array(buffer);
    const loadingTask = getDocument({ data });

    const pdf = await loadingTask.promise;
    return pdf;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load PDF: ${message}`);
  }
}
