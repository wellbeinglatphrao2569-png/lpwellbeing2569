const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

export async function fetchData<T>(path: string, params?: Record<string,string>): Promise<T | null> {
  try {
    if (!GAS_API_URL) return null;
    const url = `${GAS_API_URL}?path=${path}${params ? '&'+new URLSearchParams(params) : ''}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

export async function postData(action: string, data?: Record<string,unknown>) {
  try {
    if (!GAS_API_URL) return { success: false, message: 'API not configured' };
    const params = new URLSearchParams({ path: 'action', action });
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        params.append(k, String(v));
      }
    }
    const res = await fetch(`${GAS_API_URL}?${params}`, { cache: 'no-store' });
    if (!res.ok) return { success: false, message: 'Network error' };
    return await res.json();
  } catch { return { success: false, message: 'Network error' }; }
}

export async function postDataJson(action: string, data?: Record<string,unknown>) {
  try {
    if (!GAS_API_URL) return { success: false, message: 'API not configured' };
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data }),
      cache: 'no-store',
    });
    if (!res.ok) return { success: false, message: 'Network error' };
    return await res.json();
  } catch { return { success: false, message: 'Network error' }; }
}
