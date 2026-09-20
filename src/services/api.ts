const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

// ---------- Supabase helpers ----------
function isSupabaseAvailable(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return !!url && !!key;
}

// แปลง snake_case (Supabase) -> PascalCase (GAS) ให้ frontend ไม่ต้องแก้
function mapUserRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    User_ID: r.user_id, Prefix: r.prefix, Full_Name: r.full_name, Nickname: r.nickname,
    Position: r.position, Department: r.department, Birth_Date: r.birth_date, Gender: r.gender,
    Weight_kg: r.weight_kg, Height_cm: r.height_cm, BMI_Value: r.bmi_value, Waist_Inch: r.waist_inch,
    Role: r.role, Password: r.password, Total_Points: r.total_points, Level: r.level,
    Personnel_ID: r.personnel_id, Registration_Status: r.registration_status,
    Created_By: r.created_by, Created_Date: r.created_date,
    First_Name: r.first_name, Last_Name: r.last_name, Profile_Image: r.profile_image,
    Activities: r.activities, Step_Record_Mode: r.step_record_mode,
    Device_Token: r.device_token, Device_Updated_At: r.device_updated_at,
    LGBTQ_Identity: r.lgbtq_identity,
  };
}
function mapStepRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    Record_ID: r.record_id, User_ID: r.user_id, Date_Thai: r.date_thai, Steps_Count: r.steps_count,
    Submitted_Steps: r.submitted_steps, Record_Method: r.record_method, Image_Drive_ID: r.image_drive_id,
    Status: r.status, Week_Number: r.week_number, Auditor_ID: r.auditor_id, Reviewed_At: r.reviewed_at,
    Recorded_At: r.recorded_at, Reject_Reason: r.reject_reason, AI_Steps: r.ai_steps,
    AI_Confidence: r.ai_confidence, Date_Match: r.date_match, Alert_Flag: r.alert_flag,
    Alert_Reason: r.alert_reason, Notes: r.notes,
  };
}
function mapSweetRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    Entry_ID: r.entry_id, User_ID: r.user_id, Wednesday_Date: r.wednesday_date,
    Status: r.status, Logged_By: r.logged_by, Reason: r.reason, Recorded_At: r.recorded_at,
  };
}

async function fetchFromSupabase<T>(path: string, params?: Record<string,string>): Promise<T | null> {
  if (!isSupabaseAvailable()) return null;
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (!sb) return null;

    if (path === 'users') {
      let all: Record<string, unknown>[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await sb.from('users').select('*').order('created_at', { ascending: false }).range(from, from + size - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Record<string, unknown>[]));
        if (data.length < size) break;
        from += size;
      }
      return all.map(mapUserRow) as unknown as T;
    }
    if (path === 'steps') {
      let all: Record<string, unknown>[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await sb.from('steps_log').select('*').order('date_thai', { ascending: false }).range(from, from + size - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Record<string, unknown>[]));
        if (data.length < size) break;
        from += size;
      }
      return all.map(mapStepRow) as unknown as T;
    }
    if (path === 'sweet-free') {
      let all: Record<string, unknown>[] = [];
      let from = 0; const size = 1000;
      while (true) {
        const { data, error } = await sb.from('sweet_free').select('*').order('wednesday_date', { ascending: false }).range(from, from + size - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Record<string, unknown>[]));
        if (data.length < size) break;
        from += size;
      }
      return all.map(mapSweetRow) as unknown as T;
    }
    if (path === 'project-window') {
      const { data, error } = await sb.from('project_settings').select('start_date,end_date').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { start: (data as {start_date:string}).start_date, end: (data as {end_date:string}).end_date } as unknown as T;
    }
    if (path === 'steps-pending-count') {
      // params.viewerId ใช้กรองต่างฝ่ายไม่ได้ใน Supabase ตอนนี้ — นับ Pending ทั้งหมดก่อน แล้วให้ Sidebar กรองต่อได้
      const viewerId = params?.viewerId;
      let q = sb.from('steps_log').select('record_id,user_id', { count: 'exact' }).eq('status', 'Pending');
      const { count, error } = await q;
      if (error) throw error;
      // ถ้ามี viewerId ให้ลองนับแบบแม่นด้วย users join (best-effort)
      if (viewerId) {
        try {
          const { data: viewer } = await sb.from('users').select('department').eq('user_id', viewerId).maybeSingle();
          const viewerDept = (viewer as {department:string}|null)?.department || '';
          if (viewerDept) {
            const { data: pend } = await sb.from('steps_log').select('user_id').eq('status', 'Pending').limit(5000);
            const { data: allUsers } = await sb.from('users').select('user_id,department').in('user_id', (pend||[]).map((p: {user_id:string})=>p.user_id));
            const deptByUser = new Map((allUsers||[]).map((u: {user_id:string,department:string})=>[u.user_id, u.department]));
            const cross = (pend||[]).filter((p: {user_id:string}) => deptByUser.get(p.user_id) !== viewerDept);
            return { count: cross.length } as unknown as T;
          }
        } catch {}
      }
      return { count: count ?? 0 } as unknown as T;
    }
    if (path === 'dashboard' || path === 'weight-comparison' || path === 'baseline') {
      // ยังให้ GAS ทำ — ซับซ้อน
      return null;
    }
    return null;
  } catch (e) {
    console.warn(`[supabase fetchData ${path}]`, e);
    return null;
  }
}

