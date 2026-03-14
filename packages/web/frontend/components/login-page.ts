import { router } from '../router';
import { login, isLoggedIn } from '../services/auth';
import { createNavbar } from './navbar';

export function createLoginPage(): string {
  // Redirect if already logged in
  if (isLoggedIn()) {
    setTimeout(() => router.navigate('dashboard'), 0);
    return '<div class="min-h-screen bg-slate-900 flex items-center justify-center"><p class="text-white">Redirecting...</p></div>';
  }

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      ${createNavbar()}
      <main class="flex-1 flex items-center justify-center px-6 py-12">
        <div class="w-full max-w-md">
          <div class="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 shadow-xl">
            <div class="text-center mb-8">
              <div class="w-16 h-16 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-cyan-500/25 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
                </svg>
              </div>
              <h2 class="text-2xl font-bold text-white mb-2">Welcome Back</h2>
              <p class="text-slate-400">Sign in to manage your airfield</p>
            </div>

            <form id="login-form" class="space-y-6">
              <div>
                <label for="username" class="block text-sm font-medium text-slate-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  required
                  autocomplete="username"
                  class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all outline-none"
                  placeholder="Enter your username"
                />
              </div>

              <div id="login-error" class="hidden text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3"></div>

              <button
                type="submit"
                id="login-btn"
                class="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                Continue
              </button>
            </form>

            <p class="mt-6 text-center text-sm text-slate-400">
              No password required. Just enter a username to continue.
            </p>
          </div>
        </div>
      </main>
    </div>
  `;
}

export function attachLoginPageListeners(): void {
  // Attach navbar listeners for the DSL Editor link
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = (btn as HTMLElement).dataset.nav as any;
      router.navigate(route);
    });
  });

  const form = document.getElementById('login-form') as HTMLFormElement;
  const usernameInput = document.getElementById('username') as HTMLInputElement;
  const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
  const errorDiv = document.getElementById('login-error') as HTMLDivElement;

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = usernameInput.value.trim();
      if (!username) {
        showError('Please enter a username');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in...';
      errorDiv.classList.add('hidden');

      try {
        await login(username);
        router.navigate('dashboard');
      } catch (error: any) {
        showError(error.message || 'Login failed. Please try again.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Continue';
      }
    });
  }

  function showError(message: string): void {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
  }
}
