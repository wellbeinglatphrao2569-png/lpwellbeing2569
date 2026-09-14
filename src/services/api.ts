const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

// จำแนก path ที่ควร cache (read-heavy) กับที่ต้องสด
const READ_CACHE_TTL: Record<string, number> = {
  'users': 30_000,
  'steps': 30_000,
  'project-window': 60_000,
  'google-fit-links': 30_000,
  'sweet-free': 30_000,
  'baseline': 60_000,
  'weight-comparison': 30_000,
  'dashboard': 30_000,
};

function isReadCacheable(path: string): boolean {
  return path in READ_CACHE_TTL;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  retries = 1
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // 429 / 5xx ให้ retry
      if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1) + Math.random() * 200));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as any)?.name === 'AbortError';
      if (isAbort) throw e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function fetchData<T>(path: string, params?: Record<string,string>, opts?: { signal?: AbortSignal; forceRefresh?: boolean }): Promise<T | null> {
  try {
    if (!GAS_API_URL) return null;
    const url = `${GAS_API_URL}?path=${path}${params ? '&'+new URLSearchParams(params) : ''}`;
    const cacheable = isReadCacheable(path) && !opts?.forceRefresh;

    // lazy import เพื่อไม่ให้ server bundle โหลด gasCache ที่เป็น client-only เกินจำเป็น (แต่ gasCache เป็น isomorphic)
    if (cacheable) {
      const { cachedFetch, GAS_CACHE_KEYS } = await import('@/lib/gasCache');
      const key = (GAS_CACHE_KEYS as Record<string,string>)[path] || `gas:${path}${params ? ':'+new URLSearchParams(params).toString() : ''}`;
      const ttl = READ_CACHE_TTL[path] ?? 30_000;
      return await cachedFetch<T>(key, async () => {
        const res = await fetchWithRetry(url, { cache: 'no-store', signal: opts?.signal }, 1);
        if (!res.ok) throw new Error(`GAS ${path} ${res.status}`);
        return await res.json() as T;
      }, { ttlMs: ttl, forceRefresh: opts?.forceRefresh });
    }

    const res = await fetchWithRetry(url, { cache: 'no-store', signal: opts?.signal }, 1);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (e) {
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as any)?.name === 'AbortError';
    if (isAbort) return null;
    return null;
  }
}

export async function postData(action: string, data?: Record<string,unknown>, opts?: { signal?: AbortSignal }) {
  try {
    if (!GAS_API_URL) return { success: false, message: 'API not configured' };
    const params = new URLSearchParams({ path: 'action', action });
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        params.append(k, String(v));
      }
    }
    const res = await fetchWithRetry(`${GAS_API_URL}?${params}`, { cache: 'no-store', signal: opts?.signal }, 1);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      // พยายาม parse error json
      try { const j = JSON.parse(txt); if (j?.error === 'ALREADY_REVIEWED') return { success: false, error: 'ALREADY_REVIEWED', ...j }; } catch {}
      return { success: false, message: txt.slice(0,300) || 'Network error' };
    }
    const json = await res.json();
    // แจ้ง cache ให้ invalidate
    try {
      const { invalidate } = await import('@/lib/gasCache');
      if (action === 'update-step-status' || action === 'delete-step' || action.startsWith('add-')) {
        invalidate('gas:steps');
        invalidate('gas:steps-pending-count');
      }
      if (action.includes('sweet')) invalidate('gas:sweet-free');
      if (action.includes('personnel') || action.includes('user')) invalidate('gas:users');
    } catch {}
    return json;
  } catch (e) {
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as any)?.name === 'AbortError';
    if (isAbort) return { success: false, message: 'ยกเลิกคำขอ' };
    return { success: false, message: 'Network error' };
  }
}

export async function postDataJson(action: string, data?: Record<string,unknown>, opts?: { signal?: AbortSignal }) {
  try {
    if (!GAS_API_URL) return { success: false, message: 'API not configured' };
    const res = await fetchWithRetry(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data }),
      cache: 'no-store',
      signal: opts?.signal,
    }, 1);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      try { const j = JSON.parse(txt); if (j?.error === 'ALREADY_REVIEWED') return { success: false, error: 'ALREADY_REVIEWED', ...j }; if (j?.error) return { success: false, message: j.error, ...j }; } catch {}
      return { success: false, message: txt.slice(0,400) || 'Network error' };
    }
    const json = await res.json();
    try {
      const { invalidate } = await import('@/lib/gasCache');
      if (action === 'update-step-status' || action === 'delete-step' || action === 'add-batch-steps' || action === 'add-step') {
        invalidate('gas:steps');
        invalidate('gas:steps-pending-count');
      }
      if (action.includes('sweet')) invalidate('gas:sweet-free');
      if (action.includes('personnel') || action.includes('user') || action === 'register') invalidate('gas:users');
      if (action === 'set-project-window') invalidate('gas:project-window');
    } catch {}
    // GAS ส่ง ALREADY_REVIEWED มาเป็น success:false
    if (json && json.error === 'ALREADY_REVIEWED') return { success: false, error: 'ALREADY_REVIEWED', ...json };
    return json;
  } catch (e) {
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as any)?.name === 'AbortError';
    if (isAbort) return { success: false, message: 'ยกเลิกคำขอ' };
    return { success: false, message: 'Network error' };
  }
}

// helper สำหรับ invalidate จากภายนอก
export function invalidateGasCache(pattern: string | RegExp) {
  import('@/lib/gasCache').then(m => m.invalidate(pattern)).catch(() => {});
}
