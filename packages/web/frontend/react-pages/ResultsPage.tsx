import { useNavigate } from 'react-router-dom';
import { useAnalysis } from '../context/AnalysisContext';

export function ResultsPage() {
  const navigate = useNavigate();
  const { result } = useAnalysis();

  if (!result) {
    return (
      <div className="container mx-auto px-6 py-8 text-center">
        <p className="text-slate-400 mb-4">No analysis results available.</p>
        <button
          onClick={() => navigate('/editor')}
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
        >
          Go to Editor
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <button
        onClick={() => navigate('/editor')}
        className="mb-4 px-4 py-2 text-slate-400 hover:text-white flex items-center gap-2 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Editor
      </button>
      <h1 className="text-2xl font-bold text-white mb-6">Analysis Results</h1>
      <div className="p-8 bg-slate-800/50 border border-slate-700 rounded-xl text-center">
        <p className="text-slate-400">Full results display will be migrated in Phase 6.</p>
        <p className="text-slate-500 text-sm mt-2">
          Violations: {result.report?.summary?.totalViolations ?? 0}
        </p>
      </div>
    </div>
  );
}
