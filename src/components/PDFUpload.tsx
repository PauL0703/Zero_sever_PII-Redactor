import { useCallback, useRef, useState } from 'react';
import { MAX_PDF_SIZE_BYTES } from '../core/pdf/types';

interface Props {
  onFileSelected: (buffer: ArrayBuffer, fileName: string) => void;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PDFUpload({ onFileSelected, disabled }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndLoad = useCallback(async (file: File) => {
    setError(null);
    setFileName(null);

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError(`Invalid file type: "${file.name}". Only PDF files are accepted.`);
      return;
    }

    // Validate file is not empty
    if (file.size === 0) {
      setError('The selected file is empty.');
      return;
    }

    // Validate file size
    if (file.size > MAX_PDF_SIZE_BYTES) {
      setError(`File too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_PDF_SIZE_BYTES)}.`);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      setFileName(file.name);
      onFileSelected(buffer, file.name);
    } catch {
      setError('Failed to read the file. It may be corrupted.');
    }
  }, [onFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndLoad(file);
    // Reset input so re-selecting the same file triggers onChange
    if (inputRef.current) inputRef.current.value = '';
  }, [validateAndLoad]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) validateAndLoad(file);
  }, [disabled, validateAndLoad]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          min-h-[200px] border-4 border-dashed cursor-pointer
          flex flex-col items-center justify-center gap-4 p-8
          transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragging
            ? 'border-[#FF00FF] bg-[#FF00FF]/10 scale-[1.02]'
            : 'border-black bg-[#f4f4f0] hover:border-[#FF69B4] hover:bg-white'
          }
        `}
        role="button"
        tabIndex={0}
        aria-label="Upload PDF file"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) inputRef.current?.click();
          }
        }}
      >
        <div className="text-6xl">{isDragging ? '📥' : '📄'}</div>
        <div className="text-center">
          <p className="font-black uppercase text-xl">
            {isDragging ? 'DROP PDF HERE' : 'DROP PDF HERE'}
          </p>
          <p className="font-bold uppercase text-sm mt-2 bg-black text-white inline-block px-2 py-1">
            or Browse Files
          </p>
        </div>
        <p className="text-xs font-bold uppercase opacity-60">
          Max {formatFileSize(MAX_PDF_SIZE_BYTES)} • Digital PDFs only
        </p>
        {fileName && (
          <div className="bg-[#00FF00] border-2 border-black px-3 py-1 font-bold text-sm">
            📎 {fileName}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileInput}
        disabled={disabled}
        className="hidden"
        aria-hidden="true"
        id="pdf-file-input"
      />

      {error && (
        <div
          className="bg-[#FF0000] text-white border-4 border-black p-3 font-bold uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          role="alert"
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
