import { ReactNode } from 'react';

export default function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-lg ${className}`}>
      {children}
    </div>
  );
}
