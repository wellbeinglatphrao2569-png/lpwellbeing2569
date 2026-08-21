'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { isAdmin, isCommittee, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const mainItems = [
    { href: '/dashboard', label: 'แดชบอร์ด', icon: 'dashboard' },
    { href: '/weight-after', label: 'ชั่งน้ำหนัก/BMI', icon: 'monitor_weight' },
    { href: '/steps', label: 'นับก้าวสร้างสุข', icon: 'directions_walk' },
    ...(isAdmin || isCommittee ? [{ href: '/no-sugar', label: 'พุธนี้ไม่มีเชื่อม', icon: 'event_busy' }] : []),
  ];

  const adminItems = isAdmin
    ? [
        { href: '/admin/personnel', label: 'จัดการบุคลากร', icon: 'group_add' },
        { href: '/admin/batch-steps', label: 'บันทึกนับก้าวแบบกลุ่ม', icon: 'upload' },
        { href: '/admin/verify-steps', label: 'ตรวจสอบนับก้าว', icon: 'verified_user' },
        { href: '/admin/verify-history', label: 'ประวัติตรวจสอบนับก้าว', icon: 'history' },
      ]
    : [];

  const renderItems = (items: { href: string; label: string; icon: string }[]) =>
    items.map(item => {
      const isActive = pathname.startsWith(item.href);
      return (
        <Link key={item.href} href={item.href}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-200 sidebar-link
            ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          onClick={onClose}>
          <span className="material-symbols-outlined text-lg">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      );
    });

  return (
    <aside className="flex flex-col h-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-r border-gray-100 dark:border-gray-800">
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="ลาดพร้าวสร้างสุข" className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-emerald-200/50" />
          <div>
            <h1 className="font-bold text-emerald-700 dark:text-emerald-400 text-base leading-tight">ลาดพร้าวสร้างสุข</h1>
            <p className="text-[10px] text-gray-400 tracking-wider">LADPRAO HAPPY</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden">
            <span className="material-symbols-outlined text-gray-400">close</span>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {renderItems(mainItems)}

        {adminItems.length > 0 && (
          <>
            <div className="pt-5 mt-4 border-t border-gray-100 dark:border-gray-800 px-4 pb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400">badge</span>
              <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 tracking-wider">เจ้าหน้าที่ นสส.</span>
            </div>
            {renderItems(adminItems)}
          </>
        )}

        {mainItems.length === 0 && adminItems.length === 0 && (
          <div className="px-4 py-6 text-center">
            <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-3xl">construction</span>
            <p className="text-xs text-gray-400 mt-2">เมนูสำหรับบทบาทนี้อยู่ระหว่างการพัฒนา</p>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
        <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
          <span className="material-symbols-outlined text-lg">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
          <span>{theme === 'light' ? 'โหมดมืด' : 'โหมดสว่าง'}</span>
        </button>
        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
          <span className="material-symbols-outlined text-lg">logout</span>
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}
