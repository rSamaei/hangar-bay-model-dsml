import { router } from '../router';
import { isLoggedIn, logout, getUser } from '../services/auth';
import { getHangars, deleteHangar, createHangar, updateHangar, type Hangar, type CreateHangarData, type CreateBayData } from '../services/hangars-api';

let hangarList: Hangar[] = [];
let editingHangar: Hangar | null = null;
let bays: CreateBayData[] = [];

export function createHangarsListPage(): string {
  if (!isLoggedIn()) {
    setTimeout(() => router.navigate('login'), 0);
    return '<div class="min-h-screen bg-slate-900"></div>';
  }

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('hangars')}
      <main class="container mx-auto px-6 py-8">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-bold text-white mb-2">Hangars</h1>
            <p class="text-slate-400">Manage your hangars and bays</p>
          </div>
          <button id="add-hangar-btn" class="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all">
            Add Hangar
          </button>
        </div>

        <div id="hangar-list" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="col-span-full text-center py-12 text-slate-400">Loading...</div>
        </div>
      </main>
    </div>
  `;
}

export function createHangarFormPage(): string {
  if (!isLoggedIn()) {
    setTimeout(() => router.navigate('login'), 0);
    return '<div class="min-h-screen bg-slate-900"></div>';
  }

  const data = router.getData();
  editingHangar = data?.hangar || null;
  bays = editingHangar?.bays.map(b => ({
    name: b.name,
    width: b.width,
    depth: b.depth,
    height: b.height
  })) || [{ name: 'Bay1', width: 15, depth: 30, height: 15 }];

  const isEditing = !!editingHangar;

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('hangars')}
      <main class="container mx-auto px-6 py-8">
        <div class="max-w-4xl mx-auto">
          <div class="mb-8">
            <button id="back-btn" class="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
              Back to Hangars
            </button>
            <h1 class="text-3xl font-bold text-white">${isEditing ? 'Edit Hangar' : 'Add Hangar'}</h1>
          </div>

          <form id="hangar-form" class="space-y-6">
            <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <label for="name" class="block text-sm font-medium text-slate-300 mb-2">Hangar Name</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value="${editingHangar?.name || ''}"
                class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all outline-none"
                placeholder="e.g., Main Hangar"
              />
            </div>

            <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-white">Bays</h3>
                <button type="button" id="add-bay-btn" class="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm">
                  + Add Bay
                </button>
              </div>

              <div id="bays-container" class="space-y-4">
                ${renderBaysForm()}
              </div>
            </div>

            <div id="form-error" class="hidden text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3"></div>

            <div class="flex gap-4">
              <button
                type="submit"
                class="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all"
              >
                ${isEditing ? 'Update Hangar' : 'Create Hangar'}
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

function renderBaysForm(): string {
  return bays.map((bay, index) => `
    <div class="bay-item bg-slate-900/50 border border-slate-700 rounded-lg p-4" data-index="${index}">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-slate-300">Bay ${index + 1}</span>
        ${bays.length > 1 ? `
          <button type="button" class="remove-bay-btn p-1 text-slate-400 hover:text-red-400 transition-colors" data-index="${index}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        ` : ''}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label class="block text-xs text-slate-400 mb-1">Name</label>
          <input
            type="text"
            class="bay-name w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
            value="${bay.name}"
            required
          />
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Width (m)</label>
          <input
            type="number"
            class="bay-width w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
            value="${bay.width}"
            step="0.1"
            min="0"
            required
          />
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Depth (m)</label>
          <input
            type="number"
            class="bay-depth w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
            value="${bay.depth}"
            step="0.1"
            min="0"
            required
          />
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Height (m)</label>
          <input
            type="number"
            class="bay-height w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
            value="${bay.height}"
            step="0.1"
            min="0"
            required
          />
        </div>
      </div>
    </div>
  `).join('');
}

function createNavbar(active: string): string {
  const user = getUser();
  return `
    <nav class="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
      <div class="container mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
              </svg>
            </div>
            <div>
              <h1 class="text-lg font-bold text-white">Airfield Manager</h1>
              <p class="text-xs text-slate-400">Hangars</p>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <nav class="hidden md:flex items-center gap-2">
              <button data-nav="dashboard" class="px-3 py-2 ${active === 'dashboard' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300 hover:text-white hover:bg-slate-800'} rounded-lg text-sm font-medium transition-colors">Dashboard</button>
              <button data-nav="aircraft" class="px-3 py-2 ${active === 'aircraft' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300 hover:text-white hover:bg-slate-800'} rounded-lg text-sm font-medium transition-colors">Aircraft</button>
              <button data-nav="hangars" class="px-3 py-2 ${active === 'hangars' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300 hover:text-white hover:bg-slate-800'} rounded-lg text-sm font-medium transition-colors">Hangars</button>
              <button data-nav="schedule" class="px-3 py-2 ${active === 'schedule' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300 hover:text-white hover:bg-slate-800'} rounded-lg text-sm font-medium transition-colors">Schedule</button>
            </nav>

            <div class="flex items-center gap-3 pl-4 border-l border-slate-700">
              <span class="text-sm text-slate-300">${user?.username || ''}</span>
              <button id="logout-btn" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Logout">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

