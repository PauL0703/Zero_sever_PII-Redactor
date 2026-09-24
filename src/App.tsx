import { useEffect, useState } from 'react';
import * as Comlink from 'comlink';
import { getHardwareDiagnostics, type HardwareDiagnostics } from './core/diagnostics';
import DiagnosticsCard from './components/DiagnosticsCard';
import HighlighterView from './components/HighlighterView';
import PDFUpload from './components/PDFUpload';
import PDFResultsView from './components/PDFResultsView';
import type { PIIEntity } from './core/types';
import type { PDFProcessingResult, PDFProgressEvent } from './core/pdf/types';
import type { ProgressCallback } from './worker';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const api = Comlink.wrap<any>(worker);

type InputMode = 'text' | 'pdf';

function App() {
  const [diagnostics, setDiagnostics] = useState<HardwareDiagnostics | null>(null);
  const [appState, setAppState] = useState<'idle' | 'initializing' | 'ready' | 'processing' | 'done'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  
  const [inputText, setInputText] = useState<string>('');
  const [entities, setEntities] = useState<PIIEntity[]>([]);

  // PDF-specific state
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [pdfResult, setPdfResult] = useState<PDFProcessingResult | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [pdfProgress, setPdfProgress] = useState<PDFProgressEvent | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDiagnostics() {
      const result = await getHardwareDiagnostics();
      setDiagnostics(result);
    }
    fetchDiagnostics();
  }, []);

  const handleInitialize = async () => {
    if (!diagnostics) return;
    setAppState('initializing');
    
    const onProgress: ProgressCallback = Comlink.proxy((msg) => {
      if (msg.status === 'downloading' || msg.status === 'progress') {
        if (msg.total && msg.loaded) {
          setProgress(Math.round((msg.loaded / msg.total) * 100));
          setProgressText(`DOWNLOADING ${msg.file || 'MODEL'}`);
        }
      } else if (msg.status === 'done') {
        setProgress(100);
        setProgressText(`LOADED ${msg.file || 'MODEL'}`);
      } else if (msg.status === 'ready') {
        setAppState('ready');
      }
    });

    const success = await api.initEngine(diagnostics, onProgress);
    if (success) {
      setAppState('ready');
    } else {
      alert("FAILED TO INITIALIZE AI ENGINE");
      setAppState('idle');
    }
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setAppState('processing');
    try {
      const results: PIIEntity[] = await api.sanitizeDocument(inputText);
      setEntities(results);
      setAppState('done');
    } catch (e) {
      console.error(e);
      alert("ERROR PROCESSING DOCUMENT");
      setAppState('ready');
    }
  };

  const handlePDFSelected = async (buffer: ArrayBuffer, fileName: string) => {
    setPdfError(null);
    setPdfResult(null);
    setPdfFileName(fileName);
    setAppState('processing');
    setPdfProgress({ status: 'loading', progress: 0, message: 'Loading PDF...' });

    try {
      const onPdfProgress = Comlink.proxy((event: PDFProgressEvent) => {
        setPdfProgress(event);
        setProgress(event.progress || 0);
        setProgressText(event.message || event.status.toUpperCase());
      });

      const result: PDFProcessingResult = await api.processPDF(buffer, onPdfProgress);
      setPdfResult(result);
      setPdfProgress(null);
      setAppState('done');
    } catch (e) {
      console.error('PDF processing error:', e);
      const message = e instanceof Error ? e.message : 'Unknown error processing PDF.';
      setPdfError(message);
      setPdfProgress(null);
      setAppState('ready');
    }
  };

  const handlePDFReset = () => {
    setPdfResult(null);
    setPdfFileName('');
    setPdfError(null);
    setPdfProgress(null);
    setAppState('ready');
  };

  const applyRedactions = async () => {
    if (!entities.length) return;
    
    let redactedText = '';
    let cursor = 0;
    const sorted = [...entities].sort((a, b) => a.start - b.start);
    
    for (const entity of sorted) {
      if (entity.start < cursor) continue;
      redactedText += inputText.substring(cursor, entity.start);
      redactedText += '[REDACTED]';
      cursor = entity.end;
    }
    redactedText += inputText.substring(cursor);
    
    try {
      await navigator.clipboard.writeText(redactedText);
      alert('REDACTED TEXT COPIED TO CLIPBOARD!');
    } catch (err) {
      console.error(err);
      alert('FAILED TO COPY');
    }
  };

  const handleModeSwitch = (mode: InputMode) => {
    if (appState === 'processing') return;
    setInputMode(mode);
    // Reset mode-specific state when switching
    if (mode === 'text') {
      setPdfResult(null);
      setPdfFileName('');
      setPdfError(null);
      setPdfProgress(null);
    } else {
      setEntities([]);
    }
    if (appState === 'done') {
      setAppState('ready');
    }
  };

  const isEngineActive = appState === 'ready' || appState === 'processing' || appState === 'done';

  return (
    <div className="min-h-screen bg-[#f4f4f0] text-black font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-6xl md:text-6xl font-black uppercase tracking-tighter">CENSORED</h1>
          <p className="text-m font-bold uppercase mt-2 bg-black text-white inline-block px-2 py-1">Zero-Server PII Sanitization</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Diagnostics & Controls */}
          <div className="space-y-6">
            <DiagnosticsCard diagnostics={diagnostics} />

            <div className="border-4 border-black bg-[#FFFF00] p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <h2 className="font-black uppercase text-2xl mb-4 border-b-4 border-black pb-2">AI Engine Control</h2>
              
              {appState === 'idle' && (
                <button 
                  onClick={handleInitialize}
                  disabled={!diagnostics}
                  className="w-full bg-[#FFFFFF] hover:bg-[#00CCCC] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none border-4 border-black font-black uppercase py-4 text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Initialize AI Engine"
                >
                  START ENGINE
                </button>
              )}
              
              {appState === 'initializing' && (
                <div aria-live="polite" aria-atomic="true" className="space-y-2">
                  <div className="flex justify-between font-black uppercase text-sm">
                    <span className="truncate pr-2">{progressText || 'INITIALIZING...'}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-6 w-full bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div 
                      className="h-full bg-[#FF00FF] transition-all"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {isEngineActive && (
                <div className="bg-[#FF69B4] border-4 border-black p-3 text-center font-black uppercase text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" role="status">
                  ENGINE ACTIVE
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Analyzer Area */}
          <div className="lg:col-span-2">
            {(appState === 'idle' || appState === 'initializing') ? (
              <div className="border-4 border-black bg-white p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] h-full flex flex-col items-center justify-center text-center">
                <div className="text-8xl mb-6">⚠️</div>
                <h3 className="text-4xl font-black uppercase mb-4">Awaiting Engine</h3>
                <p className="text-xl font-bold uppercase bg-[#FF0000] text-white p-2">Start the engine to scan for PII.</p>
              </div>
            ) : (
              <div className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-6">
                <div className="flex justify-between items-end border-b-4 border-black pb-4">
                  <h2 className="text-3xl font-black uppercase">Document Analyzer</h2>
                  {appState === 'done' && inputMode === 'text' && (
                    <button 
                      onClick={applyRedactions}
                      className="bg-[#00FF00] hover:bg-[#00CC00] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none border-4 border-black font-black uppercase px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                      aria-label="Apply Redactions and Copy"
                    >
                      APPLY REDACTIONS
                    </button>
                  )}
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-0">
                  <button
                    onClick={() => handleModeSwitch('text')}
                    disabled={appState === 'processing'}
                    className={`flex-1 border-4 border-black font-black uppercase py-3 text-lg transition-all ${
                      inputMode === 'text'
                        ? 'bg-[#FF69B4] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-white hover:bg-gray-100'
                    } ${appState === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-label="Switch to text input mode"
                    id="mode-text-btn"
                  >
                    📝 TEXT
                  </button>
                  <button
                    onClick={() => handleModeSwitch('pdf')}
                    disabled={appState === 'processing'}
                    className={`flex-1 border-4 border-l-0 border-black font-black uppercase py-3 text-lg transition-all ${
                      inputMode === 'pdf'
                        ? 'bg-[#FF69B4] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-white hover:bg-gray-100'
                    } ${appState === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-label="Switch to PDF upload mode"
                    id="mode-pdf-btn"
                  >
                    📄 PDF
                  </button>
                </div>
                
                {/* TEXT MODE */}
                {inputMode === 'text' && (
                  <>
                    {appState === 'ready' || appState === 'processing' ? (
                      <div className="space-y-6">
                        <textarea 
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          disabled={appState === 'processing'}
                          className="w-full min-h-[300px] p-4 bg-[#f4f4f0] border-4 border-black font-mono text-lg shadow-[inset_4px_4px_0px_0px_rgba(0,0,0,0.2)] focus:outline-none focus:ring-4 focus:ring-[#FF00FF] disabled:opacity-50"
                          placeholder="PASTE SENSITIVE DOCUMENT HERE..."
                          aria-label="Input document text"
                        />
                        <button 
                          onClick={handleAnalyze}
                          disabled={appState === 'processing'}
                          className="w-full bg-[#FF69B4] hover:bg-[#CC00CC] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none text-white border-4 border-black font-black uppercase py-4 text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-busy={appState === 'processing'}
                        >
                          {appState === 'processing' ? 'SCANNING...' : 'SCAN FOR PII'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-[#FFFF00] border-4 border-black p-4 flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          <span className="font-black uppercase text-xl">
                            FOUND <span className="bg-[#FF0000] text-white px-2 py-0.5">{entities.length}</span> SENSITIVE ENTITIES
                          </span>
                          <button 
                            onClick={() => setAppState('ready')}
                            className="bg-white hover:bg-gray-200 border-4 border-black font-bold uppercase px-4 py-1 active:translate-x-[2px] active:translate-y-[2px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all"
                            aria-label="Scan another document"
                          >
                            RESET
                          </button>
                        </div>
                        <HighlighterView text={inputText} entities={entities} />
                      </div>
                    )}
                  </>
                )}

                {/* PDF MODE */}
                {inputMode === 'pdf' && (
                  <>
                    {(appState === 'ready' || appState === 'processing') && !pdfResult && (
                      <div className="space-y-4">
                        <PDFUpload
                          onFileSelected={handlePDFSelected}
                          disabled={appState === 'processing'}
                        />

                        {/* PDF Progress */}
                        {appState === 'processing' && pdfProgress && (
                          <div className="space-y-2" aria-live="polite" aria-atomic="true">
                            <div className="flex justify-between font-black uppercase text-sm">
                              <span className="truncate pr-2">{pdfProgress.message || pdfProgress.status}</span>
                              <span>{pdfProgress.progress || 0}%</span>
                            </div>
                            <div className="h-6 w-full bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                              <div 
                                className="h-full bg-[#FF00FF] transition-all"
                                style={{ width: `${pdfProgress.progress || 0}%` }}
                              ></div>
                            </div>
                            {pdfProgress.page != null && pdfProgress.totalPages != null && (
                              <div className="text-xs font-bold uppercase text-center opacity-60">
                                Page {pdfProgress.page} / {pdfProgress.totalPages}
                              </div>
                            )}
                          </div>
                        )}

                        {/* PDF Error */}
                        {pdfError && (
                          <div
                            className="bg-[#FF0000] text-white border-4 border-black p-3 font-bold uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                            role="alert"
                          >
                            ⚠️ {pdfError}
                          </div>
                        )}
                      </div>
                    )}

                    {/* PDF Results */}
                    {appState === 'done' && pdfResult && (
                      <PDFResultsView
                        result={pdfResult}
                        fileName={pdfFileName}
                        onReset={handlePDFReset}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
