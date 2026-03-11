import * as monaco from 'monaco-editor';

// Owner token for Monaco's marker model — used to clear our markers only.
const OWNER = 'airfield-lsp';

// Debounce delay in ms before sending a validation request.
const DEBOUNCE_MS = 600;

// ── Response type from /api/diagnostics ──────────────────────────────────────

export interface DiagnosticItem {
  severity: number;    // LSP: 1=error, 2=warning, 3=info, 4=hint
  message: string;
  startLine: number;   // 1-based
  startColumn: number; // 0-based (normalised by backend)
  endLine: number;     // 1-based
  endColumn: number;   // 0-based
  source: 'parser' | 'validator';
}

interface DiagnosticsResponse {
  diagnostics: DiagnosticItem[];
}

// ── Severity mapping ──────────────────────────────────────────────────────────

function toMonacoSeverity(lsp: number): monaco.MarkerSeverity {
  switch (lsp) {
    case 1:  return monaco.MarkerSeverity.Error;
    case 2:  return monaco.MarkerSeverity.Warning;
    case 3:  return monaco.MarkerSeverity.Info;
    case 4:  return monaco.MarkerSeverity.Hint;
    default: return monaco.MarkerSeverity.Error;
  }
}

// SFR rule-ID prefix pattern — e.g. "[SFR13_CONTIGUITY] ..."
const SFR_PREFIX_RE = /^\[(SFR\w+)\]\s*/;

function toMarker(d: DiagnosticItem): monaco.editor.IMarkerData {
  // Monaco columns are 1-based; backend delivers 0-based.
  const startCol = d.startColumn + 1;
  const endCol   = Math.max(startCol + 1, d.endColumn + 1);

  const prefixMatch = SFR_PREFIX_RE.exec(d.message);
  const code    = prefixMatch?.[1];
  const message = prefixMatch ? d.message.slice(prefixMatch[0].length) : d.message;

  return {
    severity:        toMonacoSeverity(d.severity),
    message:         message.trim(),
    startLineNumber: d.startLine,
    startColumn:     startCol,
    endLineNumber:   d.endLine,
    endColumn:       endCol,
    code,
    source: d.source === 'parser' ? 'Airfield (parser)' : 'Airfield (validator)',
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Attach live Langium validation to a Monaco editor instance.
 *
 * On every content change (debounced), it calls POST /api/diagnostics and
 * sets Monaco markers so errors and warnings appear as inline squiggly
 * underlines with hover tooltips.
 *
 * Returns a `Disposable` — call `.dispose()` when the editor is torn down.
 */
export function setupLiveValidation(
  editor: monaco.editor.IStandaloneCodeEditor,
  onDiagnosticsUpdate?: (items: DiagnosticItem[]) => void,
): monaco.IDisposable {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeAbort: AbortController | null = null;

  async function validate(): Promise<void> {
    const model = editor.getModel();
    if (!model) return;

    const code = editor.getValue();
    if (!code.trim()) {
      monaco.editor.setModelMarkers(model, OWNER, []);
      onDiagnosticsUpdate?.([]);
      return;
    }

    // Cancel any in-flight request for an older content version.
    activeAbort?.abort();
    activeAbort = new AbortController();

    try {
      const response = await fetch('/api/diagnostics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dslCode: code }),
        signal:  activeAbort.signal,
      });

      if (!response.ok) return;

      const data: DiagnosticsResponse = await response.json();

      // Only apply markers if the editor still holds the same content.
      const currentModel = editor.getModel();
      if (currentModel && editor.getValue() === code) {
        monaco.editor.setModelMarkers(
          currentModel,
          OWNER,
          data.diagnostics.map(toMarker),
        );
        onDiagnosticsUpdate?.(data.diagnostics);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Network / server errors — silently ignore so the editor keeps working.
    }
  }

  // Debounce: reset timer on every keystroke.
  const contentChangeDisposable = editor.onDidChangeModelContent(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(validate, DEBOUNCE_MS);
  });

  // Run once immediately so freshly-loaded content is validated right away.
  validate();

  return {
    dispose() {
      contentChangeDisposable.dispose();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      activeAbort?.abort();
      const m = editor.getModel();
      if (m) monaco.editor.setModelMarkers(m, OWNER, []);
    },
  };
}
