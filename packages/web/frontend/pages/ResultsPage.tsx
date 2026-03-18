import { useNavigate } from 'react-router-dom';
import { useAnalysis } from '../context/AnalysisContext';
import {
  useAnalysisData,
  SummaryStrip,
  BayTimeline,
  FailuresPanel,
} from '../features/analysis';

export function ResultsPage() {
  const navigate = useNavigate();
  const { result } = useAnalysis();
  const viewModel = useAnalysisData(result);

  if (!viewModel) {
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
    <div className="container mx-auto px-6 py-6 max-w-[1400px]">
      {/* Back + title */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">
          {viewModel.airfieldName} — Analysis
        </h1>
        <button
          onClick={() => navigate('/editor')}
          className="text-sm text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          ← Back to Editor
        </button>
      </div>

      {/* Section 1: Summary Strip */}
      <SummaryStrip
        hangarSummaries={viewModel.hangarSummaries}
        globalSummary={viewModel.globalSummary}
      />

      {/* Section 2: Bay-Level Timeline */}
      <BayTimeline
        hangarGroups={viewModel.hangarGroups}
        bars={viewModel.bars}
        minTime={viewModel.minTime}
        maxTime={viewModel.maxTime}
        timeMarkers={viewModel.timeMarkers}
        failedInductions={viewModel.failedInductions}
      />

      {/* Section 3: Failures Panel */}
      <FailuresPanel failedInductions={viewModel.failedInductions} />
    </div>
  );
}
