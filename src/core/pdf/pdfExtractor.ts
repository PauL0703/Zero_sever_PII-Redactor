import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFTextItem, PDFExtractionResult, PDFProgressEvent } from './types';

/**
 * Derive a bounding box from a PDF.js text item's transform matrix and dimensions.
 *
 * PDF.js text items provide a `transform` array: [scaleX, skewY, skewX, scaleY, translateX, translateY].
 * For standard horizontal text: scaleX = fontSize * horizontalScale, scaleY = fontSize.
 * translateX = x position, translateY = y position (bottom-left in PDF coordinates).
 *
 * The `width` from PDF.js is the rendered width of the text.
 * The height is derived from the font size (scaleY component of the transform).
 */
function getTextItemBoundingBox(
  transform: number[],
  itemWidth: number,
  itemHeight: number
): { x: number; y: number; width: number; height: number } {
  // transform = [scaleX, skewY, skewX, scaleY, translateX, translateY]
  const scaleX = transform[0];
  const skewY = transform[1];
  const skewX = transform[2];
  const scaleY = transform[3];
  const translateX = transform[4];
  const translateY = transform[5];

  // For rotated/skewed text, compute effective dimensions
  // The font size is typically abs(scaleY), and width comes from PDF.js
  const effectiveHeight = itemHeight > 0
    ? itemHeight
    : Math.sqrt(skewX * skewX + scaleY * scaleY);

  const effectiveWidth = itemWidth > 0
    ? itemWidth
    : Math.abs(scaleX);

  // For standard left-to-right text, the position is straightforward.
  // For rotated text, we compute the bounding box corners.
  // The origin (translateX, translateY) is the bottom-left of the text baseline.

  // Handle the simple common case (no rotation/skew)
  if (Math.abs(skewY) < 0.001 && Math.abs(skewX) < 0.001) {
    return {
      x: translateX,
      y: translateY,
      width: effectiveWidth,
      height: effectiveHeight,
    };
  }

  // For rotated text, compute bounding box from the 4 corners
  // Corner offsets relative to origin: (0,0), (width,0), (0,height), (width,height)
  const corners = [
    { x: 0, y: 0 },
    { x: effectiveWidth, y: 0 },
    { x: 0, y: effectiveHeight },
    { x: effectiveWidth, y: effectiveHeight },
  ];

  // Normalize the transform to just rotation (remove scale)
  const angle = Math.atan2(skewY, scaleX);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    const rx = translateX + corner.x * cos - corner.y * sin;
    const ry = translateY + corner.x * sin + corner.y * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Extract all text from a PDF document with character offset tracking.
 *
 * Constructs a normalized full-text string where:
 * - Text items within the same page are separated by spaces (when not already spaced)
 * - Pages are separated by newlines
 *
 * Each PDFTextItem records its start/end offset in this normalized string.
 *
 * @param pdf - A loaded PDF.js document proxy
 * @param onProgress - Optional progress callback
 * @returns Extraction result with full text, text items, and page count
 */
export async function extractPDFText(
  pdf: PDFDocumentProxy,
  onProgress?: (event: PDFProgressEvent) => void
): Promise<PDFExtractionResult> {
  const totalPages = pdf.numPages;
  const allTextItems: PDFTextItem[] = [];
  let fullText = '';
  let currentOffset = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) {
      onProgress({
        status: 'extracting',
        page: pageNum,
        totalPages,
        progress: Math.round((pageNum / totalPages) * 100),
        message: `Extracting text from page ${pageNum} of ${totalPages}`,
      });
    }

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    let isFirstItemOnPage = true;

    for (const item of textContent.items) {
      // Skip non-text items (e.g., marked content items)
      if (!('str' in item) || typeof item.str !== 'string') {
        continue;
      }

      const text = item.str;

      // Skip empty strings but handle EOL flags
      if (text.length === 0) {
        // If hasEOL is set, add a newline separator
        if ('hasEOL' in item && item.hasEOL) {
          if (fullText.length > 0 && !fullText.endsWith('\n')) {
            fullText += '\n';
            currentOffset++;
          }
          isFirstItemOnPage = false;
        }
        continue;
      }

      // Add separator between pages
      if (isFirstItemOnPage && currentOffset > 0) {
        // Separate pages with a newline
        if (!fullText.endsWith('\n')) {
          fullText += '\n';
          currentOffset++;
        }
      } else if (!isFirstItemOnPage) {
        // Within a page: if the previous text didn't end with whitespace
        // and this text doesn't start with whitespace, add a space
        if (
          fullText.length > 0 &&
          !fullText.endsWith(' ') &&
          !fullText.endsWith('\n') &&
          !fullText.endsWith('\t') &&
          !text.startsWith(' ')
        ) {
          fullText += ' ';
          currentOffset++;
        }
      }

      // Derive bounding box
      const transform = 'transform' in item ? (item.transform as number[]) : [1, 0, 0, 1, 0, 0];
      const itemWidth = 'width' in item ? (item.width as number) : 0;
      const itemHeight = 'height' in item ? (item.height as number) : 0;

      const bbox = getTextItemBoundingBox(transform, itemWidth, itemHeight);

      const start = currentOffset;
      const end = currentOffset + text.length;

      allTextItems.push({
        text,
        page: pageNum,
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        start,
        end,
      });

      fullText += text;
      currentOffset = end;
      isFirstItemOnPage = false;

      // Handle end-of-line after a text item
      if ('hasEOL' in item && item.hasEOL) {
        if (!fullText.endsWith('\n')) {
          fullText += '\n';
          currentOffset++;
        }
      }
    }
  }

  return {
    text: fullText,
    textItems: allTextItems,
    pageCount: totalPages,
  };
}
