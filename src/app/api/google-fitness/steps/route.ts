/**
 * API Route: Proxy ไปยัง Google Fit API
 *
 * Google Fit Aggregate API ต้องใช้ POST + JSON body + access token
 */
import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_FIT_API = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';

/**
 * ลอง call Google Fit API หลาย data source จนกว่าจะเจอ
 */
async function getStepsForDay(accessToken: string, date: string): Promise<number> {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);

  // ลองหลาย data sources — ต่าง device ใช้ต่างกัน
  const aggregateByOptions = [
    [{ dataTypeName: 'com.google.step_count.delta' }],
    [{ dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps' }],
    [{ dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas' }],
    [{ dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:filtered_steps' }],
    [{ dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:aggregated_steps' }],
    [{ dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:user_steps' }],
    // ใช้ทุก data source ที่มี
    [{ dataTypeName: 'com.google.step_count.delta' }, { dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps' }],
  ];

  let lastError: string = '';

  for (const aggregateBy of aggregateByOptions) {
    try {
      const res = await fetch(GOOGLE_FIT_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aggregateBy,
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: start.getTime(),
          endTimeMillis: end.getTime(),
        }),
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${await res.text().catch(() => '')}`;
        continue;
      }

      const data = await res.json();

      // Try both `bucket` and `buckets` (API response varies)
      const buckets = data.bucket || data.buckets || [];
      let totalSteps = 0;

      for (const bucket of buckets) {
        for (const dataset of bucket.dataset || []) {
          for (const point of dataset.point || []) {
            if (point.value) {
              for (const val of point.value) {
                totalSteps += val.intVal || val.fpVal || 0;
              }
            }
          }
        }
      }

      if (totalSteps > 0) {
        console.log(`Google Fit: found ${totalSteps} steps via`, aggregateBy[0].dataTypeName || aggregateBy[0].dataSourceId);
        return Math.round(totalSteps);
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  console.log('Google Fit: all data sources returned 0 or failed. Last error:', lastError);
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const body = await request.json();
    const { date, email, user_id } = body;

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    // ⚡ ตรวจ 1 Gmail = 1 คน: ถ้า Gmail นี้ถูกผูกกับบัญชีระบบอื่น ไม่อนุญาตให้ดึงข้อมูล
    if (email && user_id) {
      try {
        const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';
        const res = await fetch(
          `${GAS_API_URL}?path=action&action=check-google-fit-email&email=${encodeURIComponent(email)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.duplicate && data.linkedUser && String(data.linkedUser) !== String(user_id)) {
            return NextResponse.json(
              { error: 'Gmail นี้ถูกผูกกับบัญชีอื่น — ไม่สามารถใช้ร่วมกันได้ (ป้องกันการโกงนับก้าว)' },
              { status: 403 }
            );
          }
        }
      } catch (e) {
        console.error('Google Fit owner check failed:', e);
      }
    }

    const totalSteps = await getStepsForDay(accessToken, date);

    return NextResponse.json({ totalSteps, date });
  } catch (error) {
    console.error('Google Fit steps error:', error);
    return NextResponse.json({ error: 'Failed to fetch steps' }, { status: 500 });
  }
}