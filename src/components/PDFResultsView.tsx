import { useMemo } from 'react';
import type { PDFProcessingResult, PDFPIIEntity } from '../core/pdf/types';

interface Props {
  result: PDFProcessingResult;
  fileName: string;
  onReset: () => void;
}

/** Color mapping for entity categories — reuses the same palette as HighlighterView */
const CATEGORY_COLORS: Record<string, string> = {
  'EMAIL': 'bg-[#00FFFF]',
  'PHONE_US': 'bg-[#67D044]',
  'PHONE_IN': 'bg-[#67D044]',
  'SSN': 'bg-[#FF0000] text-white',
  'CREDIT_CARD': 'bg-[#FF00FF] text-white',
  'PERSON': 'bg-[#FFFF00]',
  'ORG': 'bg-[#FF8800]',
  'LOC': 'bg-[#0088FF] text-white',
  'DATE': 'bg-[#FFBBBB]',
  'JWT': 'bg-[#9400D3] text-white',
  'PRIVATE_KEY': 'bg-black text-[#00FF00]',
  'GENERIC_SECRET': 'bg-[#FF4500] text-white',
  'AWS_ACCESS_KEY': 'bg-[#FF9900] text-black',
  'CVV': 'bg-[#FF0000] text-white',
  'EXPIRY_DATE': 'bg-[#FF0000] text-white',
  'SENDGRID_KEY': 'bg-[#0000FF] text-[#00FFFF]',
  'INTERNAL_SYSTEM': 'bg-[#FF6600] text-black',
  'CONFIDENTIAL_PROJECT': 'bg-[#39FF14] text-black',
};
const DEFAULT_COLOR = 'bg-black text-white';

function EntityCard({ entity }: { entity: PDFPIIEntity }) {
  const primaryGroup = entity.entity_group.split('|')[0] || entity.entity_group;
  const normalizedGroup = primaryGroup.replace(/^[BIES]-/, '');
  const colorClass = CATEGORY_COLORS[normalizedGroup] || DEFAULT_COLOR;

  return (
    <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={`inline-block border-2 border-black font-black uppercase text-xs px-2 py-0.5 ${colorClass}`}
        >
          {entity.entity_group}
        </span>
        <span className="text-xs font-bold opacity-60">
          {(entity.score * 100).toFixed(0)}%
        </span>
      </div>

      <div className="font-mono text-sm bg-[#f4f4f0] border-2 border-black p-2 break-all mb-2">
        {entity.word}
      </div>

      <div className="text-xs font-bold uppercase space-y-1 opacity-80">
        <div>Page: {entity.page}</div>
        <div>Offset: {entity.start}–{entity.end}</div>
        {entity.boxes.map((box, i) => (
          <div key={i} className="font-mono text-[10px]">
            Box {i + 1}: x={box.x.toFixed(1)} y={box.y.toFixed(1)} w={box.width.toFixed(1)} h={box.height.toFixed(1)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PDFResultsView({ result, fileName, onReset }: Props) {
  const sortedCategories = useMemo(() => {
    return Object.entries(result.statistics.byCategory)
      .sort(([, a], [, b]) => b - a);
  }, [result.statistics.byCategory]);

  // Group entities by page for display
  const entitiesByPage = useMemo(() => {
    const map = new Map<number, PDFPIIEntity[]>();
    for (const entity of result.entities) {
      const existing = map.get(entity.page) || [];
      existing.push(entity);
      map.set(entity.page, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [result.entities]);

  if (result.type === 'SCANNED') {
    return (
      <div className="space-y-6">
        <div className="bg-[#FFFF00] border-4 border-black p-4 flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <span className="font-black uppercase text-xl">📄 {fileName}</span>
          <button
            onClick={onReset}
            className="bg-white hover:bg-gray-200 border-4 border-black font-bold uppercase px-4 py-1 active:translate-x-[2px] active:translate-y-[2px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all"
            aria-label="Upload another PDF"
          >
            RESET
          </button>
        </div>
        <div
          className="bg-[#FF8800] border-4 border-black p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          role="alert"
        >
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-black uppercase text-xl mb-2">Scanned PDF Detected</p>
          <p className="font-bold uppercase text-sm">
            {result.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="bg-[#FFFF00] border-4 border-black p-4 flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <span className="font-black uppercase text-xl">
          FOUND <span className="bg-[#FF0000] text-white px-2 py-0.5">{result.statistics.total}</span> SENSITIVE ENTITIES
        </span>
        <button
          onClick={onReset}
          className="bg-white hover:bg-gray-200 border-4 border-black font-bold uppercase px-4 py-1 active:translate-x-[2px] active:translate-y-[2px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all"
          aria-label="Upload another PDF"
        >
          RESET
        </button>
      </div>

      {/* File Info */}
      <div className="border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <h3 className="font-black uppercase text-lg border-b-4 border-black pb-2 mb-3">PDF Analysis</h3>
        <div className="grid grid-cols-2 gap-2 text-sm font-bold uppercase">
          <div className="bg-[#f4f4f0] border-2 border-black p-2">File: {fileName}</div>
          <div className="bg-[#f4f4f0] border-2 border-black p-2">Pages: {result.pageCount}</div>
          <div className="bg-[#f4f4f0] border-2 border-black p-2">Type: DIGITAL PDF</div>
          <div className="bg-[#f4f4f0] border-2 border-black p-2">PII Found: {result.statistics.total}</div>
        </div>
      </div>

      {/* Category Breakdown */}
      {sortedCategories.length > 0 && (
        <div className="border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h3 className="font-black uppercase text-lg border-b-4 border-black pb-2 mb-3">Categories</h3>
          <div className="space-y-2">
            {sortedCategories.map(([category, count]) => {
              const normalizedGroup = category.split('|')[0].replace(/^[BIES]-/, '');
              const colorClass = CATEGORY_COLORS[normalizedGroup] || DEFAULT_COLOR;
              return (
                <div key={category} className="flex justify-between items-center border-2 border-black p-2">
                  <span className={`inline-block border-2 border-black font-black uppercase text-xs px-2 py-0.5 ${colorClass}`}>
                    {category}
                  </span>
                  <span className="font-black text-lg">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entity Details by Page */}
      {entitiesByPage.map(([page, entities]) => (
        <div key={page} className="border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h3 className="font-black uppercase text-lg border-b-4 border-black pb-2 mb-3">
            Page {page} <span className="text-sm font-bold opacity-60">({entities.length} entities)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entities.map((entity, idx) => (
              <EntityCard key={`${page}-${idx}`} entity={entity} />
            ))}
          </div>
        </div>
      ))}

      {/* Message if no entities */}
      {result.statistics.total === 0 && !result.message && (
        <div className="bg-[#00FF00] border-4 border-black p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-black uppercase text-xl">No PII Detected</p>
          <p className="font-bold uppercase text-sm mt-2">This PDF appears clean.</p>
        </div>
      )}

      {result.message && (
        <div
          className="bg-[#FF8800] border-4 border-black p-3 font-bold uppercase text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          role="status"
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
