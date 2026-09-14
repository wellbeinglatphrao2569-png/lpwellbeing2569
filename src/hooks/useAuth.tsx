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

  const login = useCallback((u: User) => {
    setUser(u);
    try {
      localStorage.setItem('ladprao_user', JSON.stringify(u));
      if ((u as any).Device_Token) localStorage.setItem('ladprao_session', String((u as any).Device_Token));
    } catch {}
  }, []);
  const logout = useCallback(() => {
    try {
      const uid = user?.User_ID ? String(user.User_ID) : '';
      const token = (() => { try { return localStorage.getItem('ladprao_session') || ''; } catch { return ''; } })();
      if (uid && token) {
        // fire-and-forget ล้าง token ฝั่ง server
        import('@/services/api').then(m => (m as any).postDataJson?.('logout', { User_ID: uid, Device_Token: token }).catch(() => {})).catch(() => {});
      }
    } catch {}
    setUser(null);
    try { localStorage.removeItem('ladprao_user'); localStorage.removeItem('ladprao_session'); } catch {}
  }, [user]);

  // Single-device poll: ถ้าโดนเตะให้ redirect ไป /login?kicked=1
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const check = async () => {
      if (cancelled || document.hidden) return;
      const token = (() => { try { return localStorage.getItem('ladprao_session') || ''; } catch { return ''; } })();
      const uid = user.User_ID ? String(user.User_ID) : '';
      if (!uid || !token) return;
      try {
        const { postDataJson } = await import('@/services/api');
        const res: any = await postDataJson('validate-session', { User_ID: uid, Device_Token: token });
        if (cancelled) return;
        if (res && res.valid === false) {
          // โดนเตะ — ล้างแล้ว redirect
          try { localStorage.removeItem('ladprao_user'); localStorage.removeItem('ladprao_session'); } catch {}
          setUser(null);
          window.location.href = '/login?kicked=1';
        }
      } catch {}
    };
    // ตรวจทันทีหลัง login และทุก 60s
    check();
    timer = setInterval(check, 60000);
    const onVis = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [user]);

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
