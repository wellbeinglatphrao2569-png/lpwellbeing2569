const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

// จำแนก path ที่ควร cache (read-heavy) กับที่ต้องสด — เพิ่ม 120s ลดโหลด GAS
const READ_CACHE_TTL: Record<string, number> = {
  'users': 120_000,
  'steps': 120_000,
  'project-window': 300_000,
  'google-fit-links': 120_000,
  'sweet-free': 120_000,
  'baseline': 300_000,
  'weight-comparison': 120_000,
  'dashboard': 120_000,
  'steps-pending-count': 30_000, // pending ต้องสดกว่า — คง 30s
};

function isReadCacheable(path: string): boolean {
  return path in READ_CACHE_TTL;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  retries = 2
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // 429 / 5xx ให้ retry + เคารพ Retry-After
      if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = res.headers.get('Retry-After');
        const delay = retryAfter ? Math.min(8000, parseInt(retryAfter, 10) * 1000 || 0) : 400 * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as any)?.name === 'AbortError';
      if (isAbort) throw e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
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
    const res = await fetchWithRetry(`${GAS_API_URL}?${params}`, { cache: 'no-store', signal: opts?.signal }, 2);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      try { const j = JSON.parse(txt); if (j?.error === 'ALREADY_REVIEWED') return { success: false, error: 'ALREADY_REVIEWED', ...j }; if (j?.error === 'NEED_CONFIRM') return { success: false, error: 'NEED_CONFIRM', ...j }; } catch {}
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      return { success: false, message: friendlyThai(txt || `HTTP ${res.status}`, res.status) };
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text().catch(() => '');
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      return { success: false, message: friendlyThai(txt, res.status) };
    }
    const json = await res.json().catch(async () => {
      const txt2 = await res.text().catch(() => '');
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      return { success: false, message: friendlyThai(txt2, res.status) } as any;
    });
    if (json && (json as any).success === false && typeof (json as any).message === 'string' && (json as any).message.includes('<!DOCTYPE')) {
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      (json as any).message = friendlyThai((json as any).message, res.status);
    }
    // แจ้ง cache ให้ invalidate
    try {
      const { invalidate } = await import('@/lib/gasCache');
      if (action === 'update-step-status' || action === 'delete-step' || action.startsWith('add-')) {
        invalidate('gas:steps');
        invalidate('gas:steps-pending-count');
      }
      if (action.includes('sweet')) invalidate('gas:sweet-free');
      if (action.includes('personnel') || action.includes('user')) invalidate('gas:users');
      if (action === 'validate-session' || action === 'logout') invalidate('gas:users');
    } catch {}
    return json;
  } catch (e) {
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as any)?.name === 'AbortError';
    if (isAbort) return { success: false, message: 'ยกเลิกคำขอ' };
    const { friendlyThai } = await import('@/lib/thaiErrorMap');
    return { success: false, message: friendlyThai(e, undefined) };
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
    }, 2);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      try { const j = JSON.parse(txt); if (j?.error === 'ALREADY_REVIEWED') return { success: false, error: 'ALREADY_REVIEWED', ...j }; if (j?.error === 'NEED_CONFIRM') return { success: false, error: 'NEED_CONFIRM', ...j }; if (j?.error) return { success: false, message: j.error, ...j }; } catch {}
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      return { success: false, message: friendlyThai(txt || `HTTP ${res.status}`, res.status) };
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await res.text().catch(() => '');
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      return { success: false, message: friendlyThai(txt, res.status) };
    }
    const json: any = await res.json().catch(async () => {
      const txt2 = await res.text().catch(() => '');
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      return { success: false, message: friendlyThai(txt2, res.status) };
    });
    try {
      const { invalidate } = await import('@/lib/gasCache');
      if (action === 'update-step-status' || action === 'delete-step' || action === 'add-batch-steps' || action === 'add-step') {
        invalidate('gas:steps');
        invalidate('gas:steps-pending-count');
      }
      if (action.includes('sweet')) invalidate('gas:sweet-free');
      if (action.includes('personnel') || action.includes('user') || action === 'register') invalidate('gas:users');
      if (action === 'set-project-window') invalidate('gas:project-window');
      if (action === 'validate-session' || action === 'logout' || action === 'login') invalidate('gas:users');
    } catch {}
    if (json && json.error === 'ALREADY_REVIEWED') return { success: false, error: 'ALREADY_REVIEWED', ...json };
    if (json && json.error === 'NEED_CONFIRM') return { success: false, error: 'NEED_CONFIRM', ...json };
    if (json && json.success === false && typeof json.message === 'string' && json.message.includes('<!DOCTYPE')) {
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      json.message = friendlyThai(json.message, res.status);
    }
    return json;
  } catch (e) {
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as any)?.name === 'AbortError';
    if (isAbort) return { success: false, message: 'ยกเลิกคำขอ' };
    const { friendlyThai } = await import('@/lib/thaiErrorMap');
    return { success: false, message: friendlyThai(e, undefined) };
  }
}

// helper สำหรับ invalidate จากภายนอก
export function invalidateGasCache(pattern: string | RegExp) {
  import('@/lib/gasCache').then(m => m.invalidate(pattern)).catch(() => {});
}
