/**
 * GAS Drive helper — ใช้สเปค PART 1 ตรงตัว
 * รองรับทั้ง NEXT_PUBLIC_GAS_WEB_APP_URL (สเปคใหม่) และ NEXT_PUBLIC_GAS_API_URL (ของเดิม)
 */
function getGasUrl(): string {
  return (
    process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ||
    process.env.GAS_WEB_APP_URL ||
    process.env.NEXT_PUBLIC_GAS_API_URL ||
    process.env.GAS_API_URL ||
    ''
  );
}

export function getDriveImageUrl(fileId: string): string {
  if (!fileId) return '';
  if (fileId.startsWith('http://') || fileId.startsWith('https://')) return fileId;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

export async function uploadToDriveViaGas(params: {
  filename: string;
  mimeType: string;
  base64: string;
}): Promise<{ fileId: string }> {
  const url = getGasUrl();
  if (!url) throw new Error('GAS Web App URL not configured (NEXT_PUBLIC_GAS_WEB_APP_URL)');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'upload',
      filename: params.filename,
      mimeType: params.mimeType,
      base64: params.base64,
    }),
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status === 'error' || !j.fileId) {
    throw new Error(j.message || j.error || `GAS upload failed HTTP ${res.status}`);
  }
  return { fileId: String(j.fileId) };
}

export async function deleteFromDriveViaGas(fileId: string): Promise<void> {
  if (!fileId) return;
  const url = getGasUrl();
  if (!url) throw new Error('GAS Web App URL not configured');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'delete', fileId }),
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status === 'error') {
    throw new Error(j.message || j.error || `GAS delete failed HTTP ${res.status}`);
  }
}

export function getGasWebAppUrl(): string {
  return getGasUrl();
}
