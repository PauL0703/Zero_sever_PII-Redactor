import type { PIIEntity } from '../types';
import type { PDFTextItem, PDFPIIEntity, PDFBoundingBox } from './types';

/**
 * Map PII entities (with character offsets into normalized text) to PDF coordinates.
 *
 * Uses a sweep-line approach: text items are sorted by start offset, and for each
 * PII entity, we find all overlapping text items using binary search + linear scan.
 * This avoids O(N*M) full scans.
 *
 * For PII entities spanning multiple text items (e.g., multi-line addresses),
 * multiple bounding boxes are returned.
 *
 * @param entities - PII entities with start/end offsets into the normalized text
 * @param textItems - Sorted PDF text items with start/end offsets and coordinates
 * @returns PDF PII entities with page numbers and bounding boxes
 */
export function mapEntitiesToPDFCoordinates(
  entities: PIIEntity[],
  textItems: PDFTextItem[]
): PDFPIIEntity[] {
  if (entities.length === 0 || textItems.length === 0) {
    return [];
  }

  // Ensure text items are sorted by start offset for binary search
  const sortedItems = [...textItems].sort((a, b) => a.start - b.start);

  const pdfEntities: PDFPIIEntity[] = [];

  for (const entity of entities) {
    const boxes: PDFBoundingBox[] = [];
    let entityPage = -1;

    // Binary search for the first text item that could overlap with this entity
    let lo = 0;
    let hi = sortedItems.length - 1;
    let firstOverlapIdx = sortedItems.length;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      // A text item overlaps if its end > entity.start
      if (sortedItems[mid].end > entity.start) {
        firstOverlapIdx = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    // Linear scan from the first potential overlap
    for (let i = firstOverlapIdx; i < sortedItems.length; i++) {
      const item = sortedItems[i];

      // If the text item starts at or after the entity end, no more overlaps
      if (item.start >= entity.end) {
        break;
      }

      // Check for actual overlap: item range [item.start, item.end) overlaps [entity.start, entity.end)
      if (item.end > entity.start && item.start < entity.end) {
        // Calculate the portion of this text item that the PII entity covers
        const overlapStart = Math.max(entity.start, item.start);
        const overlapEnd = Math.min(entity.end, item.end);

        // Compute the fraction of the text item covered to estimate the x/width
        const itemTextLength = item.end - item.start;
        const charStartInItem = overlapStart - item.start;
        const charEndInItem = overlapEnd - item.start;

        let boxX = item.x;
        let boxWidth = item.width;

        if (itemTextLength > 0 && item.width > 0) {
          // Proportional estimation of horizontal position within the text item
          const startFraction = charStartInItem / itemTextLength;
          const endFraction = charEndInItem / itemTextLength;
          boxX = item.x + item.width * startFraction;
          boxWidth = item.width * (endFraction - startFraction);
        }

        boxes.push({
          x: boxX,
          y: item.y,
          width: boxWidth,
          height: item.height,
        });

        // Use the page of the first overlapping text item
        if (entityPage === -1) {
          entityPage = item.page;
        }
      }
    }

    // Only include entities where we found at least one matching text item
    if (boxes.length > 0) {
      pdfEntities.push({
        entity_group: entity.entity_group,
        score: entity.score,
        word: entity.word,
        start: entity.start,
        end: entity.end,
        page: entityPage,
        boxes,
      });
    }
  }

  return pdfEntities;
}
