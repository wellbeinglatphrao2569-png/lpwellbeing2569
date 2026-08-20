'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
    else if (!isAdmin) router.replace('/home');
  }, [isLoggedIn, isAdmin, router]);

  if (!isLoggedIn || !isAdmin) return null;

  return <>{children}</>;
}
