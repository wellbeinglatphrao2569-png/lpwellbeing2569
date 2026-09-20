'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import Footer from '@/components/layout/Footer';
import { useMaintenance } from '@/hooks/useMaintenance';
import MaintenanceOverlay from '@/components/maintenance/MaintenanceOverlay';
import DeveloperControlPanel from '@/components/maintenance/DeveloperControlPanel';
import DevBypassHandler from '@/components/maintenance/DevBypassHandler';
import './globals.css';

// รอบนี้ระบบเปิดใช้งานเฉพาะหน้า Login, หน้าใช้งานทั่วไป และหน้าของเจ้าหน้าที่ นสส.
// เพิ่ม: /dashboard และ /dashboard/* เป็นสาธารณะ (ดูได้ไม่ต้อง login)
const allowedRoutes = ['/dashboard', '/home', '/admin', '/steps', '/no-sugar', '/weight-after'];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return true;
  return false;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublicRoute = isPublicPath(pathname);
  const isAllowed = allowedRoutes.some(r => pathname.startsWith(r));
  const homePath = '/dashboard';

  // Maintenance Mode interceptor — ทุกหน้าถูกบล็อกเมื่อ is_maintenance_active=true ยกเว้น bypass
  const { settings, setSettings, loading: maintenanceLoading, isBypass, shouldBlock } = useMaintenance();

  useEffect(() => {
    if (!isLoggedIn) {
      if (!isPublicRoute) router.replace('/login');
    } else {
      if (!isPublicRoute && !isAllowed) router.replace(homePath);
    }
  }, [isLoggedIn, isPublicRoute, isAllowed, homePath, router]);

  // helper: wrap เนื้อหาปกติ + maintenance overlay + dev panel
  const wrapWithMaintenance = (inner: React.ReactNode) => (
    <>
      {inner}
      {/* User Maintenance Interceptor — เต็มจอ บล็อกทุกอย่าง */}
      {shouldBlock && (
        <MaintenanceOverlay title={settings.maintenance_title} message={settings.maintenance_message} />
      )}
      {/* Dev Floating Panel — เห็นเฉพาะเมื่อ bypass */}
      {isBypass && (
        <DeveloperControlPanel settings={settings} onSettingsChange={setSettings} onSaved={setSettings} />
      )}
      {/* Dev banner เล็กเมื่อ bypass และไม่ถูกบล็อก — แจ้งว่า dev mode active */}
      {isBypass && !shouldBlock && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9997] px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg border border-white/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> โหมดผู้พัฒนา — Bypass เปิดอยู่
        </div>
      )}
    </>
  );

  if (isPublicRoute) {
    if (pathname.startsWith('/dashboard')) {
      return wrapWithMaintenance(
        <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 to-cyan-50/50 dark:from-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 flex overflow-x-hidden">
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          <div className={`fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="hidden md:flex md:w-[260px] md:flex-col md:fixed md:inset-y-0">
            <Sidebar />
          </div>
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
    return wrapWithMaintenance(<>{children}</>);
  }
  if (!isLoggedIn) {
    return wrapWithMaintenance(
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-gray-900 dark:to-gray-950">
        <div className="flex flex-col items-center gap-3">
          <span className="loading loading-spinner loading-lg text-emerald-600"></span>
          <p className="text-sm text-gray-500">กำลังตรวจสอบสิทธิ์ — กำลังไปหน้าเข้าสู่ระบบ...</p>
        </div>
      </div>
    );
  }

  return wrapWithMaintenance(
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 to-cyan-50/50 dark:from-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100 flex overflow-x-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300 md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>
      <div className="hidden md:flex md:w-[260px] md:flex-col md:fixed md:inset-y-0">
        <Sidebar />
      </div>
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
            <Suspense fallback={null}>
              <DevBypassHandler />
            </Suspense>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