function renderHangarList(): void {
  const container = document.getElementById('hangar-list');
  if (!container) return;

  if (hangarList.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
          </svg>
        </div>
        <p class="text-slate-400 mb-4">No hangars defined yet</p>
        <button id="empty-add-btn" class="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors">
          Add your first hangar
        </button>
      </div>
    `;

    document.getElementById('empty-add-btn')?.addEventListener('click', () => {
      router.navigate('hangar-form');
    });
    return;
  }

  container.innerHTML = hangarList.map(hangar => `
    <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-blue-500/30 transition-colors">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-white">${hangar.name}</h3>
          <p class="text-sm text-slate-400">${hangar.bays.length} bay${hangar.bays.length !== 1 ? 's' : ''}</p>
        </div>
        <div class="flex gap-2">
          <button data-edit="${hangar.id}" class="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors" title="Edit">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
          <button data-delete="${hangar.id}" class="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        ${hangar.bays.map(bay => `
          <div class="bg-slate-900/50 rounded-lg px-3 py-2 text-sm">
            <span class="text-white font-medium">${bay.name}</span>
            <span class="text-slate-400 text-xs ml-2">${bay.width}x${bay.depth}x${bay.height}m</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Attach edit/delete handlers
  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.edit!, 10);
      const hangar = hangarList.find(h => h.id === id);
      if (hangar) {
        router.navigate('hangar-form', { hangar });
      }
    });
  });

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt((btn as HTMLElement).dataset.delete!, 10);
      if (confirm('Are you sure you want to delete this hangar?')) {
        try {
          await deleteHangar(id);
          hangarList = hangarList.filter(h => h.id !== id);
          renderHangarList();
        } catch (error: any) {
          alert(error.message || 'Failed to delete hangar');
        }
      }
    });
  });
}

export async function attachHangarsListListeners(): Promise<void> {
  attachNavListeners();

  try {
    hangarList = await getHangars();
    renderHangarList();
  } catch (error) {
    console.error('Failed to load hangars:', error);
  }

  document.getElementById('add-hangar-btn')?.addEventListener('click', () => {
    router.navigate('hangar-form');
  });
}

export async function attachHangarFormListeners(): Promise<void> {
  attachNavListeners();

  const form = document.getElementById('hangar-form') as HTMLFormElement;
  const errorDiv = document.getElementById('form-error') as HTMLDivElement;
  const baysContainer = document.getElementById('bays-container') as HTMLDivElement;

  document.getElementById('back-btn')?.addEventListener('click', () => {
    router.navigate('hangars');
  });

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    router.navigate('hangars');
  });

  document.getElementById('add-bay-btn')?.addEventListener('click', () => {
    bays.push({ name: `Bay${bays.length + 1}`, width: 15, depth: 30, height: 15 });
    baysContainer.innerHTML = renderBaysForm();
    attachBayListeners();
  });

  function attachBayListeners(): void {
    baysContainer.querySelectorAll('.remove-bay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt((btn as HTMLElement).dataset.index!, 10);
        bays.splice(index, 1);
        baysContainer.innerHTML = renderBaysForm();
        attachBayListeners();
      });
    });
  }

  attachBayListeners();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');

    const name = (document.getElementById('name') as HTMLInputElement).value;

    // Collect bay data from form
    const bayItems = baysContainer.querySelectorAll('.bay-item');
    const formBays: CreateBayData[] = [];

    bayItems.forEach((item) => {
      formBays.push({
        name: (item.querySelector('.bay-name') as HTMLInputElement).value,
        width: parseFloat((item.querySelector('.bay-width') as HTMLInputElement).value),
        depth: parseFloat((item.querySelector('.bay-depth') as HTMLInputElement).value),
        height: parseFloat((item.querySelector('.bay-height') as HTMLInputElement).value)
      });
    });

    const data: CreateHangarData = { name, bays: formBays };

    try {
      if (editingHangar) {
        await updateHangar(editingHangar.id, data);
      } else {
        await createHangar(data);
      }
      router.navigate('hangars');
    } catch (error: any) {
      errorDiv.textContent = error.message || 'Failed to save hangar';
      errorDiv.classList.remove('hidden');
    }
  });
}

function attachNavListeners(): void {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = (btn as HTMLElement).dataset.nav as any;
      router.navigate(route);
    });
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
    router.navigate('login');
  });
}
