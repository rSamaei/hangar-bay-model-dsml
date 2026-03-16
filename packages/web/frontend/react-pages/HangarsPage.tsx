import { useEffect, useState } from 'react';
import {
  getHangars, createHangar, updateHangar, deleteHangar,
  type Hangar, type CreateHangarData, type CreateBayData,
} from '../services/hangars-api';

type View = 'list' | 'form';

function HangarForm({
  editing,
  onSave,
  onCancel,
}: {
  editing: Hangar | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [bays, setBays] = useState<CreateBayData[]>(
    editing?.bays.map(b => ({ name: b.name, width: b.width, depth: b.depth, height: b.height }))
    ?? [{ name: 'Bay1', width: 15, depth: 30, height: 15 }]
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateBay(index: number, field: keyof CreateBayData, value: string) {
    setBays(prev => prev.map((b, i) =>
      i === index
        ? { ...b, [field]: field === 'name' ? value : (value === '' ? 0 : parseFloat(value)) }
        : b
    ));
  }

  function addBay() {
    setBays(prev => [...prev, { name: `Bay${prev.length + 1}`, width: 15, depth: 30, height: 15 }]);
  }

  function removeBay(index: number) {
    setBays(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const data: CreateHangarData = { name, bays };
    try {
      if (editing) {
        await updateHangar(editing.id, data);
      } else {
        await createHangar(data);
      }
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to save hangar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Hangars
        </button>
        <h1 className="text-3xl font-bold text-white mb-8">
          {editing ? 'Edit Hangar' : 'Add Hangar'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">Hangar Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Main Hangar"
              required
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all outline-none"
            />
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Bays</h3>
              <button
                type="button"
                onClick={addBay}
                className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
              >
                + Add Bay
              </button>
            </div>

            <div className="space-y-4">
              {bays.map((bay, index) => (
                <div key={index} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-slate-300">Bay {index + 1}</span>
                    {bays.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBay(index)}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {([
                      ['Name', 'name', 'text'],
                      ['Width (m)', 'width', 'number'],
                      ['Depth (m)', 'depth', 'number'],
                      ['Height (m)', 'height', 'number'],
                    ] as [string, keyof CreateBayData, string][]).map(([label, field, type]) => (
                      <div key={field}>
                        <label className="block text-xs text-slate-400 mb-1">{label}</label>
                        <input
                          type={type}
                          step={type === 'number' ? '0.1' : undefined}
                          min={type === 'number' ? '0' : undefined}
                          value={String(bay[field])}
                          onChange={e => updateBay(index, field, e.target.value)}
                          required
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</p>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              {loading ? 'Saving...' : editing ? 'Update Hangar' : 'Create Hangar'}
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

export function HangarsPage() {
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<Hangar | null>(null);
  const [list, setList] = useState<Hangar[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setList(await getHangars());
    } catch (err) {
      console.error('Failed to load hangars:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setView('form'); }
  function openEdit(h: Hangar) { setEditing(h); setView('form'); }
  async function handleSave() { await load(); setView('list'); }
  function handleCancel() { setView('list'); }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this hangar?')) return;
    try {
      await deleteHangar(id);
      setList(l => l.filter(h => h.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete hangar');
    }
  }

  if (view === 'form') {
    return <HangarForm editing={editing} onSave={handleSave} onCancel={handleCancel} />;
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Hangars</h1>
          <p className="text-slate-400">Manage your hangars and bays</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all"
        >
          Add Hangar
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-slate-400 mb-4">No hangars defined yet</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
          >
            Add your first hangar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {list.map(hangar => (
            <div key={hangar.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-blue-500/30 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{hangar.name}</h3>
                  <p className="text-sm text-slate-400">
                    {hangar.bays.length} bay{hangar.bays.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(hangar)}
                    className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(hangar.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {hangar.bays.map(bay => (
                  <div key={bay.id} className="bg-slate-900/50 rounded-lg px-3 py-2 text-sm">
                    <span className="text-white font-medium">{bay.name}</span>
                    <span className="text-slate-400 text-xs ml-2">{bay.width}×{bay.depth}×{bay.height}m</span>
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