function hashPasswordNode(pwd: string): string {
  // GAS: salt(16) + '$' + sha256(salt+pwd) — ใช้ Node crypto
  try {
    // dynamic import crypto
    const crypto = require('crypto') as typeof import('crypto');
    const salt = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const hash = crypto.createHash('sha256').update(salt + pwd, 'utf8').digest('hex');
    return `${salt}$${hash}`;
  } catch {
    // fallback browser
    const salt = Math.random().toString(36).slice(2, 18).padEnd(16, '0').slice(0, 16);
    return `${salt}$${salt}${pwd}`;
  }
}
async function backupToGAS(action: string, data?: Record<string, unknown>): Promise<void> {
  // Google Sheet เป็น backup — เขียนแบบ fire-and-forget ไม่บล็อก Supabase
  try {
    if (!GAS_API_URL) return;
    const url = GAS_API_URL;
    // ใช้ POST text/plain เหมือนเดิม
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data }),
      cache: 'no-store',
    }).catch(() => {});
  } catch {}
}
async function postToSupabase(action: string, data?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!isSupabaseAvailable()) return null;
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (!sb) return null;

    // helper: backup หลัง Supabase สำเร็จ
    const doBackup = () => { backupToGAS(action, data); };

    // register — Supabase primary, GAS backup
    if (action === 'register') {
      const pid = String(data?.Personnel_ID||'').trim();
      const uid = String(data?.User_ID||'').trim();
      const pwd = String(data?.Password||'');
      if (!pid) return { success:false, message:'Personnel_ID required' };
      if (!/^\d{13}$/.test(uid)) return { success:false, message:'เลขบัตรประชาชนต้อง 13 หลัก' };
      if (pwd.length < 6) return { success:false, message:'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
      // check duplicate User_ID
      const { data: dup } = await sb.from('users').select('user_id').eq('user_id', uid).maybeSingle();
      if (dup) return { success:false, message:'เลขบัตรประชาชนนี้มีผู้ใช้งานแล้ว' };
      // find row by personnel_id
      const { data: target } = await sb.from('users').select('personnel_id,registration_status').eq('personnel_id', pid).maybeSingle();
      if (!target) return { success:false, message:'ไม่พบ Personnel_ID ในระบบ' };
      if ((target as {registration_status:string}).registration_status === 'Registered') return { success:false, message:'บุคลากรนี้ลงทะเบียนแล้ว' };
      const bmi = data?.BMI_Value ? String(data.BMI_Value) : null;
      const hashed = hashPasswordNode(pwd);
      const { error } = await sb.from('users').update({
        user_id: uid,
        prefix: data?.Prefix ? String(data.Prefix) : null,
        full_name: data?.Full_Name ? String(data.Full_Name) : null,
        first_name: data?.First_Name ? String(data.First_Name) : null,
        last_name: data?.Last_Name ? String(data.Last_Name) : null,
        nickname: data?.Nickname ? String(data.Nickname) : null,
        position: data?.Position ? String(data.Position) : null,
        department: data?.Department ? String(data.Department) : null,
        birth_date: data?.Birth_Date ? String(data.Birth_Date).slice(0,10) : null,
        gender: data?.Gender ? String(data.Gender) : null,
        weight_kg: data?.Weight_kg ? Number(data.Weight_kg) : null,
        height_cm: data?.Height_cm ? Number(data.Height_cm) : null,
        bmi_value: bmi ? Number(bmi) : null,
        activities: data?.Activities ? String(data.Activities) : null,
        password: hashed,
        registration_status: 'Registered',
        // profile image: ถ้ามี base64 ให้เก็บเป็น File ID ไม่ได้ — เก็บ base64 ย่อไว้ก่อน (หรือปล่อยให้ upload แยก)
      }).eq('personnel_id', pid);
      if (error) throw error;
      // migrate steps/sweet ที่เคยใช้ Personnel_ID ให้เป็น User_ID (backup)
      try { await sb.from('steps_log').update({ user_id: uid }).eq('user_id', pid); } catch {}
      try { await sb.from('sweet_free').update({ user_id: uid }).eq('user_id', pid); } catch {}
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:users');
      doBackup();
      return { success:true, message:'ลงทะเบียนสำเร็จ (Supabase)' };
    }

    // add-step — Supabase primary + GAS backup
    if (action === 'add-step') {
      const uid = String(data?.User_ID||'').trim();
      const dateThai = String(data?.Date_Thai||'').slice(0,10);
      const steps = Number(data?.Steps_Count||0);
      if (!uid || !dateThai || !steps) return { success:false, message:'ข้อมูลไม่ครบ' };
      // check project window
      try {
        const { data: win } = await sb.from('project_settings').select('start_date,end_date').eq('id',1).maybeSingle();
        const s = (win as {start_date:string}|null)?.start_date;
        const e = (win as {end_date:string}|null)?.end_date;
        if (s && e && (dateThai < s || dateThai > e)) return { success:false, message:`นอกห้วงเวลา ${s} ถึง ${e}` };
      } catch {}
      const recordId = 'ST' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();
      const status = String(data?.Status||'Pending');
      const { error } = await sb.from('steps_log').insert({
        record_id: recordId,
        user_id: uid,
        date_thai: dateThai,
        steps_count: steps,
        submitted_steps: steps,
        record_method: data?.Record_Method ? String(data.Record_Method) : 'Manual',
        status: ['Pending','Approved','Rejected'].includes(status) ? status : 'Pending',
        week_number: null,
        recorded_at: data?.Recorded_At ? String(data.Recorded_At) : new Date().toISOString(),
      });
      if (error) throw error;
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps');
      doBackup();
      return { success:true, message:'บันทึกก้าวสำเร็จ (Supabase)', Record_ID: recordId };
    }

    // project-window
    if (action === 'set-project-window') {
      const { error } = await sb.from('project_settings').upsert({
        id: 1, start_date: String(data?.Start_Date||'').slice(0,10), end_date: String(data?.End_Date||'').slice(0,10), updated_by: data?.Logged_By ? String(data.Logged_By) : null,
      }, { onConflict: 'id' });
      if (error) throw error;
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:project-window');
      return { success: true, message: 'บันทึกห้วงเวลาสำเร็จ (Supabase)' };
    }
    // cleanup-out-of-window — ลบ steps/sweet นอกห้วง
    if (action === 'cleanup-out-of-window') {
      const { data: win } = await sb.from('project_settings').select('start_date,end_date').eq('id',1).maybeSingle();
      const start = (win as {start_date:string}|null)?.start_date;
      const end = (win as {end_date:string}|null)?.end_date;
      if (!start || !end) return { success:false, message:'ไม่พบห้วงเวลา' };
      const targets = String(data?.targets||'all');
      let stepsDeleted = 0, sweetDeleted = 0;
      if (targets==='steps' || targets==='all') {
        const { error, count } = await sb.from('steps_log').delete({ count:'exact' }).lt('date_thai', start).or(`date_thai.gt.${end}`);
        // Supabase delete with or: ใช้ 2 ครั้ง
        if (!error) stepsDeleted = count ?? 0;
        else {
          // fallback 2 queries
          const a = await sb.from('steps_log').delete({ count:'exact' }).lt('date_thai', start);
          const b = await sb.from('steps_log').delete({ count:'exact' }).gt('date_thai', end);
          stepsDeleted = (a.count||0)+(b.count||0);
        }
      }
      if (targets==='sweet' || targets==='all') {
        const { count } = await sb.from('sweet_free').delete({ count:'exact' }).lt('wednesday_date', start);
        const { count: c2 } = await sb.from('sweet_free').delete({ count:'exact' }).gt('wednesday_date', end);
        sweetDeleted = (count||0)+(c2||0);
      }
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps'); invalidate('gas:sweet-free');
      return { success:true, message:`ลบ Steps ${stepsDeleted} แถว, Sweet ${sweetDeleted} แถว`, cleaned:{ stepsDeleted, sweetDeleted } };
    }
    // login — Supabase primary
    if (action === 'login') {
      const uid = String(data?.User_ID||'').trim();
      const pwd = String(data?.Password||'');
      const deviceToken = String(data?.Device_Token||'').trim();
      if (!uid || !pwd) return { success:false, message:'กรุณากรอกข้อมูล' };
      const { data: user, error } = await sb.from('users').select('*').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!user) return { success:false, message:'ไม่พบผู้ใช้งาน' };
      // verify password (hash$sha256)
      const stored = String((user as Record<string,unknown>).password||'');
      let ok = false;
      try {
        const parts = stored.split('$');
        if (parts.length===2 && parts[0].length===16) {
          const crypto = require('crypto') as typeof import('crypto');
          const hash = crypto.createHash('sha256').update(parts[0] + pwd, 'utf8').digest('hex');
          ok = hash === parts[1];
        } else {
          ok = stored === pwd; // fallback plain
        }
      } catch { ok = stored === pwd; }
      if (!ok) return { success:false, message:'รหัสผ่านไม่ถูกต้อง' };
      // device single-login: ถ้ามี device_token อื่นอยู่แล้วและไม่ใช่ Force
      const force = String(data?.Force||'').toLowerCase()==='true' || String(data?.Force||'')==='1';
      const existingToken = String((user as Record<string,unknown>).device_token||'');
      const isSameDevice = existingToken && deviceToken && existingToken === deviceToken;
      if (existingToken && !isSameDevice && !force) {
        return { success:false, error:'NEED_CONFIRM', message:'บัญชีนี้กำลังใช้งานบนอุปกรณ์อื่น ต้องการออกจากเครื่องเดิมหรือไม่?', lastAt: (user as Record<string,unknown>).device_updated_at };
      }
      // update device token
      if (deviceToken) {
        await sb.from('users').update({ device_token: deviceToken, device_updated_at: new Date().toISOString() }).eq('user_id', uid);
      }
      const mapped = mapUserRow(user as Record<string,unknown>);
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:users');
      // Google Sheet backup
      backupToGAS(action, data);
      return { success:true, user: mapped, deviceToken };
    }

    // add-sweet-free — Supabase primary
    if (action === 'add-sweet-free') {
      // รองรับทั้ง single และ bulk — ดู no-sugar page ส่ง User_ID เดียวหรือหลายคน
      const wed = String(data?.Wednesday_Date||'').slice(0,10);
      const status = data?.Status;
      const loggedBy = String(data?.Logged_By||'').trim();
      // GAS อาจส่ง User_IDs เป็น array string หรือ User_ID เดียว
      const uids: string[] = [];
      if (data?.User_ID) uids.push(String(data.User_ID).trim());
      if (data?.User_IDs) {
        const raw = String(data.User_IDs);
        raw.split(',').forEach(s=>{ const t=s.trim(); if(t) uids.push(t); });
      }
      // ถ้าไม่มี User_ID ให้ลองจาก data อื่น
      if (uids.length===0 && data?.User_IDs_JSON) {
        try { const arr = JSON.parse(String(data.User_IDs_JSON)); if(Array.isArray(arr)) arr.forEach((x:string)=>uids.push(String(x).trim())); } catch {}
      }
      if (!wed || uids.length===0) return { success:false, message:'ข้อมูลไม่ครบ' };
      const boolStatus = (()=>{ const s=String(status).trim().toLowerCase(); return s==='true'||s==='1'||s==='yes'; })();
      const reason = data?.Reason ? String(data.Reason) : null;
      const rows = uids.map(uid=>({
        entry_id: 'SW' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase() + uid.slice(-3),
        user_id: uid,
        wednesday_date: wed,
        status: boolStatus,
        logged_by: loggedBy || null,
        reason,
        recorded_at: new Date().toISOString(),
      }));
      const { error } = await sb.from('sweet_free').upsert(rows, { onConflict:'user_id,wednesday_date' } as unknown as {onConflict:string});
      // fallback upsert per row ถ้า onConflict ไม่รองรับ composite
      if (error) {
        for (const r of rows) {
          const { error: e2 } = await sb.from('sweet_free').upsert(r, { onConflict:'entry_id' });
          if (e2) throw e2;
        }
      }
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:sweet-free');
      backupToGAS(action, data);
      return { success:true, message:'บันทึกพุธไม่มีเชื่อมสำเร็จ (Supabase)' };
    }
    // update-step-status / delete-step — ทำใน Supabase ได้
    if (action === 'update-step-status') {
      const rid = String(data?.Record_ID||'');
      const status = String(data?.Status||'');
      if (!rid || !['Approved','Rejected'].includes(status)) return null;
      const { error } = await sb.from('steps_log').update({
        status, auditor_id: data?.Auditor_ID ? String(data.Auditor_ID) : null, reviewed_at: new Date().toISOString(),
        reject_reason: data?.Reject_Reason ? String(data.Reject_Reason) : null,
      }).eq('record_id', rid);
      if (error) throw error;
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps'); invalidate('gas:steps-pending-count');
      return { success:true, message:'อัปเดตสถานะสำเร็จ (Supabase)' };
    }
    if (action === 'delete-step') {
      const rid = String(data?.Record_ID||'');
      if (!rid) return { success:false, message:'Record_ID required' };
      // ยืนยันก่อนลบ — frontend ต้องโชว์ ConfirmPopup ก่อนเรียก action นี้ (บังคับ confirm ทุกครั้ง)
      const { error } = await sb.from('steps_log').delete().eq('record_id', rid);
      if (error) throw error;
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:steps');
      backupToGAS(action, data);
      return { success:true, message:'ลบรายการสำเร็จ (Supabase) — ลบเกลี้ยงจากทุกตารางที่เกี่ยวข้องแล้ว' };
    }
    // delete-personnel / delete-user — ลบเกลี้ยง cascading ทั้ง Supabase และ GAS สำรอง
    if (action === 'delete-personnel' || action === 'delete-user') {
      const pid = String(data?.Personnel_ID||'').trim();
      const uid = String(data?.User_ID||'').trim();
      // ต้องยืนยันก่อนลบ — frontend มี ConfirmPopup ทุกจุด
      if (!pid && !uid) return { success:false, message:'ต้องระบุ Personnel_ID หรือ User_ID' };
      // หา user_id ที่ต้องลบ
      let targetUserId: string | null = uid || null;
      let targetPid: string | null = pid || null;
      if (!targetUserId && targetPid) {
        const { data: u } = await sb.from('users').select('user_id').eq('personnel_id', targetPid).maybeSingle();
        targetUserId = (u as {user_id:string}|null)?.user_id || null;
      }
      if (!targetPid && targetUserId) {
        const { data: u2 } = await sb.from('users').select('personnel_id').eq('user_id', targetUserId).maybeSingle();
        targetPid = (u2 as {personnel_id:string}|null)?.personnel_id || null;
      }
      // ลบจากตารางหลัก — FK ON DELETE CASCADE จะลบ steps_log, sweet_free, baseline, weight_after, google_fit_links อัตโนมัติ
      let deleted = 0;
      if (targetPid) {
        const { error, count } = await sb.from('users').delete({ count:'exact' }).eq('personnel_id', targetPid);
        if (error) throw error;
        deleted = count ?? 0;
        if (deleted===0 && targetUserId) {
          const { error: e2, count: c2 } = await sb.from('users').delete({ count:'exact' }).eq('user_id', targetUserId);
          if (e2) throw e2;
          deleted = c2 ?? 0;
        }
      } else if (targetUserId) {
        const { error, count } = await sb.from('users').delete({ count:'exact' }).eq('user_id', targetUserId);
        if (error) throw error;
        deleted = count ?? 0;
      }
      // กันกรณี FK ยังไม่ cascade (ถ้าไม่มี FK) — ลบ manual จากตารางลูก
      if (targetUserId) {
        try { await sb.from('steps_log').delete().eq('user_id', targetUserId); } catch {}
        try { await sb.from('sweet_free').delete().eq('user_id', targetUserId); } catch {}
        try { await sb.from('baseline_records').delete().eq('user_id', targetUserId); } catch {}
        try { await sb.from('weight_after_records').delete().eq('user_id', targetUserId); } catch {}
        try { await sb.from('google_fit_links').delete().eq('user_id', targetUserId); } catch {}
      }
      if (targetPid) {
        try { await sb.from('steps_log').delete().eq('user_id', targetPid); } catch {}
        try { await sb.from('sweet_free').delete().eq('user_id', targetPid); } catch {}
      }
      const { invalidate } = await import('@/lib/gasCache');
      invalidate('gas:users'); invalidate('gas:steps'); invalidate('gas:sweet-free');
      backupToGAS(action, data);
      if (deleted===0) return { success:false, message:'ไม่พบข้อมูลบุคลากรที่ต้องลบ' };
      return { success:true, message:`ลบบุคลากรสำเร็จ — ลบเกลี้ยงจากทุกตารางที่เกี่ยวข้องแล้ว (Supabase + GAS สำรอง)` };
    }
    // อื่นๆ ให้ GAS ทำ
    return null;
  } catch (e) {
    console.warn(`[supabase post ${action}]`, e);
    return null;
  }
}

