const TOKEN_KEY = 'airfield_session_token';
const USER_KEY = 'airfield_user';

export interface User {
  id: number;
  username: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser(): User | null {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// Login API call
export async function login(username: string): Promise<{ token: string; user: User }> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();
  setSession(data.token, data.user);
  return data;
}

// Logout API call
export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch {
      // Ignore errors, clear session anyway
    }
  }
  clearSession();
}

// Wrapper for authenticated API calls
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearSession();
    window.location.href = '/#login';
    throw new Error('Session expired');
  }

  return response;
}

// Verify session is still valid
export async function verifySession(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      clearSession();
      return false;
    }

    const data = await response.json();
    // Update local user data
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return true;
  } catch {
    clearSession();
    return false;
  }
}
