'use client';
import Modal from './Modal';

const typeStyles = {
  success: { icon: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500', name: 'check_circle' },
  error: { icon: 'bg-red-50 dark:bg-red-900/20 text-red-500', name: 'error' },
  info: { icon: 'bg-amber-50 dark:bg-amber-900/20 text-amber-500', name: 'info' },
};

interface ResultPopupProps {
  open: boolean;
  type?: 'success' | 'error' | 'info';
  title?: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
}

export default function ResultPopup({
  open, type = 'info', title = 'แจ้งเตือน', message, confirmLabel = 'ตกลง', onClose,
}: ResultPopupProps) {
  const t = typeStyles[type];
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center py-2">
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${t.icon}`}>
          <span className="material-symbols-outlined text-3xl">{t.name}</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed break-words whitespace-pre-wrap">{message}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="btn-primary flex-1 justify-center">{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}