'use client';
import GlassCard from '@/components/ui/GlassCard';
import { useAuth } from '@/hooks/useAuth';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <GlassCard className="p-8 md:p-12 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-5">
          <span className="material-symbols-outlined text-4xl text-emerald-500">construction</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">อยู่ระหว่างการพัฒนา</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-3">
          ยินดีต้อนรับ คุณ{user?.Prefix ? ` ${user.Prefix}` : ''} {user?.Full_Name || ''}
        </p>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          เมนูสำหรับบทบาทนี้ ({user?.Role === 'Committee' ? 'กรรมการ' : 'บุคคลทั่วไป'}) กำลังจะถูกสร้างขึ้นทีละเมนู โปรดติดตามในลำดับถัดไป
        </p>
        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
          <span className="material-symbols-outlined text-lg">schedule</span>
          ขั้นตอนถัดไป: บันทึกงดหวาน / แดชบอร์ด / นับก้าว
        </div>
      </GlassCard>
    </div>
  );
}