// จำแนก path ที่ควร cache (read-heavy) กับที่ต้องสด — เพิ่ม 120s ลดโหลด
const READ_CACHE_TTL: Record<string, number> = {
  'users': 120_000,
  'steps': 120_000,
  'project-window': 300_000,
  'google-fit-links': 120_000,
  'sweet-free': 120_000,
  'baseline': 300_000,
  'weight-comparison': 120_000,
  'dashboard': 120_000,
  'steps-pending-count': 30_000,
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
      if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = res.headers.get('Retry-After');
        const delay = retryAfter ? Math.min(8000, parseInt(retryAfter, 10) * 1000 || 0) : 400 * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as unknown as {name:string})?.name === 'AbortError';
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
  // 1) ลอง Supabase ก่อน (ถ้าตั้งค่าไว้)
  if (isSupabaseAvailable() && !opts?.forceRefresh) {
    const sbData = await fetchFromSupabase<T>(path, params);
    if (sbData !== null) {
      // cache ไว้ด้วย
      if (isReadCacheable(path)) {
        try {
          const gasCache = await import('@/lib/gasCache');
          const key = (gasCache.GAS_CACHE_KEYS as Record<string,string>)[path] || `gas:${path}${params ? ':'+new URLSearchParams(params).toString() : ''}`;
          gasCache.setCached(key, sbData, READ_CACHE_TTL[path] ?? 30_000);
        } catch {}
      }
      return sbData;
    }
  }
  // 2) fallback GAS
  try {
    if (!GAS_API_URL) return null;
    const url = `${GAS_API_URL}?path=${path}${params ? '&'+new URLSearchParams(params) : ''}`;
    const cacheable = isReadCacheable(path) && !opts?.forceRefresh;
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
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as unknown as {name:string})?.name === 'AbortError';
    if (isAbort) return null;
    return null;
  }
}

