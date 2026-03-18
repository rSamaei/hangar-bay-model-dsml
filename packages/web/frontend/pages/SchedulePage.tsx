import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAircraft, type Aircraft } from '../services/aircraft-api';
import {
  getSchedule, addScheduleEntry, deleteScheduleEntry, clearSchedule,
  type ScheduleResult, type ScheduledPlacement,
} from '../services/scheduling-api';

function formatDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return iso;
  }
}

function getDefaultDatetime(hoursOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8 + hoursOffset, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlacementBadge({ placement }: { placement: ScheduledPlacement | undefined }) {
  if (!placement) {
    return <span className="px-2 py-1 text-xs rounded-full bg-slate-700 text-slate-400">Pending</span>;
  }
  if (placement.status === 'scheduled') {
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">
        {placement.hangar} › {placement.bays.join(', ')}
      </span>
    );
  }
  return (
    <span
      className="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400"
      title={placement.failureReason || 'Could not place'}
    >
      Failed
    </span>
  );
}

export function SchedulePage() {
  const navigate = useNavigate();
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [entryError, setEntryError] = useState('');

  const [selectedAircraftId, setSelectedAircraftId] = useState('');
  const [startTime, setStartTime] = useState(getDefaultDatetime(0));
  const [endTime, setEndTime] = useState(getDefaultDatetime(2));

  useEffect(() => {
    Promise.all([getAircraft(), getSchedule()])
      .then(([a, s]) => { setAircraft(a); setSchedule(s); })
      .catch(err => console.error('Failed to load schedule data:', err))
      .finally(() => setLoading(false));
  }, []);

  async function handleAddEntry() {
    setEntryError('');
    const aircraftId = parseInt(selectedAircraftId, 10);
    if (!aircraftId) { setEntryError('Please select an aircraft.'); return; }
    if (!startTime || !endTime) { setEntryError('Please specify both start and end times.'); return; }
    if (new Date(startTime) >= new Date(endTime)) { setEntryError('Start time must be before end time.'); return; }

    try {
      const result = await addScheduleEntry({
        aircraftId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      });
      setSchedule(result);
      // Shift times forward by duration
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      const newEnd = new Date(new Date(endTime).getTime() + durationMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      setStartTime(endTime);
      setEndTime(`${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`);
    } catch (err: any) {
      setEntryError(err.message || 'Failed to add entry.');
    }
  }

  async function handleDeleteEntry(id: number) {
    try {
      setSchedule(await deleteScheduleEntry(id));
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  }

  async function handleClear() {
    if (!schedule?.entries.length) return;
    try {
      setSchedule(await clearSchedule());
    } catch (err) {
      console.error('Failed to clear schedule:', err);
    }
  }

  const entries = schedule?.entries ?? [];
  const placed = schedule?.placements.filter(p => p.status === 'scheduled').length ?? 0;
  const failed = schedule?.placements.filter(p => p.status === 'failed').length ?? 0;

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Schedule</h1>
          <p className="text-slate-400">Add aircraft to the schedule and let the engine compute optimal placements</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Clear All
          </button>
          <button
            onClick={() => navigate('/timeline')}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            View Timeline
          </button>
        </div>
      </div>

      {/* Add Entry Form */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Add Schedule Entry</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Aircraft</label>
            <select
              value={selectedAircraftId}
              onChange={e => setSelectedAircraftId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            >
              <option value="">{loading ? 'Loading...' : aircraft.length === 0 ? 'No aircraft defined' : 'Select aircraft...'}</option>
              {aircraft.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.wingspan}m wingspan)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">End Time</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            />
          </div>
          <div>
            <button
              onClick={handleAddEntry}
              className="w-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-medium rounded-lg transition-all"
            >
              Add Entry
            </button>
          </div>
        </div>
        {entryError && (
          <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {entryError}
          </p>
        )}
      </div>

      {/* Schedule Entries */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
            <svg className="w-6 h-6 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading schedule...
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-slate-400 mb-1">No schedule entries yet</p>
            <p className="text-sm text-slate-500">Use the form above to add aircraft to the schedule</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{entries.length} Entries</h2>
              <div className="flex gap-3 text-sm">
                <span className="text-green-400">{placed} placed</span>
                {failed > 0 && <span className="text-red-400">{failed} failed</span>}
              </div>
            </div>
            <div className="divide-y divide-slate-700/50">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                <div className="col-span-3">Aircraft</div>
                <div className="col-span-3">Start</div>
                <div className="col-span-3">End</div>
                <div className="col-span-2">Placement</div>
                <div className="col-span-1" />
              </div>
              {entries.map(entry => {
                const placement = schedule?.placements.find(p => p.entryId === entry.id);
                return (
                  <div key={entry.id} className="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-slate-800/50 transition-colors">
                    <div className="col-span-3">
                      <span className="text-white font-medium">{entry.aircraft_name}</span>
                      <span className="text-slate-500 text-xs ml-1">({entry.wingspan}m)</span>
                    </div>
                    <div className="col-span-3 text-sm text-slate-300">{formatDatetime(entry.start_time)}</div>
                    <div className="col-span-3 text-sm text-slate-300">{formatDatetime(entry.end_time)}</div>
                    <div className="col-span-2"><PlacementBadge placement={placement} /></div>
                    <div className="col-span-1 text-right">
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete entry"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
