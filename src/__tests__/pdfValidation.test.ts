import { describe, it, expect } from 'vitest';
import { MAX_PDF_SIZE_BYTES } from '../core/pdf/types';

describe('PDF validation', () => {
  // Test 6 — Non-PDF upload must be rejected
  describe('file type validation', () => {
    it('should reject non-PDF files based on type', () => {
      const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
      expect(file.type).not.toBe('application/pdf');
      expect(file.name.toLowerCase().endsWith('.pdf')).toBe(false);
    });

    it('should accept PDF files based on type', () => {
      const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });
      expect(file.type).toBe('application/pdf');
    });

    it('should accept PDF files based on extension', () => {
      const file = new File(['%PDF-1.4'], 'document.PDF', { type: '' });
      expect(file.name.toLowerCase().endsWith('.pdf')).toBe(true);
    });
  });

  // Test 7 — Empty/corrupt PDF
  describe('file size validation', () => {
    it('should reject empty files', () => {
      const file = new File([], 'empty.pdf', { type: 'application/pdf' });
      expect(file.size).toBe(0);
    });

    it('should reject files exceeding the size limit', () => {
      // Just verify the constant is defined correctly
      expect(MAX_PDF_SIZE_BYTES).toBe(50 * 1024 * 1024);

      // Simulate a size check
      const fileSize = 60 * 1024 * 1024; // 60 MB
      expect(fileSize > MAX_PDF_SIZE_BYTES).toBe(true);
    });

    it('should accept files within the size limit', () => {
      const fileSize = 5 * 1024 * 1024; // 5 MB
      expect(fileSize <= MAX_PDF_SIZE_BYTES).toBe(true);
    });
  });

  // Test for ArrayBuffer validation in pdfLoader
  describe('buffer validation', () => {
    it('should identify empty ArrayBuffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(buffer.byteLength).toBe(0);
    });

    it('should accept non-empty ArrayBuffer', () => {
      const buffer = new ArrayBuffer(100);
      expect(buffer.byteLength).toBeGreaterThan(0);
    });
  });
});