export async function postData(action: string, data?: Record<string,unknown>, opts?: { signal?: AbortSignal }) {
  // ลอง Supabase ก่อนสำหรับ action ที่รองรับ
  const sbRes = await postToSupabase(action, data);
  if (sbRes) return sbRes;
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
      return { success: false, message: friendlyThai(txt2, res.status) } as unknown as Record<string,unknown>;
    });
    if (json && (json as Record<string,unknown>).success === false && typeof (json as Record<string,unknown>).message === 'string' && String((json as Record<string,unknown>).message).includes('<!DOCTYPE')) {
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      (json as Record<string,unknown>).message = friendlyThai(String((json as Record<string,unknown>).message), res.status);
    }
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
    return json as Record<string,unknown>;
  } catch (e) {
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as unknown as {name:string})?.name === 'AbortError';
    if (isAbort) return { success: false, message: 'ยกเลิกคำขอ' };
    const { friendlyThai } = await import('@/lib/thaiErrorMap');
    return { success: false, message: friendlyThai(e, undefined) };
  }
}

export async function postDataJson(action: string, data?: Record<string,unknown>, opts?: { signal?: AbortSignal }) {
  const sbRes = await postToSupabase(action, data);
  if (sbRes) return sbRes;
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
    const json = await res.json().catch(async () => {
      const txt2 = await res.text().catch(() => '');
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      return { success: false, message: friendlyThai(txt2, res.status) };
    }) as Record<string,unknown>;
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
    if ((json as Record<string,unknown>).error === 'ALREADY_REVIEWED') return { success: false, error: 'ALREADY_REVIEWED', ...(json as Record<string,unknown>) };
    if ((json as Record<string,unknown>).error === 'NEED_CONFIRM') return { success: false, error: 'NEED_CONFIRM', ...(json as Record<string,unknown>) };
    if ((json as Record<string,unknown>).success === false && typeof (json as Record<string,unknown>).message === 'string' && String((json as Record<string,unknown>).message).includes('<!DOCTYPE')) {
      const { friendlyThai } = await import('@/lib/thaiErrorMap');
      (json as Record<string,unknown>).message = friendlyThai(String((json as Record<string,unknown>).message), res.status);
    }
    return json as Record<string,unknown>;
  } catch (e) {
    const isAbort = (e instanceof DOMException && e.name === 'AbortError') || (e as unknown as {name:string})?.name === 'AbortError';
    if (isAbort) return { success: false, message: 'ยกเลิกคำขอ' };
    const { friendlyThai } = await import('@/lib/thaiErrorMap');
    return { success: false, message: friendlyThai(e, undefined) };
  }
}

export function invalidateGasCache(pattern: string | RegExp) {
  import('@/lib/gasCache').then(m => m.invalidate(pattern)).catch(() => {});
}
