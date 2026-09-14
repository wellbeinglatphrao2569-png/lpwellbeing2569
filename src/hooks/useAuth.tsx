'use client';
import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null; isLoggedIn: boolean;
  isAdmin: boolean; isCommittee: boolean; isExecutive: boolean; isHead: boolean;
  login: (u: User) => void; logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, isLoggedIn: false,
  isAdmin: false, isCommittee: false, isExecutive: false, isHead: false,
  login: () => {}, logout: () => {}
});



export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ladprao_user');
      if (saved) setUser(JSON.parse(saved));
    } catch {}
    setLoading(false);
  }, []);

  const login = useCallback((u: User) => { setUser(u); try { localStorage.setItem('ladprao_user', JSON.stringify(u)); } catch {} }, []);
  const logout = useCallback(() => { setUser(null); try { localStorage.removeItem('ladprao_user'); } catch {} }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isLoggedIn: !!user,
    isAdmin: user?.Role === 'Admin',
    isCommittee: user?.Role === 'Committee',
    isExecutive: false,
    isHead: false,
    login,
    logout,
  }), [user, login, logout]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><span className="loading loading-spinner loading-lg text-emerald-600"></span></div>;

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
