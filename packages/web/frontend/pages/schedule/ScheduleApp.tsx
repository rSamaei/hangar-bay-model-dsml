import React, { useEffect, useRef, useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { AircraftSidebar, AircraftCardContent } from './AircraftSidebar';
import { TimelineGrid } from './TimelineGrid';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ScheduleSkeleton, ScheduleError } from './ScheduleSkeleton';
import { Banner } from './Banner';
import { Toast } from './Toast';
import { DurationPopover, type PendingDrop } from './DurationPopover';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { authFetch } from '../../services/auth';
import { router } from '../../router';
import type { Aircraft, DiagnosticItem, Hangar, ScheduleResult, ScheduledPlacement } from './types';

// ─── ScheduleApp ─────────────────────────────────────────────────────────────
function ScheduleApp() {
  // ── Data loading state ─────────────────────────────────────────────────────
  const [aircraft, setAircraft]                       = useState<Aircraft[]>([]);
  const [hangars, setHangars]                         = useState<Hangar[]>([]);
  const [schedule, setSchedule]                       = useState<ScheduleResult | null>(null);
  const [dataLoading, setDataLoading]                 = useState(true);
  const [dataError, setDataError]                     = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger]               = useState(0);

  // ── Sidebar collapse ───────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed]       = useState(() => window.innerWidth < 768);

  // ── DnD state ──────────────────────────────────────────────────────────────
  const [activeAircraft, setActiveAircraft]           = useState<Aircraft | null>(null);
  const [activeBlockPlacement, setActiveBlockPlacement] = useState<ScheduledPlacement | null>(null);
  const [hoveredSlotId, setHoveredSlotId]             = useState<string | null>(null);
  const [pendingDrop, setPendingDrop]                 = useState<PendingDrop | null>(null);

  // ── Selection / delete ─────────────────────────────────────────────────────
  const [selectedEntryId, setSelectedEntryId]         = useState<number | null>(null);
  const [pendingDelete, setPendingDelete]             = useState<number | null>(null);

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const [diagnostics, setDiagnostics]                 = useState<DiagnosticItem[]>([]);
  const [diagnosticsLoading, setDiagnosticsLoading]  = useState(false);

  // ── Panel resize / collapse ────────────────────────────────────────────────
  const [panelHeight, setPanelHeight]                 = useState(180);
  const [panelCollapsed, setPanelCollapsed]           = useState(false);
  const dragStateRef = useRef<{ startY: number; startH: number } | null>(null);
  const savedPanelHeight = useRef(180);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast]                             = useState<{ msg: string; ok: boolean } | null>(null);

  const timelineViewRef = useRef({
    viewStartMs: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })(),
    slotMin: 60,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Responsive sidebar collapse ────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 768) setSidebarCollapsed(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Parallel data load ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    Promise.all([
      authFetch('/api/aircraft').then(r => r.json()).then((d: { aircraft?: Aircraft[] }) => d.aircraft ?? []),
      authFetch('/api/hangars').then(r => r.json()).then((d: { hangars?: Hangar[] }) => d.hangars ?? []),
      authFetch('/api/schedule').then(r => r.json()),
    ])
      .then(([ac, h, s]) => {
        if (cancelled) return;
        setAircraft(ac as Aircraft[]);
        setHangars(h as Hangar[]);
        setSchedule(s as ScheduleResult);
        setDataLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setDataError(err.message ?? 'Failed to load data');
        setDataLoading(false);
      });

    return () => { cancelled = true; };
  }, [retryTrigger]);

  // ── Auto-validate schedule whenever DSL changes ────────────────────────────
  useEffect(() => {
    const dslCode = schedule?.dslCode ?? null;

    if (!dslCode) {
      setDiagnostics([]);
      setDiagnosticsLoading(false);
      return;
    }

    let cancelled = false;
    setDiagnosticsLoading(true);

    authFetch('/api/diagnostics', {
      method: 'POST',
      body: JSON.stringify({ dslCode }),
    })
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setDiagnostics((data as { diagnostics?: DiagnosticItem[] }).diagnostics ?? []);
          setDiagnosticsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDiagnosticsLoading(false);
      });

    return () => { cancelled = true; };
  }, [schedule?.dslCode]);

  // ── Panel drag-resize ──────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragStateRef.current) return;
      const delta = dragStateRef.current.startY - e.clientY;
      const newH  = Math.max(36, Math.min(480, dragStateRef.current.startH + delta));
      setPanelHeight(newH);
      savedPanelHeight.current = newH;
    };
    const onUp = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current           = null;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []);

  // ── Click-outside / Escape deselect ────────────────────────────────────────
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest('[data-keep-selection]')) return;
      setSelectedEntryId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEntryId(null);
        setPendingDelete(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown',   onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown',   onKeyDown);
    };
  }, []);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const handleViewChange = useCallback((viewStartMs: number, slotMin: number) => {
    timelineViewRef.current = { viewStartMs, slotMin };
  }, []);

  function handleDividerMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-panel-collapse]')) return;
    dragStateRef.current           = { startY: e.clientY, startH: panelCollapsed ? 0 : panelHeight };
    document.body.style.cursor     = 'row-resize';
    document.body.style.userSelect = 'none';
    if (panelCollapsed) setPanelCollapsed(false);
  }

  function toggleCollapse() {
    if (panelCollapsed) {
      setPanelCollapsed(false);
      setPanelHeight(savedPanelHeight.current > 36 ? savedPanelHeight.current : 180);
    } else {
      savedPanelHeight.current = panelHeight;
      setPanelCollapsed(true);
    }
  }

  function handleDiagnosticClick(entryId: number | null) {
    if (entryId === null) return;
    setSelectedEntryId(entryId);
    if (panelCollapsed) toggleCollapse();
  }

  function handleViewAsDsl() {
    if (!schedule?.dslCode) return;
    sessionStorage.setItem('schedule_dsl_prefill', schedule.dslCode);
    router.navigate('editor');
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────
  function handleDragStart(e: DragStartEvent) {
    const id   = String(e.active.id);
    const data = e.active.data.current as Record<string, unknown> | undefined;
    if (id.startsWith('block-')) {
      setActiveBlockPlacement((data?.placement as ScheduledPlacement) ?? null);
    } else {
      setActiveAircraft((data?.aircraft as Aircraft) ?? null);
    }
  }

  function handleDragOver(e: DragOverEvent) {
    setHoveredSlotId(e.over ? String(e.over.id) : null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const id             = String(e.active.id);
    const isBlock        = id.startsWith('block-');
    const ac             = activeAircraft;
    const blockPlacement = activeBlockPlacement;

    setActiveAircraft(null);
    setActiveBlockPlacement(null);
    setHoveredSlotId(null);

    if (!e.over) return;
    const slotId = String(e.over.id);

    if (isBlock) {
      if (blockPlacement) handleBlockMove(blockPlacement, slotId);
    } else {
      if (!ac) return;
      const parts = slotId.split('-');
      if (parts.length !== 3) return;
      const slotIdx = parseInt(parts[2], 10);
      if (isNaN(slotIdx)) return;
      const { viewStartMs, slotMin } = timelineViewRef.current;
      setPendingDrop({ aircraft: ac, startMs: viewStartMs + slotIdx * slotMin * 60_000, durationMs: 4 * 3_600_000 });
    }
  }

  function handleDragCancel() {
    setActiveAircraft(null);
    setActiveBlockPlacement(null);
    setHoveredSlotId(null);
  }

  // ── Shared PUT helper ──────────────────────────────────────────────────────
  async function updateEntry(entryId: number, startMs: number, endMs: number): Promise<ScheduleResult | null> {
    const resp = await authFetch(`/api/schedule/entry/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify({
        startTime: new Date(startMs).toISOString(),
        endTime:   new Date(endMs).toISOString(),
      }),
    });
    const result = await resp.json();
    if (!resp.ok) {
      setToast({ msg: (result as { error?: string }).error ?? 'Failed to update', ok: false });
      return null;
    }
    return result as ScheduleResult;
  }

  async function handleBlockMove(placement: ScheduledPlacement, slotId: string) {
    const parts = slotId.split('-');
    if (parts.length !== 3) return;
    const slotIdx = parseInt(parts[2], 10);
    if (isNaN(slotIdx)) return;
    const { viewStartMs, slotMin } = timelineViewRef.current;
    const durationMs = new Date(placement.end).getTime() - new Date(placement.start).getTime();
    const newStartMs = viewStartMs + slotIdx * slotMin * 60_000;
    try {
      const result = await updateEntry(placement.entryId, newStartMs, newStartMs + durationMs);
      if (result) {
        setSchedule(result);
        setToast({ msg: `${placement.aircraftName} moved`, ok: true });
      }
    } catch (err: any) {
      setToast({ msg: err.message ?? 'Failed to move', ok: false });
    }
  }

  async function handleConfirmDrop(hours: number) {
    if (!pendingDrop) return;
    const startTime = new Date(pendingDrop.startMs).toISOString();
    const endTime   = new Date(pendingDrop.startMs + hours * 3_600_000).toISOString();
    const ac        = pendingDrop.aircraft;
    setPendingDrop(null);

    try {
      const resp = await authFetch('/api/schedule/entry', {
        method: 'POST',
        body: JSON.stringify({ aircraftId: ac.id, startTime, endTime }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setToast({ msg: (result as { error?: string }).error ?? 'Failed to schedule', ok: false });
        return;
      }
      const sr = result as ScheduleResult;
      setSchedule(sr);
      const placed = sr.placements.find(p => p.aircraftName === ac.name && p.status === 'scheduled');
      if (placed) {
        setToast({ msg: `${ac.name} scheduled in ${placed.hangar ?? 'hangar'}`, ok: true });
      } else {
        const failed = sr.placements.find(p => p.aircraftName === ac.name);
        setToast({ msg: `Could not place ${ac.name}: ${failed?.failureReason ?? 'no suitable bay'}`, ok: false });
      }
    } catch (err: any) {
      setToast({ msg: err.message ?? 'Failed to schedule', ok: false });
    }
  }

  async function handleDeleteEntry(entryId: number) {
    setPendingDelete(entryId);
  }

  async function handleConfirmDelete() {
    if (pendingDelete === null) return;
    const id = pendingDelete;
    setPendingDelete(null);
    setSelectedEntryId(null);
    try {
      const resp = await authFetch(`/api/schedule/entry/${id}`, { method: 'DELETE' });
      const result = await resp.json();
      if (!resp.ok) {
        setToast({ msg: (result as { error?: string }).error ?? 'Failed to delete', ok: false });
        return;
      }
      setSchedule(result as ScheduleResult);
      setToast({ msg: 'Induction removed', ok: true });
    } catch (err: any) {
      setToast({ msg: err.message ?? 'Failed to delete', ok: false });
    }
  }

  async function handleResizeCommit(entryId: number, startIso: string, endIso: string) {
    try {
      const result = await updateEntry(entryId, new Date(startIso).getTime(), new Date(endIso).getTime());
      if (result) setSchedule(result);
    } catch (err: any) {
      setToast({ msg: err.message ?? 'Failed to resize', ok: false });
    }
  }

  // ── Merge diagnostics ─────────────────────────────────────────────────────
  const allDiagnostics: DiagnosticItem[] = [
    ...(schedule?.schedulerDiagnostics ?? []),
    ...diagnostics,
  ];

  const errorCount   = allDiagnostics.filter(d => d.severity === 1).length;
  const warningCount = allDiagnostics.filter(d => d.severity === 2).length;
  const infoCount    = allDiagnostics.filter(d => d.severity >= 3).length;

  // ── Early returns ──────────────────────────────────────────────────────────
  if (dataLoading) return <ScheduleSkeleton />;
  if (dataError)   return <ScheduleError message={dataError} onRetry={() => setRetryTrigger(t => t + 1)} />;

  const noAircraft = aircraft.length === 0;
  const noHangars  = hangars.length === 0;
  const noEntries  = (schedule?.placements?.length ?? 0) === 0;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">

        {/* ── Toolbar ── */}
        <header className="flex items-center justify-between px-4 h-10 bg-slate-900/80 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <button
              data-keep-selection="1"
              onClick={() => setSidebarCollapsed(c => !c)}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
              title={sidebarCollapsed ? 'Show aircraft panel' : 'Hide aircraft panel'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {schedule?.dslCode && (
              <button
                data-keep-selection="1"
                onClick={handleViewAsDsl}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700/50 transition-colors flex items-center gap-1.5"
                title="Open the generated DSL in the editor"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                View as DSL
              </button>
            )}
          </div>
        </header>

        {/* ── Empty-state banners ── */}
        {noAircraft && (
          <Banner type="warn">
            No aircraft defined.{' '}
            <button
              onClick={() => router.navigate('aircraft')}
              className="underline underline-offset-2 hover:text-amber-200 transition-colors"
            >
              Add aircraft
            </button>{' '}
            before scheduling.
          </Banner>
        )}
        {!noAircraft && noHangars && (
          <Banner type="warn">
            No hangars defined.{' '}
            <button
              onClick={() => router.navigate('hangars')}
              className="underline underline-offset-2 hover:text-amber-200 transition-colors"
            >
              Add hangars
            </button>{' '}
            to enable scheduling.
          </Banner>
        )}
        {!noAircraft && !noHangars && noEntries && (
          <Banner type="info">
            Drag an aircraft from the sidebar onto the timeline to schedule it.
          </Banner>
        )}

        {/* ── Content row: sidebar + main ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <AircraftSidebar
            aircraft={aircraft}
            loading={false}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(c => !c)}
          />

          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <TimelineGrid
                hangars={hangars}
                placements={schedule?.placements ?? []}
                activeAircraft={activeAircraft}
                hoveredSlotId={hoveredSlotId}
                onViewChange={handleViewChange}
                selectedEntryId={selectedEntryId}
                onSelectEntry={setSelectedEntryId}
                onDeleteEntry={handleDeleteEntry}
                onResizeCommit={handleResizeCommit}
              />
            </div>

            {/* ── Drag divider + collapse ── */}
            <div
              className="h-6 flex items-center justify-between px-3 bg-slate-900/95 border-t border-slate-700/50 flex-none select-none cursor-row-resize"
              onMouseDown={handleDividerMouseDown}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Diagnostics
                </span>
                {diagnosticsLoading && (
                  <span className="text-[10px] text-slate-500">validating…</span>
                )}
                {!diagnosticsLoading && errorCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-red-950/80 text-red-400 text-[10px] font-medium">
                    {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </span>
                )}
                {!diagnosticsLoading && warningCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 text-[10px] font-medium">
                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
                {!diagnosticsLoading && infoCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-400 text-[10px] font-medium">
                    {infoCount}
                  </span>
                )}
                {!diagnosticsLoading && allDiagnostics.length === 0 && schedule?.dslCode && (
                  <span className="text-emerald-400 text-[10px]">✓ valid</span>
                )}
              </div>

              <button
                data-panel-collapse="1"
                data-keep-selection="1"
                className="pointer-events-auto p-0.5 text-slate-500 hover:text-white rounded transition-colors"
                onClick={toggleCollapse}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={panelCollapsed ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
                  />
                </svg>
              </button>
            </div>

            {!panelCollapsed && (
              <div
                style={{ height: panelHeight, flexShrink: 0 }}
                className="overflow-hidden bg-slate-950/80 border-t border-slate-800/40"
              >
                <DiagnosticsPanel
                  diagnostics={allDiagnostics}
                  dslCode={schedule?.dslCode ?? null}
                  onClickDiagnostic={handleDiagnosticClick}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── DragOverlay ── */}
      <DragOverlay>
        {activeAircraft ? (
          <div className="w-[220px] rotate-1 shadow-xl shadow-black/50 ring-1 ring-cyan-500/40 rounded-lg">
            <AircraftCardContent aircraft={activeAircraft} />
          </div>
        ) : activeBlockPlacement ? (
          <div className="px-3 py-2 bg-cyan-700/90 border border-cyan-500/60 rounded-lg shadow-xl shadow-black/50 text-xs font-medium text-cyan-50 select-none">
            {activeBlockPlacement.aircraftName}
          </div>
        ) : null}
      </DragOverlay>

      {pendingDrop && (
        <DurationPopover
          drop={pendingDrop}
          onConfirm={handleConfirmDrop}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {pendingDelete !== null && (
        <DeleteConfirmDialog
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {toast && (
        <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />
      )}
    </DndContext>
  );
}

// ─── Mount / unmount ──────────────────────────────────────────────────────────
let reactRoot: ReturnType<typeof ReactDOM.createRoot> | null = null;

export function mountScheduleApp(container: HTMLElement): void {
  reactRoot = ReactDOM.createRoot(container);
  reactRoot.render(React.createElement(ScheduleApp));
}

export function unmountScheduleApp(): void {
  reactRoot?.unmount();
  reactRoot = null;
}
