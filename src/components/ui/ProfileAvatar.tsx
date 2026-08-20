import type { User } from '@/types';
import { profileImageUrl } from '@/utils/personnel';

/** อวาตาร์โปรไฟล์ (รูปจริง หรือตัวอักษรตัวแรก) */
export default function ProfileAvatar({ user, size = 'w-10 h-10' }: { user?: User | null; size?: string }) {
  if (!user) {
    return <div className={`${size} rounded-full shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-gray-300 to-gray-500`}>?</div>;
  }
  const img = user.Profile_Image ? profileImageUrl(user.Profile_Image) : null;
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="รูปโปรไฟล์" className={`${size} rounded-full object-cover shrink-0 bg-white dark:bg-gray-700`} />;
  }
  return (
    <div className={`${size} rounded-full shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-emerald-400 to-emerald-600`}>
      {user.Full_Name?.charAt(0) || user.First_Name?.charAt(0) || '?'}
    </div>
  );
}