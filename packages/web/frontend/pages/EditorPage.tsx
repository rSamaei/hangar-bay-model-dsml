import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalysis } from '../context/AnalysisContext';
import { useNotification } from '../context/NotificationContext';
import { analyzeModel, parseModel, type AnalysisResult } from '../services/api';
import { examples, loadExample, type Example } from '../services/examples';
import { getSchedule } from '../services/scheduling-api';
import { MonacoEditor, type MonacoEditorHandle, type MonacoEditorInstance } from './editor/MonacoEditor';
import { useValidation } from './editor/useValidation';
import { ProblemsPanel } from './editor/ProblemsPanel';

// ── Example categories ─────────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: 'basic',
    label: 'Basic',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    color: 'emerald',
    classes: {
      bg: 'bg-emerald-500/10', border: 'border-emerald-500/30',
      hoverBorder: 'hover:border-emerald-500/60', icon: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300',
    },
  },
  {
    key: 'auto-scheduling',
    label: 'Auto-Scheduling',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'cyan',
    classes: {
      bg: 'bg-cyan-500/10', border: 'border-cyan-500/30',
      hoverBorder: 'hover:border-cyan-500/60', icon: 'text-cyan-400',
      badge: 'bg-cyan-500/20 text-cyan-300',
    },
  },
  {
    key: 'complex',
    label: 'Complex',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    color: 'purple',
    classes: {
      bg: 'bg-purple-500/10', border: 'border-purple-500/30',
      hoverBorder: 'hover:border-purple-500/60', icon: 'text-purple-400',
      badge: 'bg-purple-500/20 text-purple-300',
    },
  },
  {
    key: 'validation',
    label: 'Validation',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    color: 'amber',
    classes: {
      bg: 'bg-amber-500/10', border: 'border-amber-500/30',
      hoverBorder: 'hover:border-amber-500/60', icon: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300',
    },
  },
] as const;

// ── EditorPage ─────────────────────────────────────────────────────────────

const PANEL_DEFAULT = 200;
const PANEL_MIN = 60;
const PANEL_MAX = 420;
const CONTAINER_HEIGHT = 680;
const DIVIDER_HEIGHT = 24;

