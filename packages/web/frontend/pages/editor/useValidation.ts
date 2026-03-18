import { useEffect, useState } from 'react';
import { setupLiveValidation, type DiagnosticItem } from '../../editor/diagnostics';
import type { MonacoEditorInstance } from './MonacoEditor';

export type { DiagnosticItem };

/**
 * Attaches live Langium validation to a Monaco editor instance.
 * Cleans up automatically when the editor changes or the component unmounts.
 */
export function useValidation(editor: MonacoEditorInstance | null): DiagnosticItem[] {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);

  useEffect(() => {
    if (!editor) return;
    const disposable = setupLiveValidation(editor, setDiagnostics);
    return () => {
      disposable.dispose();
      setDiagnostics([]);
    };
  }, [editor]);

  return diagnostics;
}
