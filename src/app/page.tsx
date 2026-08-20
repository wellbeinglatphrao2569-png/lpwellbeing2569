'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function HomePage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    router.replace(isLoggedIn ? '/dashboard' : '/login');
  }, [isLoggedIn, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-900 to-teal-900">
      <div className="flex flex-col items-center gap-4">
        <span className="loading loading-spinner loading-lg text-emerald-400"></span>
        <p className="text-emerald-200/60">กำลังโหลด...</p>
      </div>
    </div>
  );
}
