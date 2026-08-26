'use client';
import { useState, useEffect } from 'react';
import { fetchData, postDataJson } from '@/services/api';

export interface ProjectWindow { start: string; end: string; defaultStart?: string; defaultEnd?: string; }

export function useProjectWindow() {
  const [windowData, setWindowData] = useState<ProjectWindow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchData<ProjectWindow>('project-window');
      if (!cancelled) {
        if (data && (data as any).start) setWindowData(data as ProjectWindow);
        else setWindowData({ start: '2026-08-24', end: '2026-11-13' });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const isInWindow = (dateStr: string): boolean => {
    if (!windowData) return true;
    const key = String(dateStr || '').trim().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    return key >= windowData.start && key <= windowData.end;
  };
  return { window: windowData, loading, isInWindow };
}

export async function setProjectWindow(loggedBy: string, start: string, end: string) {
  return await postDataJson('set-project-window', { Logged_By: loggedBy, Start_Date: start, End_Date: end });
}
