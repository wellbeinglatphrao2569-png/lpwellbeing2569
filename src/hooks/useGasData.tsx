'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchData } from '@/services/api';
import type { User, StepsLog, SweetFree } from '@/types';

/**
 * Shared hooks ที่ใช้ gasCache ภายใต้ fetchData เดิม
 * ลด duplicate fetch: Dashboard + Ranking ที่เรียก users/steps พร้อมกันจะ dedup อัตโนมัติ
 */

export function useUsers() {
  const [data, setData] = useState<User[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(async (force = false) => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchData<User[]>('users', undefined, { signal: ac.signal, forceRefresh: force });
      if (ac.signal.aborted) return;
      if (res) setData(res);
      else setError('โหลดข้อมูลบุคลากรไม่สำเร็จ');
    } catch (e: unknown) {
      if ((e as DOMException)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลล้มเหลว');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); return () => acRef.current?.abort(); }, [load]);

  return { data, loading, error, reload: load, setData };
}

export function useSteps() {
  const [data, setData] = useState<StepsLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(async (force = false) => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchData<StepsLog[]>('steps', undefined, { signal: ac.signal, forceRefresh: force });
      if (ac.signal.aborted) return;
      if (res) setData(res);
      else setError('โหลดข้อมูลก้าวไม่สำเร็จ');
    } catch (e: unknown) {
      if ((e as DOMException)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลล้มเหลว');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); return () => acRef.current?.abort(); }, [load]);

  return { data, loading, error, reload: load, setData };
}

export function useSweetFree() {
  const [data, setData] = useState<SweetFree[] | null>(null);
  const [loading, setLoading] = useState(true);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(async (force = false) => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setLoading(true);
    try {
      const res = await fetchData<SweetFree[]>('sweet-free', undefined, { signal: ac.signal, forceRefresh: force });
      if (ac.signal.aborted) return;
      if (res) setData(res);
    } finally { if (!ac.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => { load(); return () => acRef.current?.abort(); }, [load]);

  return { data, loading, reload: load, setData };
}
