'use client';

export function getOrCreateDeviceId(): string {
  try {
    let id: string | null = localStorage.getItem('ladprao_device_id');
    if (!id) {
      const gen: string = (globalThis.crypto as any)?.randomUUID ? (globalThis.crypto as any).randomUUID() : `dev_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
      id = gen;
      localStorage.setItem('ladprao_device_id', id);
    }
    return id as string;
  } catch { return `dev_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
}

export function getSessionToken(): string | null {
  try { return localStorage.getItem('ladprao_session'); } catch { return null; }
}
export function setSessionToken(t: string) {
  try { localStorage.setItem('ladprao_session', t); } catch {}
}
export function clearSessionToken() {
  try { localStorage.removeItem('ladprao_session'); } catch {}
}
