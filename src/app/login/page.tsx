'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { postData } from '@/services/api';
import RegisterForm from '@/components/auth/RegisterForm';

type Tab = 'login' | 'register';

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await postData('login', { User_ID: userId, Password: password });
      if (res?.success) {
        login(res.user);
        router.push(res.user?.Role === 'Admin' ? '/admin/personnel' : '/home');
      } else {
        setError(res?.message || 'รหัสผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0e3347] via-[#17536e] to-[#3f8fb0] py-8">
      {/* Animated background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#63bcca]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#3f8fb0]/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#77c1aa]/10 rounded-full blur-2xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-[#63bcca]/10 rounded-full blur-2xl animate-float delay-500" />
        {/* Decorative leaf-like shapes */}
        <svg className="absolute top-10 left-10 w-32 h-32 text-[#63bcca]/10 animate-float" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 0C50 0 100 25 100 75C100 75 75 100 50 100C25 100 0 75 0 75C0 25 50 0 50 0Z" />
        </svg>
        <svg className="absolute bottom-10 right-10 w-40 h-40 text-[#3f8fb0]/10 animate-float delay-1000" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 0C50 0 100 25 100 75C100 75 75 100 50 100C25 100 0 75 0 75C0 25 50 0 50 0Z" />
        </svg>
      </div>

      {/* Login card */}
      <div className={`relative w-full mx-4 animate-scale-in ${tab === 'login' ? 'max-w-md' : 'max-w-2xl'}`}>
        <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/20">
          {/* Logo section */}
          <div className="text-center mb-8">
            <div className="relative inline-flex items-center justify-center mb-5">
              <div className="absolute inset-0 bg-[#63bcca]/30 rounded-full blur-xl animate-pulse" />
              <img src="/Logo.png" alt="ลาดพร้าวสร้างสุข"
                className="relative w-20 h-20 rounded-2xl shadow-lg object-cover ring-2 ring-white/30" />
            </div>
            <h1 className="text-2xl font-bold text-white">ลาดพร้าวสร้างสุข</h1>
            <p className="text-[#bfe6f2]/80 text-sm mt-1.5">สำนักงานเขตลาดพร้าว กรุงเทพมหานคร</p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-2xl bg-white/10 border border-white/15 mb-6">
            {(['login', 'register'] as Tab[]).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  tab === t
                    ? 'bg-gradient-to-r from-[#63bcca] to-[#3f8fb0] text-white shadow-lg'
                    : 'text-[#bfe6f2]/80 hover:text-white'
                }`}>
                {t === 'login' ? 'เข้าสู่ระบบ' : 'ลงทะเบียนยืนยันตัวตน'}
              </button>
            ))}
          </div>

          {tab === 'login' ? (
            <>
              {/* Login form */}
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-[#d6f0f8] block mb-1.5">
                    เลขบัตรประชาชน / รหัสผู้ใช้
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#bfe6f2]/60 text-lg leading-none">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                    </span>
                    <input type="text" value={userId} onChange={e => setUserId(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-[#bfe6f2]/40
                        focus:border-[#63bcca] focus:ring-2 focus:ring-[#63bcca]/30 transition-all outline-none"
                      placeholder="กรุณากรอกรหัสผู้ใช้" required />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-[#d6f0f8] block mb-1.5">รหัสผ่าน</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#bfe6f2]/60 text-lg leading-none">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-[#bfe6f2]/40
                        focus:border-[#63bcca] focus:ring-2 focus:ring-[#63bcca]/30 transition-all outline-none"
                      placeholder="กรุณากรอกรหัสผ่าน" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#bfe6f2]/50 hover:text-white transition-colors">
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/15 border border-red-400/30 rounded-xl px-4 py-3 animate-slide-up">
                    <p className="text-red-200 text-sm text-center">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full text-base inline-flex items-center justify-center gap-2 flex-none rounded-lg py-3 font-semibold text-white
                    bg-gradient-to-r from-[#63bcca] to-[#3f8fb0] border border-[#3f8fb0] shadow-lg transition-all hover:from-[#7ed4e0] hover:to-[#4fa7c6]
                    disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? (
                    <><span className="loading loading-spinner loading-sm"></span> กำลังเข้าสู่ระบบ...</>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                      </svg>
                      เข้าสู่ระบบ
                    </span>
                  )}
                </button>
                <a href="/dashboard" className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white/90 bg-white/10 border border-white/20 hover:bg-white/15 transition-all">
                  <span className="material-symbols-outlined text-lg">visibility</span>
                  ดูแดชบอร์ดสาธารณะโดยไม่ต้องเข้าสู่ระบบ
                </a>
              </form>
            </>
          ) : (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/15 p-5 sm:p-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6">
                <RegisterForm onSuccess={() => setTab('login')} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}