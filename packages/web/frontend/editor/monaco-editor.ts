import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Set up Monaco web worker (editor.worker is all we need for a custom Monarch tokenizer)
(self as any).MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  }
};

const AIRFIELD_LANGUAGE_ID = 'airfield';

const KEYWORDS = [
  // Top-level declarations
  'airfield', 'aircraft', 'clearance', 'hangar', 'accessPath', 'induct',
  // Block section headers
  'doors', 'grid', 'baygrid', 'bay', 'nodes', 'links', 'meta',
  // Dimension properties
  'wingspan', 'length', 'height', 'tailHeight',
  'lateralMargin', 'longitudinalMargin', 'verticalMargin',
  'rows', 'cols', 'width', 'depth',
  // Positional
  'at', 'row', 'col',
  // Graph / connectivity
  'adjacent', 'accessNode', 'node', 'clearanceHeight',
  'link', 'from', 'to', 'bidirectional',
  // Induction properties
  'type', 'into', 'bays', 'via', 'door',
  'id', 'duration', 'minutes', 'hours',
  'prefer', 'after', 'notBefore', 'notAfter',
  // Misc
  'key', 'm',
];

// Enum values / boolean literals rendered in a distinct colour
const TYPE_KEYWORDS = ['tow', 'aisle', 'taxi', 'threshold', 'true', 'false'];

