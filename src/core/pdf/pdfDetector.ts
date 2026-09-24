import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFType } from './types';
import { DETECTION_SAMPLE_PAGES, MIN_TEXT_LENGTH_PER_PAGE } from './types';

/**
 * Determine whether a PDF contains meaningful selectable text (TEXT)
 * or is primarily scanned/image-based (SCANNED).
 *
 * Samples up to DETECTION_SAMPLE_PAGES pages and checks whether
 * they contain at least MIN_TEXT_LENGTH_PER_PAGE characters of text.
 *
 * @param pdf - A loaded PDF document proxy
 * @returns 'TEXT' if the PDF has selectable text, 'SCANNED' otherwise
 */
export async function detectPDFType(pdf: PDFDocumentProxy): Promise<PDFType> {
  const totalPages = pdf.numPages;
  const pagesToCheck = Math.min(totalPages, DETECTION_SAMPLE_PAGES);

  // Sample pages evenly distributed through the document
  const pageIndices: number[] = [];
  if (pagesToCheck === 1) {
    pageIndices.push(1);
  } else {
    for (let i = 0; i < pagesToCheck; i++) {
      const pageNum = Math.min(
        Math.floor((i / (pagesToCheck - 1)) * (totalPages - 1)) + 1,
        totalPages
      );
      if (!pageIndices.includes(pageNum)) {
        pageIndices.push(pageNum);
      }
    }
  }

  let pagesWithText = 0;

  for (const pageNum of pageIndices) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map(item => ('str' in item ? (item as { str: string }).str : ''))
        .join('')
        .trim();

      if (pageText.length >= MIN_TEXT_LENGTH_PER_PAGE) {
        pagesWithText++;
      }
    } catch {
      // If a page fails to load, skip it
      continue;
    }
  }

  // Consider it a text PDF if at least half the sampled pages have text
  return pagesWithText >= Math.ceil(pageIndices.length / 2) ? 'TEXT' : 'SCANNED';
}
