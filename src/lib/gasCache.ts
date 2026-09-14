'use client';

/**
 * GAS cache lite — in-memory TTL + request dedup + stale-while-revalidate
 * ไม่เพิ่ม dependency, ใช้แทน SWR/React Query สำหรับ GAS ที่ช้า
 */
type CacheEntry<T> = { data: T; expiresAt: number; staleAt: number };

const mem = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL = 30_000; // 30s fresh
const DEFAULT_STALE = 60_000; // อีก 30s ใช้ stale ระหว่าง revalidate

function now() { return Date.now(); }

export function getCached<T>(key: string): T | undefined {
  const e = mem.get(key) as CacheEntry<T> | undefined;
  if (!e) return undefined;
  if (now() > e.expiresAt + (e.staleAt - e.expiresAt)) {
    // เกิน stale window -> ลบ
    mem.delete(key);
    return undefined;
  }
  return e.data;
}

export function isFresh(key: string): boolean {
  const e = mem.get(key);
  if (!e) return false;
  return now() < e.expiresAt;
}

export function isStale(key: string): boolean {
  const e = mem.get(key);
  if (!e) return false;
  return now() >= e.expiresAt && now() < e.staleAt;
}

export function setCached<T>(key: string, data: T, ttlMs = DEFAULT_TTL, staleMs = DEFAULT_STALE) {
  mem.set(key, { data, expiresAt: now() + ttlMs, staleAt: now() + staleMs });
}

export function invalidate(pattern: string | RegExp) {
  for (const k of Array.from(mem.keys())) {
    if (typeof pattern === 'string') {
      if (k === pattern || k.startsWith(pattern)) mem.delete(k);
    } else if (pattern.test(k)) mem.delete(k);
  }
  // ลบ inflight ที่ตรง pattern ด้วย
  for (const k of Array.from(inflight.keys())) {
    if (typeof pattern === 'string') {
      if (k === pattern || k.startsWith(pattern)) inflight.delete(k);
    } else if (pattern.test(k)) inflight.delete(k);
  }
}

export function invalidateAll() {
  mem.clear();
  inflight.clear();
}

/**
 * Deduplicated fetch — ถ้ามี inflight เดิมให้ reuse
 */
export async function dedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = (async () => {
    try {
      return await fetcher();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p as Promise<unknown>);
  return p;
}

/**
 * Cached + deduped — ใช้ stale ระหว่าง revalidate
 * opts: ttl, stale, forceRefresh
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; staleMs?: number; forceRefresh?: boolean }
): Promise<T> {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL;
  const stale = opts?.staleMs ?? DEFAULT_STALE;
  if (!opts?.forceRefresh) {
    const e = mem.get(key) as CacheEntry<T> | undefined;
    if (e && now() < e.expiresAt) {
      return e.data;
    }
    if (e && now() < e.staleAt) {
      // stale-while-revalidate: คืน stale ทันที แล้ว revalidate แบบไม่บล็อก
      dedupedFetch(key, async () => {
        const fresh = await fetcher();
        setCached(key, fresh, ttl, stale);
        return fresh;
      }).catch(() => {});
      return e.data;
    }
  }
  const fresh = await dedupedFetch(key, fetcher);
  setCached(key, fresh, ttl, stale);
  return fresh;
}

export const GAS_CACHE_KEYS = {
  users: 'gas:users',
  steps: 'gas:steps',
  projectWindow: 'gas:project-window',
  googleFitLinks: 'gas:google-fit-links',
  sweetFree: 'gas:sweet-free',
  pendingCount: 'gas:steps-pending-count',
  dashboard: 'gas:dashboard',
} as const;
