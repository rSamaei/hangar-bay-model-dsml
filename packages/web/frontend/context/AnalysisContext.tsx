import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AnalysisResult } from '../services/api';

interface AnalysisContextValue {
  result: AnalysisResult | null;
  setResult: (r: AnalysisResult) => void;
  clear: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [result, setResultState] = useState<AnalysisResult | null>(null);

  const setResult = useCallback((r: AnalysisResult) => setResultState(r), []);
  const clear = useCallback(() => setResultState(null), []);

  return (
    <AnalysisContext.Provider value={{ result, setResult, clear }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider');
  return ctx;
}
