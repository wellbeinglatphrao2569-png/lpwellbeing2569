/**
 * ส่งข้อมูลก้าวแบบกลุ่มไป GAS backend (action: add-batch-steps)
 * ทุกรายการบันทึกเป็น Pending รอต่างฝ่ายตรวจ manual
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImageWithTyphoon, isTyphoonConfigured } from '@/lib/typhoon';
import { extractStepsFromText } from '@/lib/stepsExtractor';
import { normalizeOcrDate, isDateMatch } from '@/lib/stepsDateParser';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function extractBase64(imageBase64: string): string {
  const m = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : imageBase64;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { Logged_By, Logged_Department, Week_Start, Steps, Allow_Overwrite } = body as { Logged_By: string; Logged_Department?: string; Week_Start: string; Steps: unknown[]; Allow_Overwrite: string };
    if (!Logged_By) return NextResponse.json({ error: 'Logged_By is required' }, { status: 400 });
    if (!Week_Start) return NextResponse.json({ error: 'Week_Start is required' }, { status: 400 });
    if (!Steps || !Array.isArray(Steps) || Steps.length === 0) return NextResponse.json({ error: 'Steps array is required' }, { status: 400 });
    if (!GAS_API_URL) return NextResponse.json({ error: 'GAS API not configured' }, { status: 500 });

    // ห้วงเวลาบันทึก + Data Freeze
    try {
      const winRes = await fetch(`${GAS_API_URL}?path=project-window`, { cache: 'no-store' });
      if (winRes.ok) {
        const win = await winRes.json();
        if (win && win.start && win.end) {
          const today = new Date().toISOString().slice(0, 10);
          if (today > String(win.end).slice(0, 10)) {
            return NextResponse.json({ error: `โครงการสิ้นสุดแล้ว (${win.start} ถึง ${win.end}) — ระบบล็อคการรับข้อมูล (Data Freeze)` }, { status: 403 });
          }
          const out: string[] = [];
          for (const s of Steps as any[]) {
            const d = String(s.Day || '').trim().slice(0, 10);
            if (d && (d < String(win.start).slice(0, 10) || d > String(win.end).slice(0, 10))) out.push(d);
          }
          if (out.length > 0) return NextResponse.json({ error: `นอกห้วงเวลาบันทึก (${win.start} ถึง ${win.end}) — พบวันที่นอกห้วง: ${out.slice(0, 3).join(', ')}${out.length > 3 ? ' …' : ''}` }, { status: 400 });
        }
      }
    } catch (e) {
      console.warn('batch-upload window check failed', e);
    }

    // ตรวจสิทธิ์ฝ่าย
    let actorDept = String(Logged_Department || '').trim();
    let usersList: any[] = [];
    let usersFetchOk = false;
    try {
      const uRes = await fetch(`${GAS_API_URL}?path=users`, { cache: 'no-store' });
      if (uRes.ok) {
        const j = await uRes.json();
        if (Array.isArray(j)) { usersList = j; usersFetchOk = true; }
      }
    } catch (e) {
      console.warn('batch-upload: fetch users for dept check failed', e);
    }
    if (!usersFetchOk || usersList.length === 0) {
      return NextResponse.json({ error: 'ไม่สามารถตรวจสอบสิทธิ์ฝ่ายได้ — โหลดรายชื่อบุคลากรไม่สำเร็จ' }, { status: 503 });
    }
    const deptById = new Map<string, string>();
    const userById = new Map<string, any>();
    for (const u of usersList) {
      const uid = String((u as any).User_ID || '').trim();
      const pid = String((u as any).Personnel_ID || '').trim();
      const d = String((u as any).Department || '').trim();
      if (uid) { deptById.set(uid, d); userById.set(uid, u); }
      if (pid && !deptById.has(pid)) { deptById.set(pid, d); if (!userById.has(pid)) userById.set(pid, u); }
    }
    if (!actorDept) {
      const actor = userById.get(String(Logged_By).trim());
      if (actor) actorDept = String(actor.Department || '').trim();
    }
    if (!actorDept) {
      return NextResponse.json({ error: 'ไม่พบฝ่าย/ส่วนราชการของผู้บันทึก' }, { status: 403 });
    }
    const actorFromDb = userById.get(String(Logged_By).trim());
    if (actorFromDb && String(actorFromDb.Department || '').trim() !== actorDept) {
      return NextResponse.json({ error: `ฝ่ายของผู้บันทึกไม่ตรงกับข้อมูลระบบ — บันทึกได้เฉพาะฝ่าย "${String(actorFromDb.Department).trim()}" เท่านั้น` }, { status: 403 });
    }
    const violations: { User_ID: string; dept: string; name: string }[] = [];
    for (const s of Steps as any[]) {
      const tid = String(s.User_ID || '').trim();
      const tDept = deptById.get(tid);
      if (!tDept) {
        violations.push({ User_ID: tid, dept: '— ไม่พบในระบบ —', name: tid });
      } else if (tDept !== actorDept) {
        const tu = userById.get(tid);
        const tName = tu ? String(tu.Full_Name || tu.First_Name || tid) : tid;
        violations.push({ User_ID: tid, dept: tDept, name: tName });
      }
    }
    if (violations.length > 0) {
      const sample = violations.slice(0, 5).map(v => `${v.name} (${v.dept})`).join(', ');
      return NextResponse.json({ error: `บันทึกได้เฉพาะฝ่าย "${actorDept}" เท่านั้น — พบ ${violations.length} รายการของฝ่ายอื่น: ${sample}${violations.length > 5 ? ' …' : ''}`, violations, actorDepartment: actorDept }, { status: 403 });
    }
    const mode1Violations: { User_ID: string; name: string }[] = [];
    for (const s of Steps as any[]) {
      const tid = String(s.User_ID || '').trim();
      const tu = userById.get(tid);
      if (!tu) continue;
      const mode = String((tu as any).Step_Record_Mode || '1').trim();
      if (mode !== '2') {
        const tName = String(tu.Full_Name || tu.First_Name || tid);
        mode1Violations.push({ User_ID: tid, name: tName });
      }
    }
    if (mode1Violations.length > 0) {
      const sample = mode1Violations.slice(0, 5).map(v => v.name).join(', ');
      return NextResponse.json({ error: `ล็อก Mode 1 — พบ ${mode1Violations.length} คนที่อยู่ Mode 1 (บันทึกเอง): ${sample}${mode1Violations.length > 5 ? ' …' : ''}`, mode1Violations }, { status: 403 });
    }

    // ตรวจด้วย Typhoon ถ้า client ส่ง AI payload มาแล้วให้ใช้เลย, ถ้าไม่ให้ลองอ่านเอง (fallback)
    const processedSteps: any[] = [];
    let aiApprovedCount = 0;
    let aiPendingCount = 0;

    const typhoonEnabled = isTyphoonConfigured();

    for (const step of Steps as Record<string, unknown>[]) {
      const base64Raw = String(step.Image_Base64 || '');
      const day = String(step.Day || '');
      const userSteps = Number(step.Steps_Count) || 0;
      let aiSteps: number | null = null;
      let aiStepsRaw: string | null = null;
      let aiConf: number | null = null;
      let dateRaw: string | null = null;
      let dateNorm: string | null = null;
      let dateMatch: boolean | null = null;
      let alertFlag: 'TRUE' | 'FALSE' = 'TRUE';
      let alertReason = 'รอตรวจสอบ manual';

      // ถ้า client ส่ง AI fields มาแล้ว (จาก /api/ai/analyze-steps)
      const sAny = step as any;
      if (sAny.AI_Steps != null || sAny.Date_In_Image != null || sAny.aiSteps != null) {
        aiSteps = sAny.AI_Steps != null && String(sAny.AI_Steps).trim() !== '' ? Number(sAny.AI_Steps) : (sAny.aiSteps != null ? Number(sAny.aiSteps) : null);
        aiStepsRaw = sAny.AI_Steps_Raw ?? sAny.aiStepsRaw ?? null;
        aiConf = sAny.AI_Confidence != null && String(sAny.AI_Confidence).trim() !== '' ? Number(sAny.AI_Confidence) : (sAny.confidence != null ? Number(sAny.confidence) : null);
        dateRaw = sAny.Date_In_Image ?? sAny.dateRaw ?? null;
        dateNorm = sAny.Date_Normalized ?? sAny.dateNormalized ?? null;
        const dm = sAny.Date_Match ?? sAny.dateMatch;
        dateMatch = dm === true || dm === 'TRUE' ? true : dm === false || dm === 'FALSE' ? false : null;
        alertFlag = sAny.Alert_Flag === 'FALSE' || sAny.alertFlag === 'FALSE' ? 'FALSE' : 'TRUE';
        alertReason = sAny.Alert_Reason ?? sAny.alertReason ?? alertReason;
        if (!dateNorm && dateRaw) dateNorm = normalizeOcrDate(dateRaw, day);
        if (dateMatch == null && dateRaw) dateMatch = isDateMatch(dateRaw, day);
      } else if (typhoonEnabled && base64Raw) {
        try {
          const ty = await analyzeStepsImageWithTyphoon(base64Raw, { timeoutMs: 15000 });
          dateRaw = ty.dateRaw ?? null;
          aiConf = ty.confidence ?? null;
          if (ty.steps != null) {
            aiSteps = Number(ty.steps);
            aiStepsRaw = ty.stepsRaw ?? String(ty.steps);
          } else if (ty.rawText) {
            const ext = extractStepsFromText(ty.rawText);
            aiSteps = ext.steps;
            aiStepsRaw = ext.raw;
          }
          dateNorm = dateRaw ? normalizeOcrDate(dateRaw, day) : null;
          dateMatch = dateRaw ? isDateMatch(dateRaw, day) : null;
        } catch (e) {
          console.warn('batch Typhoon failed for', day, e);
        }
      }

      // Strict 0% tolerance
      const stepsExact = aiSteps != null ? aiSteps === userSteps : null;
      const conf = aiConf ?? (aiSteps != null && dateNorm ? 0.7 : 0.3);
      if (sAny.Alert_Reason == null && sAny.alertReason == null) {
        if (aiSteps == null) {
          alertFlag = 'TRUE';
          alertReason = 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ตรวจสอบ';
        } else if (stepsExact === false) {
          alertFlag = 'TRUE';
          alertReason = `ก้าวไม่ตรงกัน (กรอก ${userSteps.toLocaleString()} vs อ่าน ${aiSteps.toLocaleString()})`;
        } else if (dateMatch === false) {
          alertFlag = 'TRUE';
          alertReason = `วันที่ในภาพไม่ตรง (${day} vs "${dateRaw}" → ${dateNorm || 'อ่านไม่ได้'})`;
        } else if (dateMatch == null) {
          alertFlag = 'TRUE';
          alertReason = `อ่านวันที่ในภาพไม่ชัดเจน ("${dateRaw || '—'}")`;
        } else if (conf < 0.85) {
          alertFlag = 'TRUE';
          alertReason = `ความมั่นใจต่ำ (${Math.round(conf * 100)}%)`;
        } else {
          alertFlag = 'FALSE';
          alertReason = '';
        }
      }

      const autoApprove = alertFlag === 'FALSE' && stepsExact === true && dateMatch === true && conf >= 0.85;
      const status: 'Approved' | 'Pending' = autoApprove ? 'Approved' : 'Pending';
      if (autoApprove) aiApprovedCount++; else aiPendingCount++;

      processedSteps.push({
        ...step,
        Image_Base64: base64Raw ? extractBase64(String(step.Image_Base64)) : '',
        AI_Steps: aiSteps != null ? String(aiSteps) : (aiStepsRaw || ''),
        AI_Confidence: aiConf != null ? String(aiConf) : String(conf),
        Date_In_Image: dateRaw || dateNorm || '',
        Date_Match: dateMatch === true ? 'TRUE' : dateMatch === false ? 'FALSE' : '',
        Alert_Flag: alertFlag,
        Alert_Reason: alertReason,
        Notes: aiStepsRaw ? `AIอ่าน: ${aiStepsRaw} | วันที่ดิบ: ${dateRaw || '—'}` : String(step.Notes || ''),
        Status: status,
      });
    }

    const gasRes = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'add-batch-steps',
        Logged_By: String(Logged_By),
        Week_Start: String(Week_Start),
        Allow_Overwrite: Allow_Overwrite ? '1' : '0',
        Steps: processedSteps,
      }),
    });
    const gasJson = await gasRes.json().catch(() => ({}));
    if (!gasRes.ok || gasJson.error) {
      console.error('GAS add-batch-steps failed:', gasRes.status, gasJson);
      return NextResponse.json({ error: gasJson.error || `GAS error: ${gasRes.status}` }, { status: gasRes.ok ? 500 : gasRes.status });
    }
    return NextResponse.json({ ...gasJson, aiApproved: aiApprovedCount, aiPending: aiPendingCount });
  } catch (error) {
    console.error('batch-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
