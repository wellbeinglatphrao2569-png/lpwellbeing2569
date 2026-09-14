'use client';
import { useState, useEffect, useCallback } from 'react';
import { fetchData, postDataJson } from '@/services/api';

export interface ProjectWindow { start: string; end: string; defaultStart?: string; defaultEnd?: string; }

export function useProjectWindow() {
  const [windowData, setWindowData] = useState<ProjectWindow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      const data = await fetchData<ProjectWindow>('project-window', undefined, { signal: ac.signal });
      if (cancelled || ac.signal.aborted) return;
      if (data && (data as any).start) setWindowData(data as ProjectWindow);
      else setWindowData({ start: '2026-08-24', end: '2026-11-13' });
      setLoading(false);
    })();
    return () => { cancelled = true; ac.abort(); };
  }, []);
  const isInWindow = useCallback((dateStr: string): boolean => {
    if (!windowData) return true;
    const key = String(dateStr || '').trim().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    return key >= windowData.start && key <= windowData.end;
  }, [windowData]);
  return { window: windowData, loading, isInWindow };
}

export async function setProjectWindow(loggedBy: string, start: string, end: string) {
  return await postDataJson('set-project-window', { Logged_By: loggedBy, Start_Date: start, End_Date: end });
}
