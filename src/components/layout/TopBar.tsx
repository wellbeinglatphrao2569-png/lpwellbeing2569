'use client';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentThaiDate } from '@/utils/thaiDate';
import { profileImageUrl } from '@/utils/personnel';
import ProfilePopup from '@/components/layout/ProfilePopup';

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, isLoggedIn } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const avatar = profileImageUrl(user?.Profile_Image);

  return (
    <header className="sticky top-0 z-40 bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <span className="material-symbols-outlined text-gray-600 dark:text-gray-400">menu</span>
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{getCurrentThaiDate()}</span>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 p-1.5 transition-colors cursor-pointer" aria-label="เปิดโปรไฟล์">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="รูปโปรไฟล์" className="w-8 h-8 rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold">
                  {user?.Full_Name?.charAt(0) || 'ส'}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
                {user?.Full_Name || 'สมชาย รักสุขภาพ'}
              </span>
              <span className="material-symbols-outlined text-base text-gray-400 hidden sm:block">expand_more</span>
            </button>
          ) : (
            <a href="/login" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow">
              <span className="material-symbols-outlined text-base">login</span>
              เข้าสู่ระบบ
            </a>
          )}
        </div>
      </div>
      {profileOpen && <ProfilePopup onClose={() => setProfileOpen(false)} />}
    </header>
  );
}