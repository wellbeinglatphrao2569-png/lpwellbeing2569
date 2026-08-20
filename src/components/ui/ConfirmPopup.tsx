'use client';
import Modal from './Modal';

interface ConfirmPopupProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const variantStyles = {
  primary: {
    btn: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icon: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500',
  },
  danger: {
    btn: 'bg-red-600 hover:bg-red-500 text-white',
    icon: 'bg-red-50 dark:bg-red-900/20 text-red-500',
  },
  warning: {
    btn: 'bg-amber-500 hover:bg-amber-400 text-white',
    icon: 'bg-amber-50 dark:bg-amber-900/20 text-amber-500',
  },
};

const variantIcons = {
  primary: 'help',
  danger: 'warning',
  warning: 'warning',
};

export default function ConfirmPopup({
  open, title = 'ยืนยันการดำเนินการ', message, confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก', variant = 'primary', loading = false, onConfirm, onClose,
}: ConfirmPopupProps) {
  const styles = variantStyles[variant];
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center py-2">
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${styles.icon}`}>
          <span className="material-symbols-outlined text-3xl">{variantIcons[variant]}</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{message}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={loading}
            className="btn-ghost flex-1 justify-center disabled:opacity-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-[2] justify-center h-[42px] rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${styles.btn}`}>
            {loading ? <><span className="loading loading-spinner loading-sm"></span> กำลังดำเนินการ...</> : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}