'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { DEFAULT_SETTINGS, BYPASS_STORAGE_KEY, BYPASS_FLAG_VALUE } from '@/lib/maintenance';
import type { SystemSettings } from '@/lib/maintenance';

export function isDevBypassActive(): boolean {
  try {
    return localStorage.getItem(BYPASS_STORAGE_KEY) === BYPASS_FLAG_VALUE;
  } catch {
    return false;
  }
}

export function setDevBypass(active: boolean) {
  try {
    if (active) localStorage.setItem(BYPASS_STORAGE_KEY, BYPASS_FLAG_VALUE);
    else localStorage.removeItem(BYPASS_STORAGE_KEY);
    window.dispatchEvent(new Event('dev-bypass-change'));
  } catch {}
}

export function useMaintenance() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isBypass, setIsBypass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshBypass = useCallback(() => setIsBypass(isDevBypassActive()), []);

  const fetchSettings = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/system-settings', { cache: 'no-store', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SystemSettings;
      if (data && typeof data.is_maintenance_active === 'boolean') {
        setSettings({
          is_maintenance_active: !!data.is_maintenance_active,
          maintenance_title: String(data.maintenance_title || DEFAULT_SETTINGS.maintenance_title),
          maintenance_message: String(data.maintenance_message || DEFAULT_SETTINGS.maintenance_message),
          updated_at: data.updated_at,
          updated_by: data.updated_by,
        });
        setError(null);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBypass();
    const onBypass = () => refreshBypass();
    const onStorage = (e: StorageEvent) => {
      if (e.key === BYPASS_STORAGE_KEY || e.key === null) refreshBypass();
    };
    window.addEventListener('dev-bypass-change', onBypass);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('dev-bypass-change', onBypass);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshBypass]);

  useEffect(() => {
    const ac = new AbortController();
    fetchSettings(ac.signal);
    // poll ทุก 30s แต่หยุดเมื่อ tab hidden
    const tick = () => {
      if (document.hidden) return;
      fetchSettings();
    };
    pollRef.current = setInterval(tick, 30_000);
    const onVis = () => {
      if (!document.hidden) fetchSettings();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    return () => {
      ac.abort();
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tick);
    };
  }, [fetchSettings]);

  const shouldBlock = !loading && !isBypass && !!settings.is_maintenance_active;

  return { settings, setSettings, loading, isBypass, shouldBlock, error, refresh: fetchSettings, setIsBypass: refreshBypass };
}
