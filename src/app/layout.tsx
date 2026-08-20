'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import Footer from '@/components/layout/Footer';
import './globals.css';

// รอบนี้ระบบเปิดใช้งานเฉพาะหน้า Login, หน้าใช้งานทั่วไป และหน้าของเจ้าหน้าที่ นสส. (เมนูอื่นจะถูกสร้างทีละเมนูต่อไป)
const publicRoutes = ['/login'];
const allowedRoutes = ['/dashboard', '/home', '/admin', '/steps', '/no-sugar'];

function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublicRoute = publicRoutes.includes(pathname);
  const isAllowed = allowedRoutes.some(r => pathname.startsWith(r));
  const homePath = '/dashboard';

  useEffect(() => {
    if (!isLoggedIn) {
      if (!isPublicRoute) router.replace('/login');
    } else {
      // กันการเข้าถึงหน้าอื่น ๆ ที่ยังไม่ได้เปิดใช้งาน
      if (isPublicRoute || !isAllowed) router.replace(homePath);
    }
  }, [isLoggedIn, isPublicRoute, isAllowed, homePath, router]);

  if (isPublicRoute) return <>{children}</>;
  if (!isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 to-cyan-50/50 dark:from-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 flex overflow-x-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Mobile drawer */}
      <div className={`fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-[260px] md:flex-col md:fixed md:inset-y-0">
        <Sidebar />
      </div>
      {/* Main content */}
      <div className="flex-1 flex flex-col md:ml-[260px] min-w-0 h-dvh overflow-y-auto">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-8 overflow-x-hidden">
          <div className="max-w-6xl mx-auto w-full">
            {children}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ลาดพร้าวสร้างสุข - Ladprao Happy</title>
        <meta name="description" content="ระบบสร้างเสริมสุขภาวะองค์กร สำนักงานเขตลาดพร้าว กรุงเทพมหานคร" />
        <link rel="icon" href="/Logo.png" type="image/png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
