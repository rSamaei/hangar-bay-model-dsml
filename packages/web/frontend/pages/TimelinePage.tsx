import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSchedule } from '../services/scheduling-api';
import { analyzeModel, type AnalysisResult } from '../services/api';
import { useAnalysisData, BayTimeline } from '../features/analysis';

function TimelineContent({ result }: { result: AnalysisResult }) {
  const viewModel = useAnalysisData(result);
  if (!viewModel) return null;
  return (
    <BayTimeline
      hangarGroups={viewModel.hangarGroups}
      bars={viewModel.bars}
      minTime={viewModel.minTime}
      maxTime={viewModel.maxTime}
      timeMarkers={viewModel.timeMarkers}
      failedInductions={viewModel.failedInductions}
    />
  );
}

export function TimelinePage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const schedule = await getSchedule();
        if (!schedule.dslCode?.trim()) {
          setError('No schedule entries yet. Add aircraft to the schedule first.');
          return;
        }
        const analysisResult = await analyzeModel(schedule.dslCode);
        setResult(analysisResult);
      } catch (err: any) {
        setError(err.message || 'Failed to load timeline data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Schedule Timeline</h1>
        <button
          onClick={() => navigate('/schedule')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Schedule
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
          <svg className="w-6 h-6 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading timeline…
        </div>
      ) : error ? (
        <div className="p-8 bg-slate-800/50 border border-slate-700 rounded-xl text-center">
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/schedule')}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors text-sm"
          >
            Go to Schedule
          </button>
        </div>
      ) : result ? (
        <TimelineContent result={result} />
      ) : null}
    </div>
  );
}