const MONARCH_LANGUAGE: monaco.languages.IMonarchLanguage = {
  keywords: KEYWORDS,
  typeKeywords: TYPE_KEYWORDS,

  tokenizer: {
    root: [
      { include: '@whitespace' },

      // DATETIME literal (e.g. 2024-06-01T08:00) — must precede number rule
      [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'number.date'],

      // auto-induct keyword — hyphenated, must precede identifier rule
      [/auto-induct/, 'keyword'],

      // Identifiers / keywords
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@typeKeywords': 'type',
          '@default': 'identifier',
        },
      }],

      // Double-quoted strings  (e.g. "IND001")
      [/"[^"]*"/, 'string'],
      // Single-quoted strings
      [/'[^']*'/, 'string'],

      // Floating-point before integer
      [/\d+\.\d+/, 'number.float'],
      [/\d+/, 'number'],

      // Brackets & delimiters
      [/[{}]/, '@brackets'],
      [/[;,]/, 'delimiter'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\/.*$/, 'comment'],
      [/\/\*/, { token: 'comment', next: '@blockComment' }],
    ],

    blockComment: [
      [/[^/*]+/, 'comment'],
      [/\/\*/, { token: 'comment', next: '@push' }],
      [/\*\//, { token: 'comment', next: '@pop' }],
      [/[/*]/, 'comment'],
    ],
  },
};

// Dark theme that matches the app's slate-950 background
const AIRFIELD_THEME: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword',      foreground: '7B9EEB', fontStyle: 'bold' },
    { token: 'type',         foreground: 'A78BFA' },
    { token: 'identifier',   foreground: 'E2E8F0' },
    { token: 'string',       foreground: '6ECC8B' },
    { token: 'number',       foreground: 'F59E42' },
    { token: 'number.float', foreground: 'F59E42' },
    { token: 'number.date',  foreground: 'F59E42' },
    { token: 'comment',      foreground: '6B7280', fontStyle: 'italic' },
    { token: 'delimiter',    foreground: '94A3B8' },
    { token: 'white',        foreground: 'FFFFFF' },
  ],
  colors: {
    'editor.background':             '#020617', // slate-950
    'editor.foreground':             '#F1F5F9', // slate-100
    'editorLineNumber.foreground':   '#475569', // slate-600
    'editorLineNumber.activeForeground': '#94A3B8', // slate-400
    'editor.selectionBackground':    '#1E3A5F',
    'editor.lineHighlightBackground':'#0F172A', // slate-900
    'editorCursor.foreground':       '#38BDF8', // sky-400
    'editor.selectionHighlightBackground': '#1E3A5F80',
    'editorBracketMatch.background': '#1E3A5F',
    'editorBracketMatch.border':     '#38BDF8',
    'scrollbarSlider.background':    '#33415580',
    'scrollbarSlider.hoverBackground': '#475569AA',
  },
};

// ── Hover documentation ───────────────────────────────────────────────────────

const HOVER_DOCS: Record<string, string> = {
  airfield:    'Top-level container — wraps all aircraft types, hangars, clearance envelopes, and inductions for one airfield.',
  aircraft:    'Aircraft type definition. Specifies physical dimensions: `wingspan`, `length`, `height`, `tailHeight`.',
  hangar:      'Hangar definition. Contains a `doors` section and a `grid baygrid` section describing its bays.',
  clearance:   'Clearance envelope — extra margin added to an aircraft\'s dimensions during bay/door fit checks.',
  induct:      'Manual induction — schedules a specific aircraft into named bays for a fixed time window.',
  'auto-induct': 'Auto-induction — asks the scheduler to find suitable bays automatically within a time constraint.',
  accessPath:  'Access path topology — describes how doors and bays are connected for dynamic reachability checks.',
  doors:       'Section inside `hangar` that lists its `HangarDoor` entries.',
  door:        'A hangar door. Has `width` and `height` dimensions; optionally an `accessNode` hook.',
  grid:        'Starts the `grid baygrid` section, defining the 2-D arrangement of bays inside a hangar.',
  baygrid:     'Named bay-grid inside a hangar. Declares `rows`, `cols`, and individual bay definitions.',
  bay:         'A single hangar bay. Has `width`, `depth`, `height`, a position (`at row R col C`), optional `adjacent` refs, and an optional `accessNode`.',
  wingspan:    'Horizontal span of the aircraft in metres.',
  length:      'Fore-to-aft length of the aircraft in metres.',
  height:      'Overall height of the aircraft (fuselage top) in metres.',
  tailHeight:  'Height of the highest point on the tail in metres.',
  lateralMargin:      'Extra horizontal clearance added to `wingspan` (from a clearance envelope).',
  longitudinalMargin: 'Extra fore-aft clearance added to `length` (from a clearance envelope).',
  verticalMargin:     'Extra vertical clearance added to `height` (from a clearance envelope).',
  rows:        'Number of rows in a `baygrid`.',
  cols:        'Number of columns in a `baygrid`.',
  width:       'Lateral dimension of a bay or door, in metres.',
  depth:       'Fore-aft dimension of a bay, in metres.',
  bays:        'List of bay names assigned to an induction.',
  into:        'Names the target hangar for an `induct` or `auto-induct` statement.',
  from:        'Start datetime of an induction window (`YYYY-MM-DDTHH:MM`).',
  to:          'End datetime of an induction window (`YYYY-MM-DDTHH:MM`).',
  via:         'Optional: name the hangar door the aircraft uses to enter.',
  duration:    'Requested duration for an `auto-induct` in `minutes` or `hours`.',
  notBefore:   'Earliest permitted start time for an `auto-induct`.',
  notAfter:    'Latest permitted end time for an `auto-induct`.',
  prefer:      'Preferred hangar for an `auto-induct` (scheduler will try it first).',
  adjacent:    'Explicit adjacency list for a bay — used when the grid layout is not sufficient.',
  accessNode:  'Links a door or bay to a node in an `accessPath` for dynamic reachability analysis.',
  bidirectional: 'Makes an `accessPath` link traversable in both directions.',
  m:           'Unit suffix for metre values (e.g. `42 m`).',
  id:          'Optional induction identifier string — required for `precedingInductions` references.',
};

// ── Completion snippets ───────────────────────────────────────────────────────

function buildSnippets(range: monaco.IRange): monaco.languages.CompletionItem[] {
  const snip = (
    label: string,
    insertText: string,
    detail: string,
  ): monaco.languages.CompletionItem => ({
    label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail,
    range,
  });

  return [
    snip(
      'airfield (block)',
      [
        'airfield ${1:AirfieldName} {',
        '\t$0',
        '}',
      ].join('\n'),
      'Top-level airfield block',
    ),
    snip(
      'aircraft (block)',
      [
        'aircraft ${1:AircraftName} {',
        '\twingspan ${2:20} m',
        '\tlength   ${3:15} m',
        '\theight   ${4:4} m',
        '\ttailHeight ${5:5} m',
        '}',
      ].join('\n'),
      'Aircraft type definition',
    ),
    snip(
      'clearance (block)',
      [
        'clearance ${1:EnvelopeName} {',
        '\tlateralMargin      ${2:1} m',
        '\tlongitudinalMargin ${3:1} m',
        '\tverticalMargin     ${4:0.5} m',
        '}',
      ].join('\n'),
      'Clearance envelope definition',
    ),
    snip(
      'hangar (block)',
      [
        'hangar ${1:HangarName} {',
        '\tdoors {',
        '\t\tdoor ${2:MainDoor} width ${3:30} m height ${4:10} m',
        '\t}',
        '\tgrid baygrid rows ${5:1} cols ${6:3} {',
        '\t\tbay ${7:Bay1} width ${8:10} m depth ${9:15} m height ${10:10} m at row 1 col 1',
        '\t}',
        '}',
      ].join('\n'),
      'Hangar with doors and bay grid',
    ),
    snip(
      'induct (statement)',
      'induct ${1:AircraftType} into ${2:HangarName} bays ${3:Bay1} from ${4:2024-01-01T08:00} to ${5:2024-01-01T16:00};',
      'Manual induction statement',
    ),
    snip(
      'induct id (statement)',
      'induct id "${1:IND001}" ${2:AircraftType} into ${3:HangarName} bays ${4:Bay1} from ${5:2024-01-01T08:00} to ${6:2024-01-01T16:00};',
      'Manual induction with explicit ID',
    ),
    snip(
      'auto-induct (statement)',
      'auto-induct ${1:AircraftType} into ${2:HangarName} duration ${3:480} minutes;',
      'Auto-scheduled induction',
    ),
    snip(
      'accessPath (block)',
      [
        'accessPath ${1:PathName} {',
        '\tnodes {',
        '\t\tnode ${2:N1}',
        '\t\tnode ${3:N2}',
        '\t}',
        '\tlinks {',
        '\t\tlink ${2:N1} to ${3:N2} bidirectional true',
        '\t}',
        '}',
      ].join('\n'),
      'Access path topology for bay reachability checks',
    ),
  ];
}

// ── Language feature registration ─────────────────────────────────────────────

let languageRegistered = false;

function registerAirfieldLanguage(): void {
  if (languageRegistered) return;
  languageRegistered = true;

  monaco.languages.register({ id: AIRFIELD_LANGUAGE_ID, extensions: ['.air'] });
  monaco.languages.setMonarchTokensProvider(AIRFIELD_LANGUAGE_ID, MONARCH_LANGUAGE);
  monaco.editor.defineTheme('airfield-dark', AIRFIELD_THEME);

  // ── Completion provider ────────────────────────────────────────────────────

  monaco.languages.registerCompletionItemProvider(AIRFIELD_LANGUAGE_ID, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      };

      // Plain keyword completions
      const keywordItems: monaco.languages.CompletionItem[] = [
        // All regular keywords
        ...[...KEYWORDS, 'auto-induct'].map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          detail: HOVER_DOCS[kw] ? HOVER_DOCS[kw].split('.')[0] : undefined,
          range,
        })),
        // Type/enum keywords
        ...TYPE_KEYWORDS.map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.EnumMember,
          insertText: kw,
          range,
        })),
      ];

      return {
        suggestions: [...keywordItems, ...buildSnippets(range)],
      };
    },
  });

  // ── Code action provider (quick fixes) ────────────────────────────────────

  interface RestEdit {
    startLine: number; startColumn: number;
    endLine: number;   endColumn: number;
    newText: string;
  }
  interface RestAction {
    title: string;
    isPreferred: boolean;
    edits: RestEdit[];
  }

  monaco.languages.registerCodeActionProvider(AIRFIELD_LANGUAGE_ID, {
    async provideCodeActions(model, _range, context) {
      // Only handle validator markers that carry an SFR code
      const relevant = context.markers.filter(
        m => typeof m.code === 'string' && (m.code as string).startsWith('SFR'),
      );
      if (relevant.length === 0) return { actions: [], dispose() {} };

      const dslCode = model.getValue();
      const diagnostics = relevant.map(m => ({
        // Reconstruct the full message the backend code-action provider expects
        message:     `[${m.code as string}] ${m.message}`,
        startLine:   m.startLineNumber,        // 1-based
        startColumn: m.startColumn - 1,        // Monaco 1-based → 0-based
      }));

      try {
        const resp = await fetch('/api/code-actions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ dslCode, diagnostics }),
        });
        if (!resp.ok) return { actions: [], dispose() {} };

        const data: { actions: RestAction[] } = await resp.json();

        const actions: monaco.languages.CodeAction[] = data.actions.map(a => ({
          title:       a.title,
          kind:        'quickfix',
          isPreferred: a.isPreferred,
          edit: {
            edits: a.edits.map(e => ({
              resource: model.uri,
              textEdit: {
                range: {
                  startLineNumber: e.startLine,
                  startColumn:     e.startColumn + 1,   // 0-based → Monaco 1-based
                  endLineNumber:   e.endLine,
                  endColumn:       e.endColumn + 1,
                },
                text: e.newText,
              },
            })),
          },
        }));

        return { actions, dispose() {} };
      } catch {
        return { actions: [], dispose() {} };
      }
    },
  });

  // ── Hover provider ────────────────────────────────────────────────────────

  monaco.languages.registerHoverProvider(AIRFIELD_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const doc = HOVER_DOCS[word.word];
      if (!doc) return null;

      return {
        range: new monaco.Range(
          position.lineNumber, word.startColumn,
          position.lineNumber, word.endColumn,
        ),
        contents: [
          { value: `**\`${word.word}\`** — Airfield DSL keyword` },
          { value: doc },
        ],
      };
    },
  });
}

// ── Editor factory ────────────────────────────────────────────────────────────

/**
 * Create a Monaco editor instance in the given container.
 * Registers the Airfield language (once), completion provider, and hover
 * provider, then returns the editor so the caller can call getValue() / setValue().
 */
export function initMonacoEditor(
  container: HTMLElement,
  initialContent: string,
): monaco.editor.IStandaloneCodeEditor {
  registerAirfieldLanguage();

  const editor = monaco.editor.create(container, {
    value: initialContent,
    language: AIRFIELD_LANGUAGE_ID,
    theme: 'airfield-dark',
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineNumbers: 'on',
    wordWrap: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    insertSpaces: true,
    bracketPairColorization: { enabled: true },
    renderWhitespace: 'none',
    padding: { top: 40 }, // leaves room for the decorative mac-style dots above
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    renderLineHighlight: 'gutter',
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    // Mount floating widgets (autocomplete, hover) to document.body so they
    // aren't clipped by the overflow:hidden flex wrapper.
    fixedOverflowWidgets: true,
  });

  return editor;
}

export type MonacoEditorInstance = monaco.editor.IStandaloneCodeEditor;
