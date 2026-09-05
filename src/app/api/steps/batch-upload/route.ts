/**
 * ส่งข้อมูลก้าวแบบกลุ่มไป GAS backend (action: add-batch-steps)
 * Server-only AI: หลังรับข้อมูล จะเรียก AI ตรวจภาพทุกใบก่อนส่ง GAS — ถ้าผ่านจะ Approved ทันที ไม่ผ่านจะ Pending ให้ต่างฝ่ายตรวจ
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImage, isAutoApprovable } from '@/lib/serverAi';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function extractBase64(imageBase64: string): string {
  const m = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : imageBase64;
}
function hasAiKeys(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
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
          const today = new Date().toISOString().slice(0,10);
          if (today > String(win.end).slice(0,10)) {
            return NextResponse.json({ error: `โครงการสิ้นสุดแล้ว (${win.start} ถึง ${win.end}) — ระบบล็อคการรับข้อมูล (Data Freeze)` }, { status: 403 });
          }
          const out: string[] = [];
          for (const s of Steps as any[]) {
            const d = String(s.Day || '').trim().slice(0,10);
            if (d && (d < String(win.start).slice(0,10) || d > String(win.end).slice(0,10))) out.push(d);
          }
          if (out.length>0) return NextResponse.json({ error: `นอกห้วงเวลาบันทึก (${win.start} ถึง ${win.end}) — พบวันที่นอกห้วง: ${out.slice(0,3).join(', ')}${out.length>3?' …':''}` }, { status: 400 });
        }
      }
    } catch (e) { console.warn('batch-upload window check failed', e); }

    // ── ตรวจสิทธิ์ฝ่าย: บันทึกได้เฉพาะฝ่ายของตนเองเท่านั้น (กันยิง API ตรง / แก้ devtools) ──
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
      return NextResponse.json({ error: 'ไม่สามารถตรวจสอบสิทธิ์ฝ่ายได้ — โหลดรายชื่อบุคลากรไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ' }, { status: 503 });
    }
    // สร้าง map รองรับทั้ง User_ID และ Personnel_ID (pending users)
    const deptById = new Map<string, string>();
    const userById = new Map<string, any>();
    for (const u of usersList) {
      const uid = String((u as any).User_ID || '').trim();
      const pid = String((u as any).Personnel_ID || '').trim();
      const d = String((u as any).Department || '').trim();
      if (uid) { deptById.set(uid, d); userById.set(uid, u); }
      if (pid && !deptById.has(pid)) { deptById.set(pid, d); if (!userById.has(pid)) userById.set(pid, u); }
    }
    // ถ้า client ไม่ได้ส่ง Logged_Department ให้ดึงจาก usersList
    if (!actorDept) {
      const actor = userById.get(String(Logged_By).trim());
      if (actor) actorDept = String(actor.Department || '').trim();
    }
    if (!actorDept) {
      return NextResponse.json({ error: 'ไม่พบฝ่าย/ส่วนราชการของผู้บันทึก — ไม่สามารถตรวจสอบสิทธิ์ได้' }, { status: 403 });
    }
    // ตรวจว่าผู้บันทึกมีอยู่จริงและตรงกับฝ่ายที่อ้าง
    const actorFromDb = userById.get(String(Logged_By).trim());
    if (actorFromDb && String(actorFromDb.Department || '').trim() !== actorDept) {
      return NextResponse.json({ error: `ฝ่ายของผู้บันทึกไม่ตรงกับข้อมูลระบบ — บันทึกได้เฉพาะฝ่าย "${String(actorFromDb.Department).trim()}" เท่านั้น` }, { status: 403 });
    }
    const violations: { User_ID: string; dept: string; name: string }[] = [];
    for (const s of Steps as any[]) {
      const tid = String(s.User_ID || '').trim();
      const tDept = deptById.get(tid);
      if (!tDept) {
        // ไม่พบผู้ถูกบันทึกในระบบ — ถือว่าข้ามฝ่าย (กันสร้าง User_ID มั่ว)
        violations.push({ User_ID: tid, dept: '— ไม่พบในระบบ —', name: tid });
      } else if (tDept !== actorDept) {
        const tu = userById.get(tid);
        const tName = tu ? String(tu.Full_Name || tu.First_Name || tid) : tid;
        violations.push({ User_ID: tid, dept: tDept, name: tName });
      }
    }
    if (violations.length > 0) {
      const sample = violations.slice(0, 5).map(v => `${v.name} (${v.dept})`).join(', ');
      return NextResponse.json({
        error: `บันทึกได้เฉพาะฝ่าย "${actorDept}" เท่านั้น — พบ ${violations.length} รายการของฝ่ายอื่น: ${sample}${violations.length > 5 ? ' …' : ''}`,
        violations,
        actorDepartment: actorDept,
      }, { status: 403 });
    }
    // ── ตรวจ Mode 1: ล็อกตายตัวทุกกรณี (รวม pending) — ต้องบันทึกด้วยตนเอง เจ้าหน้าที่บันทึกให้ไม่ได้ ──
    const mode1Violations: { User_ID: string; name: string }[] = [];
    for (const s of Steps as any[]) {
      const tid = String(s.User_ID || '').trim();
      const tu = userById.get(tid);
      if (!tu) continue; // ไม่พบแล้วถูกจับเป็น dept violation ไปแล้ว
      const mode = String((tu as any).Step_Record_Mode || '1').trim();
      if (mode !== '2') {
        const tName = String(tu.Full_Name || tu.First_Name || tid);
        mode1Violations.push({ User_ID: tid, name: tName });
      }
    }
    if (mode1Violations.length > 0) {
      const sample = mode1Violations.slice(0, 5).map(v => v.name).join(', ');
      return NextResponse.json({
        error: `ล็อก Mode 1 — พบ ${mode1Violations.length} คนที่อยู่ Mode 1 (บันทึกเอง): ${sample}${mode1Violations.length > 5 ? ' …' : ''} — เจ้าหน้าที่ไม่สามารถบันทึกให้ได้ ต้องให้เจ้าตัวบันทึกด้วยตนเอง`,
        mode1Violations,
      }, { status: 403 });
    }

    // Server-only AI: ตรวจภาพทุกใบก่อนส่ง GAS (ถ้ามีคีย์)
    const useAi = hasAiKeys();
    const processedSteps: any[] = [];
    for (const step of Steps as Record<string, unknown>[]) {
      const base64Raw = String(step.Image_Base64 || '');
      const day = String(step.Day || '');
      const userSteps = Number(step.Steps_Count) || 0;
      let aiSteps: any = step.AI_Steps ?? '';
      let aiConf: any = step.AI_Confidence ?? '';
      let dateInImage: any = step.Date_In_Image ?? '';
      let dateMatch: any = step.Date_Match ?? '';
      let alertFlag: any = step.Alert_Flag ?? 'FALSE';
      let alertReason: any = step.Alert_Reason ?? '';
      let notes: any = step.Notes ?? '';
      let status = 'Approved';
      // ถ้ามีภาพและมีคีย์ — ให้ AI ตรวจจริง (Auto-Approve ต้อง 100% match)
      if (base64Raw && useAi) {
        try {
          const dataUrl = base64Raw.startsWith('data:') ? base64Raw : `data:image/jpeg;base64,${base64Raw}`;
          const ai = await analyzeStepsImage(dataUrl, day, 'auto');
          aiSteps = ai.steps ?? '';
          aiConf = ai.confidence ?? '';
          dateInImage = ai.dateInImage ?? '';
          dateMatch = ai.dateMatch === true ? 'TRUE' : ai.dateMatch === false ? 'FALSE' : '';
          // เงื่อนไข Auto-Approve: steps ตรง 100% AND date ตรง AND confidence >=0.8 AND ไม่มี alert
          const autoOk = isAutoApprovable(ai.steps, Number(userSteps), ai.dateMatch, ai.confidence);
          const stepsExact = ai.steps != null && Number(ai.steps) === Number(userSteps);
          let reasons = [...ai.alertReasons];
          if (!stepsExact && ai.steps != null) {
            reasons.push(`จำนวนก้าวที่กรอก (${Number(userSteps).toLocaleString()}) ไม่ตรงกับที่ AI อ่าน (${Number(ai.steps).toLocaleString()}) — ต้องตรง 100%`);
          }
          alertReason = reasons.join('; ');
          alertFlag = reasons.length > 0 ? 'TRUE' : 'FALSE';
          if (autoOk && reasons.length === 0) {
            status = 'Approved';
          } else {
            status = 'Pending';
            alertFlag = 'TRUE';
            if (!alertReason) alertReason = 'ไม่เข้าเงื่อนไขอนุมัติอัตโนมัติ — รอเจ้าหน้าที่ต่างฝ่ายตรวจ';
          }
          notes = (notes ? notes + ' | ' : '') + ai.notes;
        } catch (e) {
          console.warn('batch AI analyze failed for', day, e);
          alertFlag = 'TRUE';
          alertReason = (alertReason ? alertReason + '; ' : '') + 'AI ตรวจไม่สำเร็จ — รอตรวจสอบ manual';
          status = 'Pending';
        }
      } else if (base64Raw && !useAi) {
        // ไม่มีคีย์ AI — ให้ Pending เพื่อรอ manual
        status = 'Pending';
        alertFlag = 'TRUE';
        alertReason = 'ไม่มีการตรวจ AI (ไม่มีคีย์) — รอเจ้าหน้าที่ต่างฝ่ายตรวจ';
      } else if (!base64Raw) {
        status = 'Pending';
        alertFlag = 'TRUE';
        alertReason = 'ไม่มีภาพหลักฐาน';
      }
      processedSteps.push({
        ...step,
        Image_Base64: base64Raw ? extractBase64(String(step.Image_Base64)) : '',
        AI_Steps: aiSteps,
        AI_Confidence: aiConf,
        Date_In_Image: dateInImage,
        Date_Match: dateMatch,
        Alert_Flag: alertFlag,
        Alert_Reason: alertReason,
        Notes: notes,
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
    // เพิ่มสรุป AI ให้ client
    const aiApproved = processedSteps.filter(s => s.Status === 'Approved').length;
    const aiPending = processedSteps.filter(s => s.Status === 'Pending').length;
    return NextResponse.json({ ...gasJson, aiApproved, aiPending });
  } catch (error) {
    console.error('batch-upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
