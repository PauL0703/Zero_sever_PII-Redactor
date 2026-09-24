import { describe, it, expect } from 'vitest';
import { mapEntitiesToPDFCoordinates } from '../core/pdf/coordinateMapper';
import type { PIIEntity } from '../core/types';
import type { PDFTextItem } from '../core/pdf/types';

function makeTextItem(overrides: Partial<PDFTextItem> & { text: string; start: number; end: number }): PDFTextItem {
  return {
    page: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 12,
    ...overrides,
  };
}

function makeEntity(overrides: Partial<PIIEntity> & { start: number; end: number; word: string }): PIIEntity {
  return {
    entity_group: 'PERSON',
    score: 1.0,
    ...overrides,
  };
}

describe('coordinateMapper', () => {
  describe('mapEntitiesToPDFCoordinates', () => {
    it('should return empty array when entities is empty', () => {
      const result = mapEntitiesToPDFCoordinates([], [makeTextItem({ text: 'hello', start: 0, end: 5 })]);
      expect(result).toEqual([]);
    });

    it('should return empty array when textItems is empty', () => {
      const result = mapEntitiesToPDFCoordinates(
        [makeEntity({ word: 'John', start: 0, end: 4 })],
        []
      );
      expect(result).toEqual([]);
    });

    // Test 1 — Simple PDF: single entity mapped to a single text item
    it('should map a single entity to a single text item', () => {
      const textItems: PDFTextItem[] = [
        makeTextItem({ text: 'Name: John Smith', start: 0, end: 16, page: 1, x: 50, y: 700, width: 200, height: 14 }),
        makeTextItem({ text: 'Email: john@example.com', start: 17, end: 40, page: 1, x: 50, y: 680, width: 250, height: 14 }),
      ];

      const entities: PIIEntity[] = [
        makeEntity({ entity_group: 'PERSON', word: 'John Smith', start: 6, end: 16 }),
        makeEntity({ entity_group: 'EMAIL', word: 'john@example.com', start: 24, end: 40 }),
      ];

      const result = mapEntitiesToPDFCoordinates(entities, textItems);
      expect(result).toHaveLength(2);

      // PERSON entity
      expect(result[0].entity_group).toBe('PERSON');
      expect(result[0].word).toBe('John Smith');
      expect(result[0].page).toBe(1);
      expect(result[0].boxes).toHaveLength(1);
      expect(result[0].boxes[0].height).toBe(14);

      // EMAIL entity
      expect(result[1].entity_group).toBe('EMAIL');
      expect(result[1].word).toBe('john@example.com');
      expect(result[1].page).toBe(1);
      expect(result[1].boxes).toHaveLength(1);
    });

    // Test 2 — Multiple pages: entity on page 2
    it('should correctly assign page number for entities on different pages', () => {
      const textItems: PDFTextItem[] = [
        makeTextItem({ text: 'Page one content', start: 0, end: 16, page: 1 }),
        makeTextItem({ text: 'John Smith', start: 17, end: 27, page: 2, x: 100, y: 500 }),
      ];

      const entities: PIIEntity[] = [
        makeEntity({ word: 'John Smith', start: 17, end: 27 }),
      ];

      const result = mapEntitiesToPDFCoordinates(entities, textItems);
      expect(result).toHaveLength(1);
      expect(result[0].page).toBe(2);
    });

    // Test 3 — Duplicate text: only the correct offset should match
    it('should map to the correct occurrence when duplicate text exists', () => {
      const textItems: PDFTextItem[] = [
        makeTextItem({ text: 'John Smith', start: 0, end: 10, page: 1, x: 50, y: 700 }),
        makeTextItem({ text: 'John Smith', start: 11, end: 21, page: 1, x: 50, y: 680 }),
      ];

      // Entity detected at the SECOND occurrence
      const entities: PIIEntity[] = [
        makeEntity({ word: 'John Smith', start: 11, end: 21 }),
      ];

      const result = mapEntitiesToPDFCoordinates(entities, textItems);
      expect(result).toHaveLength(1);
      expect(result[0].start).toBe(11);
      expect(result[0].end).toBe(21);
      // Should map to the second text item (y=680), not the first (y=700)
      expect(result[0].boxes[0].y).toBe(680);
    });

    // Test 4 — Multiple PII on same page
    it('should correctly map multiple entities on the same page', () => {
      const textItems: PDFTextItem[] = [
        makeTextItem({ text: 'Name: Alice', start: 0, end: 11, page: 1, x: 50, y: 700 }),
        makeTextItem({ text: 'Email: alice@test.com', start: 12, end: 32, page: 1, x: 50, y: 680 }),
        makeTextItem({ text: 'Phone: +91 1234567890', start: 33, end: 54, page: 1, x: 50, y: 660 }),
      ];

      const entities: PIIEntity[] = [
        makeEntity({ entity_group: 'PERSON', word: 'Alice', start: 6, end: 11 }),
        makeEntity({ entity_group: 'EMAIL', word: 'alice@test.com', start: 19, end: 32 }),
        makeEntity({ entity_group: 'PHONE_IN', word: '+91 1234567890', start: 40, end: 54 }),
      ];

      const result = mapEntitiesToPDFCoordinates(entities, textItems);
      expect(result).toHaveLength(3);
      expect(result[0].entity_group).toBe('PERSON');
      expect(result[1].entity_group).toBe('EMAIL');
      expect(result[2].entity_group).toBe('PHONE_IN');
      // All on page 1
      for (const e of result) {
        expect(e.page).toBe(1);
      }
    });

    // Test 5 — Multi-line text: entity spanning multiple text items
    it('should produce multiple boxes for entities spanning multiple text items', () => {
      const textItems: PDFTextItem[] = [
        makeTextItem({ text: '123 Some Long', start: 0, end: 13, page: 1, x: 50, y: 700, width: 150, height: 14 }),
        makeTextItem({ text: 'Street', start: 14, end: 20, page: 1, x: 50, y: 686, width: 80, height: 14 }),
        makeTextItem({ text: 'Ahmedabad', start: 21, end: 30, page: 1, x: 50, y: 672, width: 100, height: 14 }),
      ];

      // One entity spanning all three items
      const entities: PIIEntity[] = [
        makeEntity({ entity_group: 'LOC', word: '123 Some Long Street Ahmedabad', start: 0, end: 30 }),
      ];

      const result = mapEntitiesToPDFCoordinates(entities, textItems);
      expect(result).toHaveLength(1);
      expect(result[0].boxes).toHaveLength(3);
      expect(result[0].boxes[0].y).toBe(700);
      expect(result[0].boxes[1].y).toBe(686);
      expect(result[0].boxes[2].y).toBe(672);
    });

    it('should handle entity partially overlapping a text item', () => {
      const textItems: PDFTextItem[] = [
        makeTextItem({ text: 'Hello John Smith bye', start: 0, end: 20, page: 1, x: 0, y: 0, width: 200, height: 12 }),
      ];

      const entities: PIIEntity[] = [
        makeEntity({ word: 'John Smith', start: 6, end: 16 }),
      ];

      const result = mapEntitiesToPDFCoordinates(entities, textItems);
      expect(result).toHaveLength(1);
      // The box should be proportionally narrower than the full text item
      expect(result[0].boxes[0].width).toBeLessThan(200);
      expect(result[0].boxes[0].x).toBeGreaterThan(0);
    });
  });
});