export function EditorPage() {
  const navigate = useNavigate();
  const { setResult } = useAnalysis();
  const { showToast } = useNotification();

  // Monaco
  const editorRef = useRef<MonacoEditorHandle>(null);
  const [editorInstance, setEditorInstance] = useState<MonacoEditorInstance | null>(null);
  const diagnostics = useValidation(editorInstance);

  // Examples
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Panel layout
  const [panelHeight, setPanelHeight] = useState(PANEL_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'problems' | 'schedule'>('problems');

  // Drag state
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(PANEL_DEFAULT);

  // Action state
  const [analyzing, setAnalyzing] = useState(false);
  const [panelAnalyzing, setPanelAnalyzing] = useState(false);
  const [parseStatus, setParseStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [scheduleResult, setScheduleResult] = useState<AnalysisResult | null>(null);

  // ── Drag handlers ────────────────────────────────────────────────────────

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = collapsed ? 0 : panelHeight;
    if (collapsed) setCollapsed(false);
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = dragStartY.current - e.clientY;
      setPanelHeight(Math.max(PANEL_MIN, Math.min(PANEL_MAX, dragStartH.current + delta)));
    }
    function onMouseUp() {
      dragging.current = false;
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleLoadExample(example: Example) {
    try {
      const content = await loadExample(example.file);
      editorRef.current?.setValue(content);
      setSelectedId(example.id);
      setParseStatus(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to load example', 'error');
    }
  }

  async function handleParse() {
    const code = editorRef.current?.getValue() ?? '';
    if (!code.trim()) return;
    setParseStatus(null);
    try {
      const result = await parseModel(code);
      const diags: any[] = (result as any).diagnostics ?? [];
      const errCount = diags.filter((d: any) => d.severity === 1).length;
      setParseStatus(
        errCount === 0
          ? { ok: true,  message: `Parsed successfully (${diags.length} diagnostic${diags.length !== 1 ? 's' : ''})` }
          : { ok: false, message: `${errCount} error${errCount !== 1 ? 's' : ''} found` }
      );
    } catch (err: any) {
      setParseStatus({ ok: false, message: err.message || 'Parse failed' });
    }
  }

  const handleAnalyze = useCallback(async () => {
    const code = editorRef.current?.getValue() ?? '';
    if (!code.trim()) return;
    setAnalyzing(true);
    setParseStatus(null);
    try {
      const result = await analyzeModel(code);
      setResult(result);
      navigate('/results');
    } catch (err: any) {
      setParseStatus({ ok: false, message: err.message || 'Analysis failed' });
    } finally {
      setAnalyzing(false);
    }
  }, [navigate, setResult]);

  async function handleLoadFromSchedule() {
    try {
      const schedule = await getSchedule();
      if (schedule.dslCode) {
        editorRef.current?.setValue(schedule.dslCode);
        setParseStatus(null);
      } else {
        setParseStatus({ ok: false, message: 'No DSL code available from schedule' });
      }
    } catch (err: any) {
      setParseStatus({ ok: false, message: err.message || 'Failed to load from schedule' });
    }
  }

  async function handlePanelAnalyze() {
    const code = editorRef.current?.getValue() ?? '';
    if (!code.trim()) return;
    setPanelAnalyzing(true);
    setParseStatus(null);
    try {
      const result = await analyzeModel(code);
      setScheduleResult(result);
      setActiveTab('schedule');
      if (collapsed) setCollapsed(false);
    } catch (err: any) {
      setParseStatus({ ok: false, message: err.message || 'Analysis failed' });
    } finally {
      setPanelAnalyzing(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto px-6 py-8">

      {/* ── Examples ── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Select an Example</h2>
          {selectedId && (
            <span className="text-sm text-slate-400">
              {examples.find(e => e.id === selectedId)?.name}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {CATEGORIES.map(cat => {
            const c = cat.classes;
            return examples
              .filter(e => e.category === cat.key)
              .map(example => (
                <button
                  key={example.id}
                  onClick={() => handleLoadExample(example)}
                  className={`group relative p-4 rounded-xl border ${c.border} ${c.hoverBorder} ${c.bg} text-left transition-all duration-200 hover:scale-[1.02] ${selectedId === example.id ? 'ring-2 ring-cyan-500/50 ring-offset-1 ring-offset-slate-900' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
                      <svg className={`w-4 h-4 ${c.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.icon} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-sm truncate mb-1">{example.name}</h3>
                      <p className="text-xs text-slate-400 line-clamp-2">{example.description}</p>
                      <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs ${c.badge}`}>
                        {cat.label}
                      </span>
                    </div>
                  </div>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </button>
              ));
          })}
        </div>
      </section>

      {/* ── Editor + Panel container ── */}
      <section className="mb-4">
        <h2 className="text-xl font-bold text-white mb-4">DSL Editor</h2>

        <div
          className="rounded-xl border border-slate-700 flex flex-col overflow-hidden"
          style={{ height: CONTAINER_HEIGHT }}
        >
          {/* Monaco pane */}
          <div className="relative min-h-0 flex-1">
            {/* macOS-style dots */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <MonacoEditor
              ref={editorRef}
              initialValue=""
              onMount={setEditorInstance}
            />
          </div>

          {/* Drag divider */}
          <div
            onMouseDown={onDividerMouseDown}
            className="relative flex items-center justify-center bg-slate-800/80 border-t border-b border-slate-700 cursor-row-resize select-none flex-shrink-0"
            style={{ height: DIVIDER_HEIGHT }}
          >
            <div className="w-12 h-1 rounded-full bg-slate-600 pointer-events-none" />
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setCollapsed(c => !c)}
              className="absolute right-2 p-1 rounded hover:bg-slate-700 transition-colors text-slate-400"
              title="Toggle problems panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={collapsed ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
                />
              </svg>
            </button>
          </div>

          {/* Problems panel */}
          <ProblemsPanel
            diagnostics={diagnostics}
            panelHeight={panelHeight}
            collapsed={collapsed}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onDiagnosticClick={line => editorRef.current?.revealLineInCenter(line)}
            onPanelAnalyze={handlePanelAnalyze}
            panelAnalyzing={panelAnalyzing}
            scheduleResult={scheduleResult}
          />
        </div>
      </section>

      {/* ── Action buttons ── */}
      <div className="flex justify-between items-center gap-3 mt-4">
        <button
          onClick={handleLoadFromSchedule}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-medium rounded-xl transition-all border border-slate-700 hover:border-slate-600 flex items-center gap-2 text-sm"
          title="Load the current schedule's DSL into the editor"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Load from Schedule
        </button>

        <div className="flex gap-3 items-center">
          {parseStatus && (
            <span className={`text-sm ${parseStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {parseStatus.message}
            </span>
          )}
          <button
            onClick={handleParse}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-all border border-slate-700 hover:border-slate-600 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Parse Only
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="px-8 py-3 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {analyzing ? 'Analysing…' : 'Analyse & Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
