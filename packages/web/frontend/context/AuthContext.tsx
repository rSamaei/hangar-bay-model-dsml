import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import {
  isLoggedIn as checkLoggedIn,
  getUser as fetchUser,
  login as apiLogin,
  logout as apiLogout,
  type User,
} from '../services/auth';

interface AuthContextValue {
  isLoggedIn: boolean;
  user: User | null;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(checkLoggedIn);
  const [user, setUser] = useState<User | null>(fetchUser);

  const login = useCallback(async (username: string) => {
    const result = await apiLogin(username);
    setUser(result.user);
    setLoggedIn(true);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setLoggedIn(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn: loggedIn, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
