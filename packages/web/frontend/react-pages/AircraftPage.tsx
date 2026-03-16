import { useEffect, useState } from 'react';
import {
  getAircraft, createAircraft, updateAircraft, deleteAircraft,
  type Aircraft, type CreateAircraftData,
} from '../services/aircraft-api';

type View = 'list' | 'form';

function AircraftForm({
  editing,
  onSave,
  onCancel,
}: {
  editing: Aircraft | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    name: editing?.name ?? '',
    wingspan: editing?.wingspan != null ? String(editing.wingspan) : '',
    length: editing?.length != null ? String(editing.length) : '',
    height: editing?.height != null ? String(editing.height) : '',
    tailHeight: editing?.tail_height != null ? String(editing.tail_height) : '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function numField(label: string, key: string, placeholder: string) {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
        <input
          type="number"
          step="0.1"
          min="0"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          required
          className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
        />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const data: CreateAircraftData = {
      name: form.name,
      wingspan: parseFloat(form.wingspan),
      length: parseFloat(form.length),
      height: parseFloat(form.height),
      tailHeight: parseFloat(form.tailHeight),
    };
    try {
      if (editing) {
        await updateAircraft(editing.id, data);
      } else {
        await createAircraft(data);
      }
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to save aircraft');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Aircraft
        </button>
        <h1 className="text-3xl font-bold text-white mb-8">
          {editing ? 'Edit Aircraft' : 'Add Aircraft'}
        </h1>
        <form onSubmit={handleSubmit} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Aircraft Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Boeing 737"
              required
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {numField('Wingspan (m)', 'wingspan', '35.8')}
            {numField('Length (m)', 'length', '38.0')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {numField('Height (m)', 'height', '12.5')}
            {numField('Tail Height (m)', 'tailHeight', '12.5')}
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</p>
          )}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50"
            >
              {loading ? 'Saving...' : editing ? 'Update Aircraft' : 'Create Aircraft'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AircraftPage() {
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<Aircraft | null>(null);
  const [list, setList] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setList(await getAircraft());
    } catch (err) {
      console.error('Failed to load aircraft:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setView('form'); }
  function openEdit(a: Aircraft) { setEditing(a); setView('form'); }
  async function handleSave() { await load(); setView('list'); }
  function handleCancel() { setView('list'); }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this aircraft?')) return;
    try {
      await deleteAircraft(id);
      setList(l => l.filter(a => a.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete aircraft');
    }
  }

  if (view === 'form') {
    return <AircraftForm editing={editing} onSave={handleSave} onCancel={handleCancel} />;
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Aircraft</h1>
          <p className="text-slate-400">Manage your aircraft fleet</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
        >
          Add Aircraft
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <p className="text-slate-400 mb-4">No aircraft defined yet</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors"
          >
            Add your first aircraft
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.map(aircraft => (
            <div key={aircraft.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/30 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">{aircraft.name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(aircraft)}
                    className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(aircraft.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ['Wingspan', aircraft.wingspan],
                  ['Length', aircraft.length],
                  ['Height', aircraft.height],
                  ['Tail Height', aircraft.tail_height],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label} className="bg-slate-900/50 rounded-lg p-3">
                    <span className="text-slate-400 text-xs">{label}</span>
                    <p className="text-white font-medium">{val}m</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
