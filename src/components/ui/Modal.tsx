'use client';
import { ReactNode, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const subscribe = () => () => {};

export default function Modal({ open, onClose, wide = false, children }: { open: boolean; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  useEffect(() => {
    if (!mounted) return;
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open, mounted]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/30 dark:border-gray-700/30 rounded-3xl p-6 md:p-8 ${wide ? 'max-w-4xl' : 'max-w-md'} w-full relative z-10 shadow-2xl animate-scale-in flex flex-col max-h-[calc(100dvh-4rem)]`}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <span className="material-symbols-outlined text-gray-400">close</span>
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
