'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
    const saved = localStorage.getItem('ladprao_user');
    if (saved) setUser(JSON.parse(saved)); // eslint-disable-line react-hooks/set-state-in-effect
    setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><span className="loading loading-spinner loading-lg text-emerald-600"></span></div>;

  const login = (u: User) => { setUser(u); localStorage.setItem('ladprao_user', JSON.stringify(u)); };
  const logout = () => { setUser(null); localStorage.removeItem('ladprao_user'); };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isAdmin: user?.Role === 'Admin', isCommittee: user?.Role === 'Committee', isExecutive: false, isHead: false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
