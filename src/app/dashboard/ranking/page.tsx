import { Suspense } from 'react';
import RankingContent from './RankingContent';

export default function RankingPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-[480px] bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
    }>
      <RankingContent />
    </Suspense>
  );
}