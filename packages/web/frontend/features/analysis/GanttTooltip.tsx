import { createPortal } from 'react-dom';
import type { TooltipState } from './types';
import { formatDuration, formatDateShort, humanizeReason } from './humanize';

interface GanttTooltipProps {
  tooltip: TooltipState | null;
}

const TOOLTIP_WIDTH = 320;
const TOOLTIP_EST_HEIGHT = 160;
const PAD = 12;

function computePosition(x: number, y: number): { left: number; top: number } {
  let left = x + PAD;
  let top = y - TOOLTIP_EST_HEIGHT - PAD;
  if (left + TOOLTIP_WIDTH > window.innerWidth - PAD) left = x - TOOLTIP_WIDTH - PAD;
  if (top < PAD) top = y + PAD;
  return { left, top };
}

export function GanttTooltip({ tooltip }: GanttTooltipProps) {
  if (!tooltip) return null;

  const { bar, x, y } = tooltip;
  const { left, top } = computePosition(x, y);

  const durationMs = bar.endMs - bar.startMs;
  const durationMin = durationMs / 60_000;
  const isWaiting = bar.type === 'waiting';
  const isDelay = bar.type === 'departure-delay';

  const startLabel = formatDateShort(new Date(bar.startMs));
  const endLabel = formatDateShort(new Date(bar.endMs));
  const durationLabel = formatDuration(durationMin);

  const bayList = bar.bayNames.join(', ') || '—';
  const doorPart = bar.doorName ? ` via ${bar.doorName}` : '';

  const waitReason = humanizeReason(bar.waitReason);
  const delayReason = humanizeReason(bar.departureDelayReason);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        pointerEvents: 'none',
        background: '#0f172a',
        border: '1px solid #475569',
        borderRadius: 8,
        boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
        padding: '10px 12px',
        maxWidth: TOOLTIP_WIDTH,
        minWidth: 200,
      }}
    >
      {/* Header */}
      <p style={{ fontWeight: 600, color: '#fff', fontSize: 14, marginBottom: 2 }}>
        {bar.aircraftType}
      </p>
      <p style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
        {bar.inductionId}
      </p>

      {/* Location */}
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 2 }}>
        {bar.hangarName} → {bayList}{doorPart}
      </p>

      {/* Time range */}
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>
        {startLabel} → {endLabel}{' '}
        <span style={{ color: '#64748b' }}>({durationLabel})</span>
      </p>

      {/* Waiting info */}
      {(isWaiting || (bar.waitTimeMinutes ?? 0) > 0) && (
        <div style={{ marginBottom: 6 }}>
          <p style={{ color: '#fb923c', fontSize: 11, fontWeight: 500 }}>
            ⏳ Waited {formatDuration(bar.waitTimeMinutes ?? 0)}
          </p>
          {waitReason && (
            <p style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>
              {waitReason}
            </p>
          )}
        </div>
      )}

      {/* Departure delay info */}
      {(isDelay || (bar.departureDelayMinutes ?? 0) > 0) && (
        <div>
          <p style={{ color: '#f59e0b', fontSize: 11, fontWeight: 500 }}>
            🔴 Departure delayed {formatDuration(bar.departureDelayMinutes ?? 0)}
          </p>
          {delayReason && (
            <p style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>
              {delayReason}
            </p>
          )}
        </div>
      )}

      {/* Placement attempts (if retried) */}
      {(bar.placementAttempts ?? 0) > 1 && (
        <p style={{ color: '#64748b', fontSize: 10, marginTop: 6 }}>
          {bar.placementAttempts} placement attempts
        </p>
      )}
    </div>,
    document.body
  );
}
