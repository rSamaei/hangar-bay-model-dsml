import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { initMonacoEditor } from '../../editor/monaco-editor';
import type * as monacoNS from 'monaco-editor';

export type MonacoEditorInstance = monacoNS.editor.IStandaloneCodeEditor;

export interface MonacoEditorHandle {
  getValue(): string;
  setValue(value: string): void;
  revealLineInCenter(line: number): void;
}

interface Props {
  initialValue?: string;
  onMount?: (editor: MonacoEditorInstance) => void;
}

export const MonacoEditor = forwardRef<MonacoEditorHandle, Props>(
  function MonacoEditor({ initialValue = '', onMount }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<MonacoEditorInstance | null>(null);

    useImperativeHandle(ref, () => ({
      getValue: () => editorRef.current?.getValue() ?? '',
      setValue: (v: string) => { editorRef.current?.setValue(v); },
      revealLineInCenter: (line: number) => { editorRef.current?.revealLineInCenter(line); },
    }));

    useEffect(() => {
      if (!containerRef.current) return;
      const editor = initMonacoEditor(containerRef.current, initialValue);
      editorRef.current = editor;
      onMount?.(editor);
      return () => {
        editor.dispose();
        editorRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} className="w-full h-full" />;
  }
);
