import { router } from '../router';
import { isLoggedIn } from '../services/auth';
import { getAircraft, deleteAircraft, createAircraft, updateAircraft, type Aircraft, type CreateAircraftData } from '../services/aircraft-api';
import { createNavbar } from './navbar';

let aircraftList: Aircraft[] = [];
let editingAircraft: Aircraft | null = null;

export function createAircraftListPage(): string {
  if (!isLoggedIn()) {
    setTimeout(() => router.navigate('login'), 0);
    return '<div class="min-h-screen bg-slate-900"></div>';
  }

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('aircraft')}
      <main class="container mx-auto px-6 py-8">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-bold text-white mb-2">Aircraft</h1>
            <p class="text-slate-400">Manage your aircraft fleet</p>
          </div>
          <button id="add-aircraft-btn" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/25 transition-all">
            Add Aircraft
          </button>
        </div>

        <div id="aircraft-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="col-span-full text-center py-12 text-slate-400">Loading...</div>
        </div>
      </main>
    </div>
  `;
}

export function createAircraftFormPage(): string {
  if (!isLoggedIn()) {
    setTimeout(() => router.navigate('login'), 0);
    return '<div class="min-h-screen bg-slate-900"></div>';
  }

  const data = router.getData();
  editingAircraft = data?.aircraft || null;
  const isEditing = !!editingAircraft;

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('aircraft')}
      <main class="container mx-auto px-6 py-8">
        <div class="max-w-2xl mx-auto">
          <div class="mb-8">
            <button id="back-btn" class="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
              Back to Aircraft
            </button>
            <h1 class="text-3xl font-bold text-white">${isEditing ? 'Edit Aircraft' : 'Add Aircraft'}</h1>
          </div>

          <form id="aircraft-form" class="bg-slate-800/50 border border-slate-700 rounded-xl p-6 space-y-6">
            <div>
              <label for="name" class="block text-sm font-medium text-slate-300 mb-2">Aircraft Name</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value="${editingAircraft?.name || ''}"
                class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
                placeholder="e.g., Boeing 737"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="wingspan" class="block text-sm font-medium text-slate-300 mb-2">Wingspan (m)</label>
                <input
                  type="number"
                  id="wingspan"
                  name="wingspan"
                  required
                  step="0.1"
                  min="0"
                  value="${editingAircraft?.wingspan || ''}"
                  class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
                  placeholder="35.8"
                />
              </div>
              <div>
                <label for="length" class="block text-sm font-medium text-slate-300 mb-2">Length (m)</label>
                <input
                  type="number"
                  id="length"
                  name="length"
                  required
                  step="0.1"
                  min="0"
                  value="${editingAircraft?.length || ''}"
                  class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
                  placeholder="38.0"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="height" class="block text-sm font-medium text-slate-300 mb-2">Height (m)</label>
                <input
                  type="number"
                  id="height"
                  name="height"
                  required
                  step="0.1"
                  min="0"
                  value="${editingAircraft?.height || ''}"
                  class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
                  placeholder="12.5"
                />
              </div>
              <div>
                <label for="tailHeight" class="block text-sm font-medium text-slate-300 mb-2">Tail Height (m)</label>
                <input
                  type="number"
                  id="tailHeight"
                  name="tailHeight"
                  required
                  step="0.1"
                  min="0"
                  value="${editingAircraft?.tail_height || ''}"
                  class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
                  placeholder="12.5"
                />
              </div>
            </div>

            <div id="form-error" class="hidden text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3"></div>

            <div class="flex gap-4">
              <button
                type="submit"
                class="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
              >
                ${isEditing ? 'Update Aircraft' : 'Create Aircraft'}
              </button>
              <button
                type="button"
                id="cancel-btn"
                class="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  `;
}

function renderAircraftList(): void {
  const container = document.getElementById('aircraft-list');
  if (!container) return;

  if (aircraftList.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
          </svg>
        </div>
        <p class="text-slate-400 mb-4">No aircraft defined yet</p>
        <button id="empty-add-btn" class="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors">
          Add your first aircraft
        </button>
      </div>
    `;

    document.getElementById('empty-add-btn')?.addEventListener('click', () => {
      router.navigate('aircraft-form');
    });
    return;
  }

  container.innerHTML = aircraftList.map(aircraft => `
    <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/30 transition-colors">
      <div class="flex items-start justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">${aircraft.name}</h3>
        <div class="flex gap-2">
          <button data-edit="${aircraft.id}" class="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 rounded-lg transition-colors" title="Edit">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
          <button data-delete="${aircraft.id}" class="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="bg-slate-900/50 rounded-lg p-3">
          <span class="text-slate-400">Wingspan</span>
          <p class="text-white font-medium">${aircraft.wingspan}m</p>
        </div>
        <div class="bg-slate-900/50 rounded-lg p-3">
          <span class="text-slate-400">Length</span>
          <p class="text-white font-medium">${aircraft.length}m</p>
        </div>
        <div class="bg-slate-900/50 rounded-lg p-3">
          <span class="text-slate-400">Height</span>
          <p class="text-white font-medium">${aircraft.height}m</p>
        </div>
        <div class="bg-slate-900/50 rounded-lg p-3">
          <span class="text-slate-400">Tail Height</span>
          <p class="text-white font-medium">${aircraft.tail_height}m</p>
        </div>
      </div>
    </div>
  `).join('');

  // Attach edit/delete handlers
  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.edit!, 10);
      const aircraft = aircraftList.find(a => a.id === id);
      if (aircraft) {
        router.navigate('aircraft-form', { aircraft });
      }
    });
  });

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt((btn as HTMLElement).dataset.delete!, 10);
      if (confirm('Are you sure you want to delete this aircraft?')) {
        try {
          await deleteAircraft(id);
          aircraftList = aircraftList.filter(a => a.id !== id);
          renderAircraftList();
        } catch (error: any) {
          alert(error.message || 'Failed to delete aircraft');
        }
      }
    });
  });
}

export async function attachAircraftListListeners(): Promise<void> {
  // Load aircraft
  try {
    aircraftList = await getAircraft();
    renderAircraftList();
  } catch (error) {
    console.error('Failed to load aircraft:', error);
  }

  // Add button
  document.getElementById('add-aircraft-btn')?.addEventListener('click', () => {
    router.navigate('aircraft-form');
  });
}

export async function attachAircraftFormListeners(): Promise<void> {
  const form = document.getElementById('aircraft-form') as HTMLFormElement;
  const errorDiv = document.getElementById('form-error') as HTMLDivElement;

  document.getElementById('back-btn')?.addEventListener('click', () => {
    router.navigate('aircraft');
  });

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    router.navigate('aircraft');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');

    const formData = new FormData(form);
    const data: CreateAircraftData = {
      name: formData.get('name') as string,
      wingspan: parseFloat(formData.get('wingspan') as string),
      length: parseFloat(formData.get('length') as string),
      height: parseFloat(formData.get('height') as string),
      tailHeight: parseFloat(formData.get('tailHeight') as string)
    };

    try {
      if (editingAircraft) {
        await updateAircraft(editingAircraft.id, data);
      } else {
        await createAircraft(data);
      }
      router.navigate('aircraft');
    } catch (error: any) {
      errorDiv.textContent = error.message || 'Failed to save aircraft';
      errorDiv.classList.remove('hidden');
    }
  });
}
