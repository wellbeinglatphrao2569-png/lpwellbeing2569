/**
 * ส่งข้อมูลก้าวแบบกลุ่มไป GAS backend (action: add-batch-steps)
 * ทุกรายการบันทึกเป็น Pending รอต่างฝ่ายตรวจ manual
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeStepsImageWithTyphoon, isTyphoonConfigured } from '@/lib/typhoon';
import { extractStepsFromText } from '@/lib/stepsExtractor';
import { normalizeOcrDate, isDateMatch } from '@/lib/stepsDateParser';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function extractBase64(imageBase64: string): string {
  const m = imageBase64.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : imageBase64;
}
async function backupBatchToGAS(payload: Record<string, unknown>): Promise<void> {
  if (!GAS_API_URL) return;
  try {
    fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'add-batch-steps', ...payload }),
      cache: 'no-store',
    }).catch(() => {});
  } catch {}
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { Logged_By, Logged_Department, Week_Start, Steps, Allow_Overwrite } = body as { Logged_By: string; Logged_Department?: string; Week_Start: string; Steps: unknown[]; Allow_Overwrite: string };
    if (!Logged_By) return NextResponse.json({ error: 'Logged_By is required' }, { status: 400 });
    if (!Week_Start) return NextResponse.json({ error: 'Week_Start is required' }, { status: 400 });
    if (!Steps || !Array.isArray(Steps) || Steps.length === 0) return NextResponse.json({ error: 'Steps array is required' }, { status: 400 });
    if (!GAS_API_URL) return NextResponse.json({ error: 'GAS API not configured' }, { status: 500 });

    // Supabase primary — ห้วงเวลา + users จาก Supabase, GAS เป็นสำรอง
    let win: {start:string,end:string}|null = null;
    let usersList: any[] = [];
    let usersFetchOk = false;
    if (isSupabaseConfigured()) {
      try {
        const sb = getSupabase()!;
        const { data: winRow } = await sb.from('project_settings').select('start_date,end_date').eq('id',1).maybeSingle();
        if (winRow) win = { start: (winRow as {start_date:string}).start_date, end: (winRow as {end_date:string}).end_date };
        // users paginated
        let all: any[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await sb.from('users').select('*').range(from, from+999);
          if (error) throw error;
          if (!data || data.length===0) break;
          all.push(...data);
          if (data.length<1000) break;
          from+=1000;
        }
        // map to GAS shape for existing checks
        usersList = all.map((r: Record<string,unknown>)=> ({
          User_ID: r.user_id, Personnel_ID: r.personnel_id, Full_Name: r.full_name, First_Name: r.first_name, Last_Name: r.last_name,
          Department: r.department, Step_Record_Mode: r.step_record_mode, Role: r.role,
        }));
        usersFetchOk = usersList.length>0;
        if (win && win.start && win.end) {
          const today = new Date().toISOString().slice(0, 10);
          if (today > win.end) return NextResponse.json({ error: `โครงการสิ้นสุดแล้ว (${win.start} ถึง ${win.end}) — ระบบล็อคการรับข้อมูล (Data Freeze)` }, { status: 403 });
          const out: string[] = [];
          for (const s of Steps as any[]) {
            const d = String(s.Day || '').trim().slice(0, 10);
            if (d && (d < win.start || d > win.end)) out.push(d);
          }
          if (out.length > 0) return NextResponse.json({ error: `นอกห้วงเวลาบันทึก (${win.start} ถึง ${win.end}) — พบวันที่นอกห้วง: ${out.slice(0, 3).join(', ')}${out.length > 3 ? ' …' : ''}` }, { status: 400 });
        }
      } catch (e) {
        console.warn('batch-upload Supabase window/users failed', e);
      }
    }
    // fallback GAS ถ้า Supabase ไม่พร้อม
    if (!usersFetchOk) {
      try {
        const [winRes, uRes] = await Promise.all([
          fetch(`${GAS_API_URL}?path=project-window`, { cache: 'no-store', signal: request.signal }),
          fetch(`${GAS_API_URL}?path=users`, { cache: 'no-store', signal: request.signal }),
        ]);
        if (winRes.ok) {
          const w = await winRes.json().catch(() => null);
          if (w && w.start && w.end) {
            win = { start: String(w.start).slice(0,10), end: String(w.end).slice(0,10) };
            const today = new Date().toISOString().slice(0, 10);
            if (today > win.end) return NextResponse.json({ error: `โครงการสิ้นสุดแล้ว (${win.start} ถึง ${win.end}) — ระบบล็อคการรับข้อมูล (Data Freeze)` }, { status: 403 });
            const out: string[] = [];
            for (const s of Steps as any[]) {
              const d = String(s.Day || '').trim().slice(0, 10);
              if (d && (d < win.start || d > win.end)) out.push(d);
            }
            if (out.length > 0) return NextResponse.json({ error: `นอกห้วงเวลาบันทึก (${win.start} ถึง ${win.end}) — พบวันที่นอกห้วง: ${out.slice(0, 3).join(', ')}${out.length > 3 ? ' …' : ''}` }, { status: 400 });
          }
        }
        if (uRes.ok) {
          const j = await uRes.json().catch(() => null);
          if (Array.isArray(j)) { usersList = j; usersFetchOk = true; }
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return NextResponse.json({ error: 'คำขอถูกยกเลิก' }, { status: 499 });
        console.warn('batch-upload GAS fallback failed', e);
      }
    }

    // ตรวจสิทธิ์ฝ่าย
    let actorDept = String(Logged_Department || '').trim();
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

    // Hybrid: trust client AI ถ้ามี, ทำ Typhoon แบบ parallel เฉพาะรายการที่ไม่มี AI
    const typhoonEnabled = isTyphoonConfigured();
    const needsTyphoonIdx: number[] = [];
    const preParsed: Array<{
      aiSteps: number | null; aiStepsRaw: string | null; aiConf: number | null;
      dateRaw: string | null; dateNorm: string | null; dateMatch: boolean | null;
      alertFlag: 'TRUE' | 'FALSE'; alertReason: string;
    }> = [];

    // แยกก่อนว่า item ไหนมี AI แล้ว
    for (let i = 0; i < Steps.length; i++) {
      const step = Steps[i] as Record<string, unknown>;
      const sAny = step as any;
      const day = String(step.Day || '');
      const hasClientAI = sAny.AI_Steps != null || sAny.Date_In_Image != null || sAny.aiSteps != null || (sAny.AI_Confidence != null && String(sAny.AI_Confidence).trim() !== '');
      if (hasClientAI) {
        let aiSteps: number | null = sAny.AI_Steps != null && String(sAny.AI_Steps).trim() !== '' ? Number(sAny.AI_Steps) : (sAny.aiSteps != null ? Number(sAny.aiSteps) : null);
        if (aiSteps != null && isNaN(aiSteps)) aiSteps = null;
        let aiStepsRaw: string | null = sAny.AI_Steps_Raw ?? sAny.aiStepsRaw ?? null;
        let aiConf: number | null = sAny.AI_Confidence != null && String(sAny.AI_Confidence).trim() !== '' ? Number(sAny.AI_Confidence) : (sAny.confidence != null ? Number(sAny.confidence) : null);
        let dateRaw: string | null = sAny.Date_In_Image ?? sAny.dateRaw ?? null;
        let dateNorm: string | null = sAny.Date_Normalized ?? sAny.dateNormalized ?? null;
        const dm = sAny.Date_Match ?? sAny.dateMatch;
        let dateMatch: boolean | null = dm === true || dm === 'TRUE' ? true : dm === false || dm === 'FALSE' ? false : null;
        let alertFlag: 'TRUE' | 'FALSE' = sAny.Alert_Flag === 'FALSE' || sAny.alertFlag === 'FALSE' ? 'FALSE' : 'TRUE';
        let alertReason: string = sAny.Alert_Reason ?? sAny.alertReason ?? 'รอตรวจสอบ manual';
        if (!dateNorm && dateRaw) dateNorm = normalizeOcrDate(dateRaw, day);
        if (dateMatch == null && dateRaw) dateMatch = isDateMatch(dateRaw, day);
        preParsed[i] = { aiSteps, aiStepsRaw, aiConf, dateRaw, dateNorm, dateMatch, alertFlag, alertReason };
      } else {
        preParsed[i] = { aiSteps: null, aiStepsRaw: null, aiConf: null, dateRaw: null, dateNorm: null, dateMatch: null, alertFlag: 'TRUE', alertReason: 'รอตรวจสอบ manual' };
        if (typhoonEnabled && String((step as any).Image_Base64 || '').trim()) needsTyphoonIdx.push(i);
      }
    }

    // parallel Typhoon เฉพาะที่ต้องทำ (p-limit 3) — เร็วขึ้นมากจาก serial
    if (needsTyphoonIdx.length > 0) {
      const limit = 3;
      for (let batch = 0; batch < needsTyphoonIdx.length; batch += limit) {
        if (request.signal.aborted) break;
        const chunk = needsTyphoonIdx.slice(batch, batch + limit);
        await Promise.all(chunk.map(async (idx) => {
          const step = Steps[idx] as Record<string, unknown>;
          const day = String(step.Day || '');
          const base64Raw = String(step.Image_Base64 || '');
          try {
            const now = new Date();
            const ty = await analyzeStepsImageWithTyphoon(base64Raw, {
              timeoutMs: 15000,
              ctx: { systemDate: now.toISOString().slice(0, 10), targetDate: day, currentYear: String(now.getFullYear()), currentThaiYear: String(now.getFullYear() + 543) },
            });
            const tySteps = (ty as any).step_count ?? ty.steps ?? null;
            let aiSteps: number | null = null;
            let aiStepsRaw: string | null = null;
            if (tySteps != null) {
              aiSteps = Number(String(tySteps).replace(/,/g, ''));
              if (isNaN(aiSteps)) aiSteps = null;
              aiStepsRaw = ty.stepsRaw ?? String(tySteps);
            } else if (ty.rawText) {
              const ext = extractStepsFromText(ty.rawText);
              aiSteps = ext.steps; aiStepsRaw = ext.raw;
            }
            const dateRaw = (ty as any).detected_date_raw ?? ty.dateRaw ?? null;
            const tyFmt = (ty as any).formatted_date ?? null;
            const tyMatched = (ty as any).is_date_matched ?? null;
            const aiConf = (ty as any).confidence_score ?? ty.confidence ?? null;
            let dateNorm: string | null = null;
            let dateMatch: boolean | null = null;
            if (tyFmt && /^\d{4}-\d{2}-\d{2}$/.test(tyFmt)) {
              dateNorm = tyFmt; dateMatch = tyMatched != null ? Boolean(tyMatched) : tyFmt === day;
            } else {
              dateNorm = dateRaw ? normalizeOcrDate(dateRaw, day) : null;
              dateMatch = dateRaw ? isDateMatch(dateRaw, day) : null;
              if (tyMatched != null) dateMatch = Boolean(tyMatched);
            }
            preParsed[idx] = { aiSteps, aiStepsRaw, aiConf, dateRaw, dateNorm, dateMatch, alertFlag: 'TRUE', alertReason: 'รอตรวจสอบ manual' };
          } catch (e) {
            console.warn('batch Typhoon failed for', day, e);
          }
        }));
      }
    }

    const processedSteps: any[] = [];
    let aiApprovedCount = 0;
    let aiPendingCount = 0;
    for (let i = 0; i < Steps.length; i++) {
      const step = Steps[i] as Record<string, unknown>;
      const sAny = step as any;
      const base64Raw = String(step.Image_Base64 || '');
      const day = String(step.Day || '');
      const userSteps = Number(step.Steps_Count) || 0;
      let { aiSteps, aiStepsRaw, aiConf, dateRaw, dateNorm, dateMatch, alertFlag, alertReason } = preParsed[i];

      // Strict 0% tolerance — คำนวณ alert ใหม่ถ้า client ไม่ได้ส่ง reason มา
      const stepsExact = aiSteps != null ? aiSteps === userSteps : null;
      const conf = aiConf ?? (aiSteps != null && dateNorm ? 0.7 : 0.3);
      if (sAny.Alert_Reason == null && sAny.alertReason == null) {
        if (aiSteps == null) {
          alertFlag = 'TRUE'; alertReason = 'อ่านจำนวนก้าวไม่ชัดเจน — ส่งให้เจ้าหน้าที่ตรวจสอบ';
        } else if (stepsExact === false) {
          alertFlag = 'TRUE'; alertReason = `ก้าวไม่ตรงกัน (กรอก ${userSteps.toLocaleString()} AI อ่านได้ ${aiSteps.toLocaleString()})`;
        } else if (dateMatch === false) {
          alertFlag = 'TRUE'; alertReason = `วันที่ในภาพไม่ตรง (${day} AI อ่านได้ "${dateRaw}" → ${dateNorm || 'อ่านไม่ได้'})`;
        } else if (dateMatch == null) {
          alertFlag = 'TRUE'; alertReason = `อ่านวันที่ในภาพไม่ชัดเจน ("${dateRaw || '—'}")`;
        } else if (conf < 0.85) {
          alertFlag = 'TRUE'; alertReason = `ความมั่นใจต่ำ (${Math.round(conf * 100)}%)`;
        } else {
          alertFlag = 'FALSE'; alertReason = '';
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

    // Supabase primary — insert โดยตรง
    if (isSupabaseConfigured()) {
      try {
        const sb = getSupabase()!;
        // ตรวจซ้ำ Approved ถ้าไม่อนุญาต overwrite
        const allowOverwriteBool = String(Allow_Overwrite||'').trim()==='1' || String(Allow_Overwrite).toLowerCase()==='true';
        let saved = 0, skipped = 0, errors = 0;
        for (const s of processedSteps as any[]) {
          const uid = String(s.User_ID||'').trim();
          const day = String(s.Day||'').trim().slice(0,10);
          const stepsCount = Number(s.Steps_Count)||0;
          if (!uid || !day || !stepsCount) { errors++; continue; }
          // check existing Approved
          const { data: existing } = await sb.from('steps_log').select('record_id').eq('user_id', uid).eq('date_thai', day).eq('status','Approved').maybeSingle();
          if (existing && !allowOverwriteBool) { skipped++; continue; }
          // รูปภาพเก็บที่ Drive — Supabase เก็บแค่ Drive File ID (ข้อความ) ตามที่ร้องขอ
          // Drive จะอัปโหลดผ่าน GAS backup (backupBatchToGAS) — ที่นี่เก็บ null ไว้ก่อน แล้ว GAS จะเติม Drive ID ให้
          const imagePath: string | null = null;
          // ถ้ามีอยู่แล้วและ allow → update, ถ้าไม่มี → insert
          if (existing) {
            const { error } = await sb.from('steps_log').update({
              steps_count: stepsCount,
              submitted_steps: stepsCount,
              record_method: 'Batch (เจ้าหน้าที่)',
              image_drive_id: imagePath || null,
              ai_steps: s.AI_Steps ? Number(s.AI_Steps) : null,
              ai_confidence: s.AI_Confidence ? Number(s.AI_Confidence) : null,
              date_match: s.Date_Match === 'TRUE' ? true : s.Date_Match==='FALSE' ? false : null,
              alert_flag: s.Alert_Flag === 'TRUE',
              alert_reason: s.Alert_Reason || null,
              status: s.Status === 'Approved' ? 'Approved' : 'Pending',
              reviewed_at: s.Status==='Approved' ? new Date().toISOString() : null,
              auditor_id: s.Status==='Approved' ? null : null,
            }).eq('record_id', (existing as {record_id:string}).record_id);
            if (error) { errors++; continue; }
            saved++;
          } else {
            const recordId = 'ST' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();
            const { error } = await sb.from('steps_log').insert({
              record_id: recordId,
              user_id: uid,
              date_thai: day,
              steps_count: stepsCount,
              submitted_steps: stepsCount,
              record_method: 'Batch (เจ้าหน้าที่)',
              image_drive_id: imagePath,
              ai_steps: s.AI_Steps ? Number(s.AI_Steps) : null,
              ai_confidence: s.AI_Confidence ? Number(s.AI_Confidence) : null,
              date_match: s.Date_Match === 'TRUE' ? true : s.Date_Match==='FALSE' ? false : null,
              alert_flag: s.Alert_Flag === 'TRUE',
              alert_reason: s.Alert_Reason || null,
              status: s.Status === 'Approved' ? 'Approved' : 'Pending',
              week_number: null,
              auditor_id: null,
              reviewed_at: s.Status==='Approved' ? new Date().toISOString() : null,
              recorded_at: new Date().toISOString(),
            });
            if (error) { errors++; continue; }
            saved++;
          }
        }
        // backup to GAS
        backupBatchToGAS({ Logged_By: String(Logged_By), Week_Start: String(Week_Start), Allow_Overwrite: Allow_Overwrite ? '1' : '0', Steps: processedSteps });
        return NextResponse.json({ success:true, saved, skipped, errors, aiApproved: aiApprovedCount, aiPending: aiPendingCount, message: `บันทึกสำเร็จ ${saved} รายการ${skipped?` ข้าม ${skipped}`:''}${errors?` ผิดพลาด ${errors}`:''}` });
      } catch (e) {
        console.warn('Supabase batch insert failed, fallback to GAS', e);
      }
    }
    // fallback GAS
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
