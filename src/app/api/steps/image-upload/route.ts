/**
 * อัปโหลดภาพหลักฐานก้าวเดิน → Supabase primary + GAS backup
 * 1) ตรวจห้วงเวลา/Mode (Supabase ก่อน, fallback GAS)
 * 2) วิเคราะห์ภาพด้วย AI (Typhoon/ThaiFoon)
 * 3) อัปโหลดรูปไป Google Drive ผ่าน GAS {action:"upload"} → ได้ fileId
 *    ถ้า GAS ยังไม่รองรับ จะ fallback ไป Supabase Storage (steps-images)
 * 4) INSERT steps_log ใน Supabase (image_drive_id = fileId หรือ storage URL)
 *    แล้วบันทึกจะโผล่ทันทีเมื่อ fetchData('steps') (Supabase primary)
 *
 * POST /api/steps/image-upload
 * Body: { imageBase64, userId, steps, dateThai, ...aiFields }
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImageWithTyphoon, isTyphoonConfigured } from '@/lib/typhoon';
import { extractStepsFromText } from '@/lib/stepsExtractor';
import { normalizeOcrDate, isDateMatch } from '@/lib/stepsDateParser';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const GAS_API_URL =
  process.env.NEXT_PUBLIC_GAS_WEB_APP_URL ||
  process.env.GAS_WEB_APP_URL ||
  process.env.NEXT_PUBLIC_GAS_API_URL ||
  process.env.GAS_API_URL ||
  '';

function extractBase64(imageBase64: string): string {
  const match = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : imageBase64;
}
function extractMimeType(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);base64,/);
  return m ? m[1] : 'image/jpeg';
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, userId, steps, dateThai } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!steps || Number(steps) <= 0) {
      return NextResponse.json({ error: 'steps is required' }, { status: 400 });
    }
    if (!dateThai) {
      return NextResponse.json({ error: 'dateThai is required' }, { status: 400 });
    }

    // ห้วงเวลา + Mode check — ลอง Supabase ก่อน, fallback GAS
    let windowOk = true;
    let windowErr: string | null = null;
    let usersForMode: any[] | null = null;
    if (isSupabaseConfigured()) {
      try {
        const sb = getSupabase()!;
        const { data: win } = await sb.from('project_settings').select('start_date,end_date').eq('id', 1).maybeSingle();
        const s = (win as { start_date: string } | null)?.start_date;
        const e = (win as { end_date: string } | null)?.end_date;
        if (s && e) {
          const today = new Date().toISOString().slice(0, 10);
          if (today > String(e).slice(0, 10)) {
            windowErr = `โครงการสิ้นสุดแล้ว (${s} ถึง ${e}) — ระบบล็อคการรับข้อมูล (Data Freeze)`;
            windowOk = false;
          } else {
            const d = String(dateThai).trim().slice(0, 10);
            if (d < String(s).slice(0, 10) || d > String(e).slice(0, 10)) {
              windowErr = `นอกห้วงเวลาบันทึก (${s} ถึง ${e}) — ไม่สามารถบันทึกวันที่ ${d} ได้`;
              windowOk = false;
            }
          }
        }
        // users สำหรับเช็ค Mode 2
        let all: any[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await sb.from('users').select('user_id, step_record_mode').range(from, from + 999);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
        usersForMode = all.map((r: Record<string, unknown>) => ({
          User_ID: r.user_id,
          Step_Record_Mode: r.step_record_mode,
        }));
      } catch (e) {
        console.warn('image-upload Supabase window check failed, will fallback to GAS', e);
      }
    }
    if (!usersForMode && GAS_API_URL) {
      try {
        const [winRes, uRes] = await Promise.all([
          fetch(`${GAS_API_URL}?path=project-window`, { cache: 'no-store', signal: request.signal }),
          fetch(`${GAS_API_URL}?path=users`, { cache: 'no-store', signal: request.signal }),
        ]);
        if (winRes.ok) {
          const win = await winRes.json().catch(() => null);
          if (win && win.start && win.end) {
            const today = new Date().toISOString().slice(0, 10);
            if (today > String(win.end).slice(0, 10)) {
              windowErr = `โครงการสิ้นสุดแล้ว (${win.start} ถึง ${win.end}) — ระบบล็อคการรับข้อมูล (Data Freeze)`;
              windowOk = false;
            } else {
              const d = String(dateThai).trim().slice(0, 10);
              if (d < String(win.start).slice(0, 10) || d > String(win.end).slice(0, 10)) {
                windowErr = `นอกห้วงเวลาบันทึก (${win.start} ถึง ${win.end}) — ไม่สามารถบันทึกวันที่ ${d} ได้`;
                windowOk = false;
              }
            }
          }
        }
        if (uRes.ok) {
          const j = await uRes.json().catch(() => null);
          if (Array.isArray(j)) usersForMode = j;
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return NextResponse.json({ error: 'คำขอถูกยกเลิก' }, { status: 499 });
        console.warn('image-upload GAS window/users fallback failed', e);
      }
    }
    if (!windowOk && windowErr) {
      const isFreeze = windowErr.includes('สิ้นสุดแล้ว');
      return NextResponse.json({ error: windowErr }, { status: isFreeze ? 403 : 400 });
    }

    // กัน Mode 2 บันทึกเอง
    if (usersForMode && Array.isArray(usersForMode)) {
      const target = usersForMode.find((u: any) => String(u.User_ID).trim() === String(userId).trim());
      if (target && String((target as any).Step_Record_Mode || '1').trim() === '2') {
        return NextResponse.json({ error: 'คุณอยู่ใน Mode 2 (เจ้าหน้าที่ นสส. บันทึกให้) — ไม่สามารถบันทึกเองได้' }, { status: 403 });
      }
    }

    // ตรวจสอบด้วย Typhoon OCR — ถ้ามีข้อมูล AI จาก client ส่งมา (aiSteps/dateMatch) ให้ใช้เลย, ถ้าไม่มีให้ลองอ่านเอง
    let aiSteps: number | null = null;
    let aiConfidence: number | null = null;
    let dateInImageRaw: string | null = null;
    let dateMatch: boolean | null = null;
    let dateNormalized: string | null = null;
    let alertFlag: 'TRUE' | 'FALSE' = 'TRUE';
    let alertReason = 'รอตรวจสอบ manual';
    let aiStepsRaw: string | null = null;

    // รับค่าจาก body ถ้า client ส่งมาจาก /api/ai/analyze-steps แล้ว (flow 2 ชั้นยืนยัน)
    const bodyAi = body as any;
    if (bodyAi.aiSteps != null || bodyAi.dateRaw != null || bodyAi.dateMatch != null) {
      aiSteps = bodyAi.aiSteps != null ? Number(bodyAi.aiSteps) : null;
      aiStepsRaw = bodyAi.aiStepsRaw != null ? String(bodyAi.aiStepsRaw) : null;
      aiConfidence = bodyAi.confidence != null ? Number(bodyAi.confidence) : (bodyAi.aiConfidence != null ? Number(bodyAi.aiConfidence) : null);
      dateInImageRaw = bodyAi.dateRaw != null ? String(bodyAi.dateRaw) : (bodyAi.Date_In_Image != null ? String(bodyAi.Date_In_Image) : null);
      dateNormalized = bodyAi.dateNormalized != null ? String(bodyAi.dateNormalized) : null;
      const dm = bodyAi.dateMatch ?? bodyAi.Date_Match;
      dateMatch = dm === true || dm === 'TRUE' ? true : dm === false || dm === 'FALSE' ? false : null;
      alertFlag = bodyAi.alertFlag === 'FALSE' || bodyAi.Alert_Flag === 'FALSE' ? 'FALSE' : 'TRUE';
      alertReason = bodyAi.alertReason ?? bodyAi.Alert_Reason ?? alertReason;
      // ถ้า client บอกว่า alert=false และ dateMatch true + stepsExact → จะได้ Approved
    } else if (isTyphoonConfigured()) {
      try {
        const now = new Date();
        const systemDate = now.toISOString().slice(0, 10);
        const ty = await analyzeStepsImageWithTyphoon(String(imageBase64), {
          timeoutMs: 20000,
          ctx: { systemDate, targetDate: String(dateThai), currentYear: String(now.getFullYear()), currentThaiYear: String(now.getFullYear() + 543) },
        });
        const tySteps = (ty as any).step_count ?? ty.steps ?? null;
        if (tySteps != null) {
          aiSteps = Number(String(tySteps).replace(/,/g, ''));
          aiStepsRaw = ty.stepsRaw ?? String(tySteps);
        } else if (ty.rawText) {
          const ext = extractStepsFromText(ty.rawText);
          aiSteps = ext.steps;
          aiStepsRaw = ext.raw;
        }
        dateInImageRaw = (ty as any).detected_date_raw ?? ty.dateRaw ?? null;
        const tyFmt = (ty as any).formatted_date ?? null;
        const tyMatched = (ty as any).is_date_matched ?? null;
        aiConfidence = (ty as any).confidence_score ?? ty.confidence ?? null;
        if (tyFmt && /^\d{4}-\d{2}-\d{2}$/.test(tyFmt)) {
          dateNormalized = tyFmt;
          dateMatch = tyMatched != null ? Boolean(tyMatched) : tyFmt === String(dateThai);
        } else {
          dateNormalized = dateInImageRaw ? normalizeOcrDate(dateInImageRaw, String(dateThai)) : null;
          dateMatch = dateInImageRaw ? isDateMatch(dateInImageRaw, String(dateThai)) : null;
          if (tyMatched != null) dateMatch = Boolean(tyMatched);
        }
        const tyReason = (ty as any).reasoning ?? null;
        if (tyReason && !alertReason) alertReason = tyReason;
      } catch (e) {
        console.warn('image-upload Typhoon fallback failed:', e);
      }
    }

    // ตัดสิน Strict 0% tolerance
    const inputStepsNum = Number(steps);
    const stepsExact = aiSteps != null ? aiSteps === inputStepsNum : null;
    const conf = aiConfidence ?? (aiSteps != null && dateNormalized ? 0.7 : 0.3);

    // ถ้าไม่มีข้อมูล AI เลย → Pending
    if (aiSteps == null && dateMatch == null && !bodyAi.aiSteps) {
      alertFlag = 'TRUE';
      alertReason = dateInImageRaw ? 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ตรวจสอบ' : 'AI อ่านไม่สำเร็จ — รอตรวจสอบ manual';
    } else if (bodyAi.alertReason == null && bodyAi.Alert_Reason == null) {
      // คำนวณ alert เองถ้า client ไม่ได้ส่งมา
      if (aiSteps == null) {
        alertFlag = 'TRUE';
        alertReason = 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ตรวจสอบ';
      } else if (stepsExact === false) {
        alertFlag = 'TRUE';
        alertReason = `ก้าวไม่ตรงกัน (กรอก ${inputStepsNum.toLocaleString()} AI อ่านได้ ${aiSteps.toLocaleString()}) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else if (dateMatch === false) {
        alertFlag = 'TRUE';
        alertReason = `วันที่ในภาพไม่ตรงกับวันที่เลือกบันทึก (${String(dateThai)} AI อ่านได้ "${dateInImageRaw}" → ${dateNormalized || 'อ่านไม่ได้'})`;
      } else if (dateMatch == null) {
        alertFlag = 'TRUE';
        alertReason = `อ่านวันที่ในภาพไม่ชัดเจน ("${dateInImageRaw || '—'}") — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else if (conf < 0.85) {
        alertFlag = 'TRUE';
        alertReason = `ความมั่นใจต่ำ (${Math.round(conf * 100)}%) — ส่งให้เจ้าหน้าที่ตรวจสอบ`;
      } else {
        alertFlag = 'FALSE';
        alertReason = '';
      }
    }

    const autoApprove = alertFlag === 'FALSE' && stepsExact === true && dateMatch === true && conf >= 0.85;
    const serverStatus: 'Approved' | 'Pending' = autoApprove ? 'Approved' : 'Pending';

    // ===== Supabase primary path (แก้บั๊ก: รีเฟรชแล้วไม่ขึ้น) =====
    if (isSupabaseConfigured()) {
      let imageDriveId: string | null = null;
      let uploadWarn: string | null = null;

      // 1) พยายามอัปโหลดรูปไป Drive ผ่าน GAS {action:"upload"} (สเปคใหม่)
      if (GAS_API_URL) {
        try {
          const pureB64 = extractBase64(String(imageBase64));
          const mimeType = extractMimeType(String(imageBase64));
          const filename = `steps_${String(userId)}_${String(dateThai)}_${Date.now()}.jpg`;
          const upRes = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'upload', filename, mimeType, base64: pureB64 }),
            cache: 'no-store',
            signal: request.signal,
          });
          const upJson = await upRes.json().catch(() => ({}));
          if (upRes.ok && upJson.status === 'success' && upJson.fileId) {
            imageDriveId = String(upJson.fileId);
          } else if (upRes.ok && upJson.fileId) {
            imageDriveId = String(upJson.fileId);
          } else {
            uploadWarn = upJson.message || upJson.error || `GAS upload ${upRes.status}`;
            console.warn('[image-upload] GAS upload failed, will try Storage fallback:', uploadWarn, upJson);
          }
        } catch (e) {
          uploadWarn = e instanceof Error ? e.message : String(e);
          console.warn('[image-upload] GAS upload exception, fallback to Storage:', uploadWarn);
        }
      }

      // 2) Fallback: Supabase Storage (steps-images) ถ้า GAS upload ไม่ได้
      if (!imageDriveId) {
        try {
          const sbFallback = getSupabase()!;
          const pureB64 = extractBase64(String(imageBase64));
          const bytes = Buffer.from(pureB64, 'base64');
          const ext = extractMimeType(String(imageBase64)) === 'image/png' ? 'png' : 'jpg';
          const path = `${String(userId)}_${String(dateThai)}_${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`;
          const { error: upErr } = await sbFallback.storage.from('steps-images').upload(path, bytes, {
            contentType: extractMimeType(String(imageBase64)),
            upsert: false,
          });
          if (upErr) throw upErr;
          const { data: pub } = sbFallback.storage.from('steps-images').getPublicUrl(path);
          imageDriveId = pub.publicUrl; // ProofImage รองรับ URL
          console.log('[image-upload] Storage fallback uploaded:', path);
        } catch (e) {
          console.error('[image-upload] Storage fallback failed:', e);
          // ถ้าอัปโหลดรูปไม่ได้จริงๆ ให้เก็บ null ไว้ก่อน แต่ยังบันทึกก้าวได้ (ไม่บล็อก)
          uploadWarn = (uploadWarn ? uploadWarn + ' | ' : '') + (e instanceof Error ? e.message : String(e));
        }
      }

      // 3) INSERT ลง Supabase (primary)
      try {
        const sb = getSupabase()!;
        const recordId = 'ST' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
        const insertRow: Record<string, unknown> = {
          record_id: recordId,
          user_id: String(userId),
          date_thai: String(dateThai).slice(0, 10),
          steps_count: Number(steps),
          submitted_steps: Number(steps),
          record_method: 'ภาพถ่าย',
          image_drive_id: imageDriveId,
          status: serverStatus,
          week_number: null,
          auditor_id: null,
          reviewed_at: serverStatus === 'Approved' ? new Date().toISOString() : null,
          recorded_at: new Date().toISOString(),
          reject_reason: null,
          ai_steps: aiSteps,
          ai_confidence: aiConfidence ?? conf,
          date_match: dateMatch,
          alert_flag: alertFlag === 'TRUE',
          alert_reason: alertReason,
          notes: aiStepsRaw ? `AIอ่าน: ${aiStepsRaw} | วันที่ดิบ: ${dateInImageRaw || '—'}` : '',
        };
        const { error: insErr } = await sb.from('steps_log').insert(insertRow);
        if (insErr) throw insErr;

        // cache invalidation
        try {
          const { invalidate } = await import('@/lib/gasCache');
          invalidate('gas:steps');
          invalidate('gas:steps-pending-count');
        } catch {}

        // backup ไป GAS แบบ fire-and-forget (ไม่บล็อก response)
        if (GAS_API_URL && imageDriveId) {
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'add-step',
              User_ID: String(userId),
              Steps_Count: Number(steps),
              Date_Thai: String(dateThai),
              Record_Method: 'ภาพถ่าย',
              Status: serverStatus,
              // ส่ง fileId ไปแทน base64 เพื่อไม่ซ้ำซ้อน (GAS จะบันทึก fileId โดยตรงถ้ามี Image_Drive_ID)
              Image_Drive_ID: imageDriveId,
              AI_Steps: aiSteps != null ? String(aiSteps) : (aiStepsRaw || ''),
              AI_Confidence: aiConfidence != null ? String(aiConfidence) : String(conf),
              Date_In_Image: dateInImageRaw || dateNormalized || '',
              Date_Match: dateMatch === true ? 'TRUE' : dateMatch === false ? 'FALSE' : '',
              Alert_Flag: alertFlag,
              Alert_Reason: alertReason,
              Notes: aiStepsRaw ? `AIอ่าน: ${aiStepsRaw} | วันที่ดิบ: ${dateInImageRaw || '—'}` : '',
            }),
            cache: 'no-store',
          }).catch(() => {});
        }

        return NextResponse.json({
          success: true,
          message: 'บันทึกสำเร็จ (Supabase)',
          Record_ID: recordId,
          fileId: imageDriveId,
          image_drive_id: imageDriveId,
          storageFallback: uploadWarn ? true : false,
          uploadWarn,
          aiStatus: serverStatus,
          aiSteps,
          aiStepsRaw,
          aiConfidence,
          dateInImageRaw,
          dateNormalized,
          dateMatch,
          alertFlag,
          alertReason,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[image-upload] Supabase insert failed:', msg, e);
        // Fallthrough ไปลอง GAS add-step แบบเดิม
        console.warn('[image-upload] falling through to GAS add-step due to Supabase error');
      }
    }

    // Fallback: GAS add-step แบบเดิม (เมื่อไม่มี Supabase หรือ Supabase ล้ม)
    if (!GAS_API_URL) {
      return NextResponse.json({ error: 'GAS API not configured and Supabase insert failed' }, { status: 500 });
    }
    const gasRes = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'add-step',
        User_ID: String(userId),
        Steps_Count: Number(steps),
        Date_Thai: String(dateThai),
        Record_Method: 'ภาพถ่าย',
        Status: serverStatus,
        Image_Base64: extractBase64(imageBase64),
        AI_Steps: aiSteps != null ? String(aiSteps) : (aiStepsRaw || ''),
        AI_Confidence: aiConfidence != null ? String(aiConfidence) : String(conf),
        Date_In_Image: dateInImageRaw || dateNormalized || '',
        Date_Match: dateMatch === true ? 'TRUE' : dateMatch === false ? 'FALSE' : '',
        Alert_Flag: alertFlag,
        Alert_Reason: alertReason,
        Notes: aiStepsRaw ? `AIอ่าน: ${aiStepsRaw} | วันที่ดิบ: ${dateInImageRaw || '—'}` : '',
      }),
    });

    const gasJson = await gasRes.json().catch(() => ({}));
    if (!gasRes.ok || gasJson.error) {
      console.error('GAS add-step failed:', gasRes.status, gasJson);
      return NextResponse.json({ error: gasJson.error || `GAS error: ${gasRes.status}` }, { status: gasRes.ok ? 500 : gasRes.status });
    }

    // Invalidate cache แม้จะเป็น fallback
    try {
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps');
      invalidate('gas:steps-pending-count');
    } catch {}

    return NextResponse.json({
      ...gasJson,
      aiStatus: serverStatus,
      aiSteps,
      aiStepsRaw,
      aiConfidence,
      dateInImageRaw,
      dateNormalized,
      dateMatch,
      alertFlag,
      alertReason,
    });
  } catch (error) {
    console.error('image-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
