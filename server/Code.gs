/**
 * ลาดพร้าวสร้างสุข (Ladprao Happy) - Google Apps Script Backend
 * Version: 1.0.0
 * Last Updated: กรกฎาคม พ.ศ. 2569
 * Owner: สำนักงานเขตลาดพร้าว กรุงเทพมหานคร
 */

// ===== CONFIGURATION =====
const CONFIG = {
  SPREADSHEET_ID: '1cwafR4tIt-gYwkeN_NoH4GeXRJKF76uJNNG3u7U46VI',
  PROGRAM_END_DATE: '2026-11-13',
  SHEET_NAMES: {
    USERS: 'Users',
    STEPS_LOG: 'Steps_Log',
    SWEET_FREE: 'Sweet_Free',
    HAPPY_CONNECT: 'Happy_Connect',
    VOICE_EXECUTIVE: 'Voice_Executive',
    NEWS: 'News',
    AUDIT_LOG: 'Audit_Log',
    WELLNESS_ASSESSMENT: 'Wellness_Assessment',
    POINTS_HISTORY: 'Points_History',
    TRAINING: 'Training',
    TRAINING_REGISTRATION: 'Training_Registration',
    WEIGHT_AFTER: 'Weight_After',
    BASELINE: 'Baseline',
    GOOGLE_FIT_LINKS: 'Google_Fit_Links'
  },
  LINE: {
    CHANNEL_SECRET: '44d3afb5bbfd7b979641e11c8419e0a2',
    CHANNEL_ACCESS_TOKEN: 'ncONAvQ++RaUoS1wKdzQvXBUHHwIIj/QBVLkl1kz6aPUFL7NaOhyXSVADPCX8B7kMLKvQXK2npYHC68Bh9SWrSpBVyEZ0AFQTyluLt89pXyE5tHVsEaQgjgwRcHF+8XxphmtbmDARkWpymrPcumlkwdB04t89/1O/w1cDnyilFU='
  },
  DRIVE_FOLDER_ID: '1qpd1Sx8z5WmJSjpHKdRfPxpM9hD3JCH2',
  STEP_PROOF_FOLDER_NAME: 'Step_Proofs'
};

const SWEET_FREE_HEADERS = ['Entry_ID','User_ID','Wednesday_Date','Status','Logged_By','Recorded_At'];
const STEPS_HEADERS = ['Record_ID','User_ID','Date_Thai','Steps_Count','Record_Method','Image_Drive_ID','AI_Steps','AI_Confidence','Date_Match','Alert_Flag','Alert_Reason','Status','Week_Number','Auditor_ID','Recorded_At','Reject_Reason','Reviewed_At','Notes'];
const AUDIT_HEADERS = ['Audit_ID','Record_ID','Action','User_ID','Detail','Timestamp'];
const USER_HEADERS = ['User_ID','Prefix','Full_Name','Nickname','Position','Department','Birth_Date','Gender','Weight_kg','Height_cm','BMI_Value','Waist_Inch','Role','Password','Total_Points','Level','Personnel_ID','Registration_Status','Created_By','Created_Date','First_Name','Last_Name','Profile_Image','Activities','Step_Record_Mode'];
const PASSWORD_SALT_LENGTH = 16;
const WEIGHT_AFTER_HEADERS = ['Record_ID','User_ID','Weight_kg','Height_cm','BMI_Value','Recorded_At'];
const BASELINE_HEADERS = ['Record_ID','User_ID','Weight_kg','Height_cm','BMI_Value','Source','Recorded_At'];

// ===== HELPER FUNCTIONS =====
/**
 * เพิ่ม header ที่ยังไม่มีใน sheet (กันข้อมูลตกหล่นเมื่อ schema เปลี่ยน)
 */
function ensureHeaders_(sheetName, headers) {
  const sheet = getSheet_(sheetName);
  const existing = sheet.getDataRange().getValues()[0] || [];
  let col = existing.length + 1;
  let added = false;
  headers.forEach(function (h) {
    if (existing.indexOf(h) < 0) {
      sheet.getRange(1, col).setValue(h);
      col++;
      added = true;
    }
  });
  return added;
}

function getSheet_(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['timestamp_created', new Date().toISOString()]);
  }
  return sheet;
}

function getData_(sheetName) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = data.slice(1);
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/** เหมือน getData_ แต่ถ้ายังไม่มีชีทจะคืน [] (ไม่สร้างชีท/ไม่เขียน marker row) */
function getDataIfExists_(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = data.slice(1);
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function generateThaiCitizenId_() {
  const prefix = '10999';
  const seq = Math.floor(Math.random() * 9999999).toString().padStart(7, '0');
  const digits = (prefix + seq).split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i] * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return prefix + seq + check;
}

function appendData_(sheetName, data) {
  const sheet = getSheet_(sheetName);
  const headers = sheet.getDataRange().getValues()[0] || [];
  // ใช้ rowFromHeader_ เพื่อรักษาค่า truthy ต่ำ (เช่น false, 0) กันเขียนเป็นค่าว่าง
  const newRow = rowFromHeader_(headers, data);
  sheet.appendRow(newRow);
  return { success: true, message: 'บันทึกข้อมูลสำเร็จ' };
}

function updateRow_(sheetName, rowIndex, data) {
  const sheet = getSheet_(sheetName);
  const headers = sheet.getDataRange().getValues()[0] || [];
  const rowData = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.getRange(rowIndex + 1, 1, 1, rowData.length).setValues([rowData]);
  return { success: true, message: 'อัปเดตข้อมูลสำเร็จ' };
}

/** สร้าง array ของ row ตาม headers ปัจจุบันของชีท (คัดเฉพาะคอลัมน์ที่มีในชีท) */
function rowFromHeader_(headers, data) {
  return headers.map(function (h) { return data[h] !== undefined && data[h] !== null ? data[h] : ''; });
}

/** คำนวณค่า BMI จากส่วนสูง (ซม.) และน้ำหนัก (กก.) */
function computeBmi_(weight, height) {
  const w = Number(weight);
  const h = Number(height);
  if (!w || !h || h <= 0 || w <= 0) return '';
  return Math.round(w / ((h / 100) * (h / 100)) * 10) / 10;
}

/**
 * บันทึกค่าแรก (baseline) น้ำหนัก/ส่วนสูง/BMI ของผู้ใช้ตอนลงทะเบียนยืนยันตัวตน
 * เพื่อใช้เทียบกับค่า "ครั้งล่าสุด" (ชีท Weight_After) หลังจบโครงการ
 * จะบันทึกก็ต่อเมื่อยังไม่มี baseline ของผู้ใช้นั้น — กันการทับเมื่อแก้โปรไฟล์ภายหลัง
 */
function captureBaseline_(uid, weight, height, bmi, source) {
  if (!uid) return { captured: false, message: 'missing uid' };
  ensureHeaders_('Baseline', BASELINE_HEADERS);
  const existing = getData_('Baseline').filter(function (b) {
    return String(b.User_ID) === String(uid);
  });
  if (existing.length > 0) return { captured: false, message: 'baseline already exists' };
  const w = Number(weight);
  const h = Number(height);
  if (!w || !h || w <= 0 || h <= 0) return { captured: false, message: 'invalid weight/height' };
  appendData_('Baseline', {
    Record_ID: generateSequentialId_('Baseline', 'B'),
    User_ID: String(uid),
    Weight_kg: w,
    Height_cm: h,
    BMI_Value: (bmi !== undefined && bmi !== null && bmi !== '') ? bmi : computeBmi_(w, h),
    Source: source || 'register',
    Recorded_At: getTimestamp_()
  });
  return { captured: true };
}

/** สถานะการลงทะเบียน — รองรับแถว legacy (ไม่มีคอลัมน์ใหม่) ด้วยการดูจาก Password */
function registrationStatusOf_(u) {
  const st = String(u.Registration_Status || '');
  if (st === 'Pending' || st === 'Registered' || st === 'Inactive') return st;
  return String(u.Password || '') !== '' ? 'Registered' : 'Pending';
}

// ===== PASSWORD HASHING (SHA-256 + salt) =====

/** hash รหัสผ่านแบบ SHA-256 + salt — รูปแบบที่เก็บ: salt$hashHex */
function hashPassword_(password) {
  const salt = Utilities.getUuid().replace(/-/g, '').substring(0, PASSWORD_SALT_LENGTH);
  return salt + '$' + sha256Hex_(salt + password);
}

/** ตรวจสอบรหัสผ่านกับค่าที่เก็บไว้ (รองรับทั้งแบบ hashed ใหม่ และ plaintext เก่า) */
function verifyPassword_(input, stored) {
  const s = String(stored || '');
  const i = String(input || '');
  if (!s) return false;
  const parts = s.split('$');
  if (parts.length === 2 && parts[0].length === PASSWORD_SALT_LENGTH) {
    return sha256Hex_(parts[0] + i) === parts[1];
  }
  // แถว legacy (plaintext) — ใช้ได้จนกว่าจะถูกตั้งรหัสผ่านใหม่
  return s === i;
}

/** SHA-256 hex digest (รองรับ Unicode ภาษาไทย) */
function sha256Hex_(input) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    input,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join('');
}

/** ระยะแก้ไข (edit distance) เพื่อแปลง query เป็นส่วนหนึ่งของ text — จับคู่ได้แม้ตัวอักษรตรงกลางชื่อ */
function substringEditDistance_(query, text) {
  const q = String(query || '');
  const t = String(text || '');
  if (q.length === 0) return 0;
  let prev = [];
  let curr = [];
  for (let j = 0; j <= t.length; j++) prev[j] = 0; // แถวแรกเป็น 0 = เริ่มจับคู่ตำแหน่งใดก็ได้
  for (let i = 1; i <= q.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = q[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  let best = prev[0];
  for (let j = 1; j <= t.length; j++) best = Math.min(best, prev[j]);
  return best;
}

function sendLineNotification_(userId, message) {
  try {
    const url = 'https://api.line.me/v2/bot/message/push';
    const payload = {
      to: userId,
      messages: [{ type: 'text', text: message }]
    };
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.LINE.CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload)
    };
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    console.error('LINE notification error:', e);
  }
}

function broadcastLine_(message) {
  try {
    const url = 'https://api.line.me/v2/bot/message/broadcast';
    const payload = {
      messages: [{ type: 'text', text: message }]
    };
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.LINE.CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload)
    };
    UrlFetchApp.fetch(url, options);
    return { success: true, message: 'ส่งข้อความ LINE สำเร็จ' };
  } catch (e) {
    return { success: false, message: 'ส่ง LINE ล้มเหลว: ' + e.toString() };
  }
}

// ===== API ENDPOINTS =====

function doGet(e) {
  const path = e && e.parameter ? e.parameter.path : '';
  const action = e && e.parameter ? e.parameter.action : '';
  
  let result = {};
  setCorsHeaders_();
  
  try {
    switch (path) {
      case 'action':
        switch (action) {
          case 'login': result = loginUser_(e.parameter); break;
          case 'register': result = registerUser_(e.parameter); break;
          case 'add-step': result = addStepLog_(e.parameter); break;
          case 'add-sweet-free': result = addSweetFree_(e.parameter); break;
          case 'repair-sweet-free': result = repairSweetFree_(e.parameter); break;
          case 'add-voice': result = addVoiceExecutive_(e.parameter); break;
          case 'add-wellness': result = addWellnessAssessment_(e.parameter); break;
          case 'add-news': result = addNews_(e.parameter); break;
          case 'send-line-broadcast': result = broadcastLine_(e.parameter.message); break;
          case 'happy-connect-confirm': result = confirmHappyConnect_(e.parameter); break;
          case 'register-training': result = registerTraining_(e.parameter); break;
          case 'add-training': result = addTraining_(e.parameter); break;
          case 'happy-connect-match': result = createHappyConnectMatch_(e.parameter); break;
          case 'check-google-fit-email': result = checkGoogleFitEmail_(e.parameter); break;
          case 'save-google-fit-link': result = saveGoogleFitLink_(e.parameter); break;
          case 'reset-google-fit-links': result = resetGoogleFitLinks_(e.parameter); break;
          case 'reset-user-google-fit-link': result = resetUserGoogleFitLink_(e.parameter); break;
          case 'update-step-status': result = updateStepStatus_(e.parameter); break;
          case 'search-personnel': result = searchPersonnel_(e); break;
          case 'update-personnel-status': result = updatePersonnelStatus_(e.parameter); break;
          case 'update-personnel': result = updatePersonnel_(e.parameter); break;
          case 'delete-personnel': result = deletePersonnel_(e.parameter); break;
          case 'reset-password': result = resetPassword_(e.parameter); break;
          case 'change-password': result = changePassword_(e.parameter); break;
          case 'update-my-profile': result = updateMyProfile_(e.parameter); break;
          case 'upload-profile-image': result = uploadProfileImage_(e); break;
          case 'save-weight-after': result = saveWeightAfter_(e.parameter); break;
          case 'get-weight-after': result = getWeightAfter_(e); break;
          case 'set-weight-after-window': result = setWeightAfterWindow_(e.parameter); break;
          case 'test-drive': result = testDrive_(); break;
          case 'set-step-record-mode': result = setStepRecordMode_(e.parameter); break;
          case 'clear-cycle-data': result = clearCycleData_(e.parameter); break;
          case 'clear-steps-log': result = clearCycleData_({ Logged_By: e.parameter.Logged_By, targets: 'steps' }); break;
          case 'clear-sweet-free': result = clearCycleData_({ Logged_By: e.parameter.Logged_By, targets: 'sweet' }); break;
          default: result = { error: 'Unknown action: ' + action };
        }
        break;
      case 'dashboard':
        result = getDashboardData_();
        break;
      case 'users':
        if (action === 'leaderboard') result = getLeaderboard_();
        else result = getData_('Users');
        break;
      case 'steps':
        result = getData_('Steps_Log');
        break;
      case 'sweet-free':
        result = getData_('Sweet_Free');
        break;
      case 'happy-connect':
        result = getData_('Happy_Connect');
        break;
      case 'news':
        result = getData_('News');
        break;
      case 'wellness':
        result = getData_('Wellness_Assessment');
        break;
      case 'voice':
        result = getData_('Voice_Executive');
        break;
      case 'points':
        result = getData_('Points_History');
        break;
      case 'training':
        result = getData_('Training');
        break;
      case 'training-registrations':
        result = getData_('Training_Registration');
        break;
      case 'baseline':
        result = getData_('Baseline');
        break;
      case 'weight-comparison':
        result = getWeightComparison_(e);
        break;
      case 'google-fit-links':
        result = getData_('Google_Fit_Links');
        break;
      default:
        result = { status: 'ok', project: 'ลาดพร้าวสร้างสุข', version: '1.0.0' };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  setCorsHeaders_();
  
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || '';
    let result = {};
    
    switch (action) {
      case 'register':
        result = registerUser_(data);
        break;
      case 'login':
        result = loginUser_(data);
        break;
      case 'add-step':
        result = addStepLog_(data);
        break;
      case 'add-sweet-free':
        result = addSweetFree_(data);
        break;
      case 'repair-sweet-free':
        result = repairSweetFree_(data);
        break;
      case 'add-voice':
        result = addVoiceExecutive_(data);
        break;
      case 'add-wellness':
        result = addWellnessAssessment_(data);
        break;
      case 'add-news':
        result = addNews_(data);
        break;
      case 'send-line-broadcast':
        result = broadcastLine_(data.message);
        break;
      case 'happy-connect-confirm':
        result = confirmHappyConnect_(data);
        break;
      case 'register-training':
        result = registerTraining_(data);
        break;
      case 'add-training':
        result = addTraining_(data);
        break;
      case 'happy-connect-match':
        result = createHappyConnectMatch_(data);
        break;
      case 'check-google-fit-email':
        result = checkGoogleFitEmail_(e.parameter);
        break;
      case 'save-google-fit-link':
        result = saveGoogleFitLink_(data);
        break;
      case 'reset-google-fit-links':
        result = resetGoogleFitLinks_(data);
        break;
      case 'reset-user-google-fit-link':
        result = resetUserGoogleFitLink_(data);
        break;
      case 'update-step-status':
        result = updateStepStatus_(data);
        break;
      case 'add-personnel':
        result = addPersonnel_(data);
        break;
      case 'search-personnel':
        result = searchPersonnel_(data);
        break;
      case 'update-personnel-status':
        result = updatePersonnelStatus_(data);
        break;
      case 'update-personnel':
        result = updatePersonnel_(data);
        break;
      case 'delete-personnel':
        result = deletePersonnel_(data);
        break;
      case 'reset-password':
        result = resetPassword_(data);
        break;
      case 'change-password':
        result = changePassword_(data);
        break;
      case 'update-my-profile':
        result = updateMyProfile_(data);
        break;
      case 'upload-profile-image':
        result = uploadProfileImage_(data);
        break;
      case 'save-weight-after':
        result = saveWeightAfter_(data);
        break;
      case 'get-weight-after':
        result = getWeightAfter_(data);
        break;
      case 'set-weight-after-window':
        result = setWeightAfterWindow_(data);
        break;
      case 'test-drive':
        result = testDrive_();
        break;
      case 'set-step-record-mode':
        result = setStepRecordMode_(data);
        break;
      case 'add-batch-steps':
        result = addBatchSteps_(data);
        break;
      case 'clear-cycle-data':
        result = clearCycleData_(data);
        break;
      case 'clear-steps-log':
        result = clearCycleData_({ Logged_By: data.Logged_By, targets: 'steps' });
        break;
      case 'clear-sweet-free':
        result = clearCycleData_({ Logged_By: data.Logged_By, targets: 'sweet' });
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  setCorsHeaders_();
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON);
}

function setCorsHeaders_() {
  // CORS headers are set automatically by GAS deployment
}

function getTimestamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
}

/** ตรวจว่าช่วงบันทึกน้ำหนักหลังโครงการเปิดอยู่หรือไม่ (ค่าเริ่มต้น: เปิดตั้งแต่วันที่โครงการสิ้นสุด; นสส. บังคับเปิด/ปิดได้) */
function isWeightAfterOpen_() {
  const flag = PropertiesService.getScriptProperties().getProperty('WEIGHT_AFTER_OPEN');
  if (flag === '1') return true;
  if (flag === '0') return false;
  const today = getTimestamp_().substring(0, 10); // yyyy-MM-dd
  return today >= CONFIG.PROGRAM_END_DATE;
}

function generateSequentialId_(sheetName, prefix) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '');
    if (id.startsWith(prefix)) {
      const num = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return prefix + (maxNum + 1).toString().padStart(3, '0');
}

// ===== CORE BUSINESS LOGIC =====

function getDashboardData_() {
  const users = getData_('Users');
  const steps = getData_('Steps_Log');
  const sweetFree = getData_('Sweet_Free');
  const news = getData_('News');
  const wellness = getData_('Wellness_Assessment');
  
  const totalSteps = steps.reduce((sum, s) => sum + (Number(s.Steps_Count) || 0), 0);
  const totalUsers = users.length;
  const todaySteps = steps.filter(s => {
    if (!s.Date_Thai) return false;
    const today = new Date();
    const d = new Date(s.Date_Thai);
    return d.toDateString() === today.toDateString();
  }).reduce((sum, s) => sum + (Number(s.Steps_Count) || 0), 0);
  
  const departments = {};
  users.forEach(u => {
    if (!departments[u.Department]) departments[u.Department] = [];
    departments[u.Department].push(u);
  });
  
  const deptSteps = {};
  steps.forEach(s => {
    const user = users.find(u => u.User_ID === s.User_ID);
    if (user && user.Department) {
      if (!deptSteps[user.Department]) deptSteps[user.Department] = [];
      deptSteps[user.Department].push(Number(s.Steps_Count) || 0);
    }
  });
  
  const deptLeaderboard = Object.entries(deptSteps)
    .map(([dept, stepArr]) => ({
      department: dept,
      totalSteps: stepArr.reduce((a, b) => a + b, 0),
      memberCount: (departments[dept] || []).length,
      avgSteps: Math.round(stepArr.reduce((a, b) => a + b, 0) / stepArr.length)
    }))
    .sort((a, b) => b.totalSteps - a.totalSteps);
  
  return {
    totalSteps,
    totalUsers,
    todaySteps,
    deptLeaderboard,
    sweetFreeStats: getSweetFreeStats_(sweetFree),
    recentNews: news.slice(-5).reverse(),
    dailyWellnessAvg: getWellnessAverage_(wellness)
  };
}

function getSweetFreeStats_(data) {
  const kept = data.filter(d => toBoolean_(d.Status)).length;
  const failed = data.filter(d => !toBoolean_(d.Status)).length;
  return { kept, failed, total: kept + failed };
}

function getWellnessAverage_(data) {
  if (!data.length) return { happiness: 0, physical: 0, stress: 0 };
  const len = data.length;
  return {
    happiness: Math.round(data.reduce((s, d) => s + (Number(d.Happiness) || 0), 0) / len * 10) / 10,
    physical: Math.round(data.reduce((s, d) => s + (Number(d.Physical_Health) || 0), 0) / len * 10) / 10,
    stress: Math.round(data.reduce((s, d) => s + (Number(d.Stress) || 0), 0) / len * 10) / 10
  };
}

function getLeaderboard_() {
  const users = getData_('Users');
  const steps = getData_('Steps_Log');
  
  const userSteps = {};
  steps.forEach(s => {
    const uid = s.User_ID;
    if (!userSteps[uid]) userSteps[uid] = 0;
    userSteps[uid] += Number(s.Steps_Count) || 0;
  });
  
  const leaderboard = users
    .map(u => ({
      userId: u.User_ID,
      name: u.Full_Name,
      department: u.Department,
      totalSteps: userSteps[u.User_ID] || 0,
      points: Number(u.Total_Points) || 0,
      level: u.Level || 'เริ่มต้น'
    }))
    .sort((a, b) => b.totalSteps - a.totalSteps)
    .slice(0, 10);
  
  return leaderboard;
}

function registerUser_(data) {
  ensureHeaders_('Users', USER_HEADERS);

  // ── 1. ต้องถูกเพิ่มชื่อไว้โดย นสส. ก่อน (สถานะ Pending) จึงจะลงทะเบียนได้ ──
  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const pidCol = col('Personnel_ID');
  const uidCol = col('User_ID');
  const statusCol = col('Registration_Status');

  const pid = String(data.Personnel_ID || '').trim();
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (pidCol > 0 && String(rows[i][pidCol - 1]) === pid) { rowIndex = i; break; }
  }
  if (rowIndex < 1) {
    return { success: false, message: 'ไม่พบรายชื่อบุคลากรที่เจ้าหน้าที่เพิ่มไว้ กรุณาติดต่อ นสส.' };
  }

  const currentStatus = statusCol > 0 ? String(rows[rowIndex][statusCol - 1]) : '';
  if (currentStatus === 'Registered') {
    return { success: false, message: 'บุคลากรนี้ได้ลงทะเบียนแล้ว ไม่สามารถลงทะเบียนซ้ำได้' };
  }
  if (currentStatus === 'Inactive') {
    return { success: false, message: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ นสส.' };
  }

  // ── 2. ตรวจเลขบัตรประชาชน (13 หลัก) และความซ้ำซ้อน ──
  const uid = String(data.User_ID || '').trim();
  if (!/^\d{13}$/.test(uid)) {
    return { success: false, message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' };
  }
  for (let i = 1; i < rows.length; i++) {
    if (i === rowIndex) continue;
    if (uidCol > 0 && String(rows[i][uidCol - 1]) === uid) {
      return { success: false, message: 'เลขบัตรประชาชนนี้ถูกใช้ลงทะเบียนแล้ว' };
    }
  }

  // ── 3. อัปเดตข้อมูลลงในแถวบุคลากรเดิม (รหัสผ่าน + ข้อมูลส่วนบุคคลเป็นของผู้ใช้เอง) ──
  // ── 3.1 ตรวจรหัสผ่าน: อย่างน้อย 6 ตัวอักษร ──
  const pwd = String(data.Password || '');
  if (pwd.length < 6) {
    return { success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  }

  const set = function (name, value) {
    const c = col(name);
    if (c > 0) sheet.getRange(rowIndex + 1, c).setValue(value);
  };
  const bmi = computeBmi_(data.Weight_kg, data.Height_cm);

  set('User_ID', uid);
  set('Prefix', data.Prefix || '');
  set('Full_Name', data.Full_Name || '');
  set('Nickname', data.Nickname || '');
  set('Position', data.Position || '');
  set('Department', data.Department || '');
  set('Birth_Date', data.Birth_Date || '');
  set('Gender', data.Gender || '');
  set('Weight_kg', data.Weight_kg || '');
  set('Height_cm', data.Height_cm || '');
  set('Waist_Inch', data.Waist_Inch || '');
  set('BMI_Value', data.BMI_Value !== undefined && data.BMI_Value !== '' ? data.BMI_Value : bmi);
  set('Password', hashPassword_(pwd));
  set('First_Name', data.First_Name || '');
  set('Last_Name', data.Last_Name || '');
  set('Activities', (data.Activities !== undefined && data.Activities !== null && data.Activities !== '')
    ? data.Activities : 'sweet_free');

  // รูปโปรไฟล์: ถ้าส่งมาเป็น base64 ให้อัปโหลดไป Drive แล้วเก็บ File ID
  if (data.Profile_Image_Base64) {
    const fullName = String(data.Full_Name || '') || ((data.First_Name || '') + ' ' + (data.Last_Name || '')).trim();
    const fileBase = buildProfileFileName_(fullName, data.Department, uid);
    const uploaded = uploadProfileImageRaw_(data.Profile_Image_Base64, fileBase);
    if (uploaded && uploaded.id) set('Profile_Image', uploaded.id);
  } else if (data.Profile_Image) {
    set('Profile_Image', data.Profile_Image);
  }

  // เก็บบทบาทเดิมที่ นสส. กำหนดไว้ (ถ้าไม่ได้ส่งค่า Role มา อย่าเขียนทับเป็น Employee)
  if (data.Role) set('Role', data.Role);
  set('Total_Points', '0');
  set('Level', 'เริ่มต้น');
  set('Registration_Status', 'Registered');

  // บันทึกค่าแรก (baseline) — ใช้เทียบหลังจบโครงการ และกันค่าที่จะถูกทับตอนแก้โปรไฟล์
  const baseline = captureBaseline_(uid, data.Weight_kg, data.Height_cm, data.BMI_Value, 'register');

  // ย้ายประวัติก้าวที่เคยบันทึกด้วย Personnel_ID (ตอนยังไม่ลงทะเบียน) มาเป็น User_ID ใหม่ เพื่อให้ประวัติไม่หาย
  try {
    var stepsSheet = getSheet_('Steps_Log');
    var stepsRows = stepsSheet.getDataRange().getValues();
    var stepsHeaders = stepsRows[0] || [];
    var sUidCol = stepsHeaders.indexOf('User_ID')+1;
    if(sUidCol>0){
      for(var si=1; si<stepsRows.length; si++){
        if(String(stepsRows[si][sUidCol-1])===String(pid)){
          stepsSheet.getRange(si+1, sUidCol).setValue(uid);
        }
      }
    }
  } catch(e){ console.error('migrate Steps_Log Personnel_ID->User_ID failed', e); }

  return { success: true, message: 'ลงทะเบียนสำเร็จ', baselineCaptured: !!baseline.captured };
}

/**
 * เจ้าหน้าที่ นสส. (Admin) เพิ่มบุคลากร (รอลงทะเบียน) ครั้งละหลายคน
 * ข้อมูลจำเป็นที่ นสส. ต้องนำเข้า: คำนำหน้า, ชื่อ, นามสกุล, ชื่อเล่น, ตำแหน่ง, ส่วนราชการ
 * ไม่เก็บข้อมูลอ่อนไหว (เลขบัตรประชาชน, รหัสผ่าน, น้ำหนัก, ส่วนสูง) — ให้ผู้ใช้กรอกตอนสมัครเอง
 */
function addPersonnel_(data) {
  ensureHeaders_('Users', USER_HEADERS);

  // ตรวจสิทธิ์: เฉพาะ นสส. (Admin) เท่านั้น
  const creator = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Created_By);
  });
  if (!creator) return { success: false, message: 'ไม่พบผู้บันทึก' };
  if (String(creator.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่เพิ่มบุคลากรได้' };
  }

  const list = Array.isArray(data.Personnel) ? data.Personnel : [];
  if (!list.length) return { success: false, message: 'ไม่พบข้อมูลบุคลากร' };

  const sheet = getSheet_('Users');
  const headers = sheet.getDataRange().getValues()[0] || [];
  const existing = getData_('Users');

  // หาลำดับ Personnel_ID ถัดไป (P001 ...)
  let maxNum = 0;
  existing.forEach(function (u) {
    const s = String(u.Personnel_ID || '');
    if (s.charAt(0) === 'P') {
      const n = parseInt(s.substring(1), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });

  const added = [];
  const now = getTimestamp_();
  list.forEach(function (p, idx) {
    const first = String(p.First_Name || '').trim();
    const last = String(p.Last_Name || '').trim();
    const nickname = String(p.Nickname || '').trim();
    const fullName = String(p.Full_Name || '').trim() || (first + ' ' + last).trim();
    if (!fullName && !first && !last) return;
    if (!first || !last) {
      added.push({ Full_Name: fullName, Department: String(p.Department || '').trim(), status: 'error', message: 'กรุณากรอกชื่อและนามสกุลให้ครบ' });
      return;
    }
    if (!nickname) {
      added.push({ Full_Name: fullName, Department: String(p.Department || '').trim(), status: 'error', message: 'กรุณากรอกชื่อเล่น (ข้อมูลจำเป็นสำหรับ นสส.)' });
      return;
    }
    const dept = String(p.Department || '').trim();
    if (!dept) {
      added.push({ Full_Name: fullName, Department: dept, status: 'error', message: 'กรุณาระบุส่วนราชการ' });
      return;
    }

    // กันบันทึกซ้ำ: ชื่อ + ฝ่าย เหมือนกับรายการที่ยังใช้งานอยู่ (ไม่ใช่ Inactive)
    const dup = existing.find(function (u) {
      return String(u.Full_Name) === fullName && String(u.Department) === dept &&
             String(u.Registration_Status) !== 'Inactive';
    });
    if (dup) {
      added.push({ Full_Name: fullName, Department: dept, Personnel_ID: dup.Personnel_ID || '', status: 'duplicate' });
      return;
    }

    const pid = 'P' + String(maxNum + idx + 1).padStart(3, '0');
    const dataRow = {
      User_ID: '',
      Prefix: p.Prefix || '',
      Full_Name: fullName,
      First_Name: first,
      Last_Name: last,
      Nickname: nickname,
      Position: p.Position || '',
      Department: dept,
      Birth_Date: '',
      Gender: p.Gender || '',
      Weight_kg: '',
      Height_cm: '',
      BMI_Value: '',
      Waist_Inch: '',
      Role: p.Role || 'Employee',
      Password: '',
      Profile_Image: '',
      Activities: (p.Activities !== undefined && p.Activities !== null && p.Activities !== '')
        ? p.Activities : 'sweet_free',
      Total_Points: 0,
      Level: 'เริ่มต้น',
      Personnel_ID: pid,
      Registration_Status: 'Pending',
      Created_By: (creator.Prefix ? String(creator.Prefix) + ' ' : '') + String(creator.Full_Name || ''),
      Created_Date: now,
      Step_Record_Mode: '1',
    };
    sheet.appendRow(rowFromHeader_(headers, dataRow));
    added.push({ Full_Name: fullName, Department: dept, Personnel_ID: pid, status: 'added' });
  });

  const addedCount = added.filter(function (a) { return a.status === 'added'; }).length;
  const dupCount = added.filter(function (a) { return a.status === 'duplicate'; }).length;
  const errCount = added.filter(function (a) { return a.status === 'error'; }).length;
  let message = 'เพิ่มบุคลากร ' + addedCount + ' รายสำเร็จ';
  if (dupCount > 0) message += ' (ซ้ำกับรายชื่อเดิม ' + dupCount + ' ราย ไม่ถูกบันทึกซ้ำ)';
  if (errCount > 0) message += ' (ข้อมูลไม่ครบ ' + errCount + ' ราย ไม่ถูกบันทึก)';
  return { success: true, message: message, added: added };
}

/**
 * ค้นหาบุคลากรแบบยืดหยุ่น (รองรับการพิมพ์ผิดเล็กน้อย)
 * - แสดงทั้งคนที่รอลงทะเบียน (Pending) และคนที่ลงทะเบียนแล้ว (Registered รวมแถว legacy)
 * - คนที่ลงทะเบียนแล้วจะถูกส่งสถานะไปให้หน้าจอแสดงป้าย "ลงทะเบียนแล้ว" (ไม่ต้องลงทะเบียนซ้ำ)
 * - ใช้ substring edit distance: พิมพ์ผิด 1-2 ตัวอักษรยังเจอ
 */
function searchPersonnel_(e) {
  ensureHeaders_('Users', USER_HEADERS);
  const params = e && e.parameter ? e.parameter : (e || {});
  const q = String(params.q || '').trim();
  const dept = String(params.department || '').trim();

  const users = getData_('Users');
  const scored = [];
  users.forEach(function (u) {
    const st = registrationStatusOf_(u);
    if (st === 'Inactive') return; // ไม่แสดงคนที่ถูกระงับ
    const name = String(u.Full_Name || '').trim();
    if (!name) return;
    const okDept = !dept || String(u.Department) === dept;
    if (!okDept) return;

    let sim = 0;
    let matched = false;
    if (!q) {
      matched = true;
      sim = st === 'Pending' ? 1 : 0.9;
    } else {
      const lowerQ = q.toLowerCase();
      const lowerName = name.toLowerCase();
      if (lowerName.indexOf(lowerQ) >= 0) {
        matched = true;
        sim = 1;
      } else {
        const dist = substringEditDistance_(q, name);
        const allowed = Math.round(q.length * 0.3);
        if (dist <= allowed) {
          matched = true;
          sim = 1 - dist / q.length;
        }
      }
    }
    if (!matched) return;
    scored.push({ sim: sim, st: st, u: u });
  });

  scored.sort(function (a, b) {
    if (b.sim !== a.sim) return b.sim - a.sim;
    if (a.st !== b.st) return a.st === 'Pending' ? -1 : 1;
    const na = String(a.u.Full_Name);
    const nb = String(b.u.Full_Name);
    return na < nb ? -1 : (na > nb ? 1 : 0);
  });

  const results = scored.map(function (s) {
    const u = s.u;
    // ส่งเฉพาะข้อมูลพื้นฐาน — ไม่ส่งข้อมูลอ่อนไหว
    return {
      Personnel_ID: u.Personnel_ID || '',
      Prefix: u.Prefix || '',
      Full_Name: u.Full_Name || '',
      First_Name: u.First_Name || '',
      Last_Name: u.Last_Name || '',
      Nickname: u.Nickname || '',
      Position: u.Position || '',
      Department: u.Department || '',
      Gender: u.Gender || '',
      Activities: u.Activities || 'sweet_free',
      Registration_Status: s.st
    };
  });

  return { success: true, results: results, total: results.length };
}

/**
 * อัปเดตสถานะบุคลากร / ข้อมูลพื้นฐาน โดยเจ้าหน้าที่ นสส. (Admin เท่านั้น)
 * - ปิด-เปิดใช้งาน (Pending <-> Inactive, Registered -> Inactive / ย้อนกลับ)
 */
function updatePersonnelStatus_(data) {
  ensureHeaders_('Users', USER_HEADERS);

  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่จัดการบุคลากรได้' };
  }

  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const pidCol = col('Personnel_ID');

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (pidCol > 0 && String(rows[i][pidCol - 1]) === String(data.Personnel_ID)) { rowIndex = i; break; }
  }
  if (rowIndex < 1) return { success: false, message: 'ไม่พบบุคลากร' };

  const set = function (name, value) {
    const c = col(name);
    if (c > 0) sheet.getRange(rowIndex + 1, c).setValue(value);
  };

  if (data.Registration_Status) set('Registration_Status', data.Registration_Status);
  if (data.Prefix !== undefined) set('Prefix', data.Prefix);
  if (data.Full_Name !== undefined) set('Full_Name', data.Full_Name);
  if (data.First_Name !== undefined) set('First_Name', data.First_Name);
  if (data.Last_Name !== undefined) set('Last_Name', data.Last_Name);
  if (data.Nickname !== undefined) set('Nickname', data.Nickname);
  if (data.Position !== undefined) set('Position', data.Position);
  if (data.Department !== undefined) set('Department', data.Department);
  if (data.Gender !== undefined) set('Gender', data.Gender);
  if (data.Created_By !== undefined) set('Created_By', data.Created_By);
  if (data.Profile_Image !== undefined) set('Profile_Image', data.Profile_Image);
  if (data.Activities !== undefined && data.Activities !== '' && data.Activities !== null) set('Activities', data.Activities);

  return { success: true, message: 'อัปเดตบุคลากรสำเร็จ' };
}

/**
 * เจ้าหน้าที่ นสส. (Admin) ลบบุคลากรออกจากระบบ
 * ลบแถวในชีท Users และย้ายไฟล์ภาพโปรไฟล์ใน Drive ไปถังขยะ (ถ้ามี)
 */
function deletePersonnel_(data) {
  ensureHeaders_('Users', USER_HEADERS);

  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่ลบบุคลากรได้' };
  }

  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const pidCol = col('Personnel_ID');

  let rowIndex = -1;
  let profileImage = '';
  for (let i = 1; i < rows.length; i++) {
    if (pidCol > 0 && String(rows[i][pidCol - 1]) === String(data.Personnel_ID)) {
      rowIndex = i;
      const imgCol = col('Profile_Image');
      if (imgCol > 0) profileImage = String(rows[i][imgCol - 1] || '');
      break;
    }
  }
  if (rowIndex < 1) return { success: false, message: 'ไม่พบบุคลากร' };

  const uidCol = col('User_ID');
  if (uidCol > 0 && String(rows[rowIndex][uidCol - 1]) === String(actor.User_ID)) {
    return { success: false, message: 'ไม่สามารถลบบัญชีของตนเองได้' };
  }

  if (profileImage !== '') {
    try {
      DriveApp.getFileById(profileImage).setTrashed(true);
    } catch (e) { /* ข้ามเมื่อไม่พบไฟล์หรือลบไม่ได้ */ }
  }

  sheet.deleteRow(rowIndex + 1);

  return { success: true, message: 'ลบบุคลากรออกจากระบบแล้ว' };
}

/**
 * เจ้าหน้าที่ นสส. (Admin) แก้ไขข้อมูลบุคลากรได้ทุกอย่าง
 * รองรับการแก้ไขข้อมูลพื้นฐาน + สุขภาพ + กิจกรรม + บทบาท + สถานะ
 */
function updatePersonnel_(data) {
  ensureHeaders_('Users', USER_HEADERS);

  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่แก้ไขบุคลากรได้' };
  }

  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const pidCol = col('Personnel_ID');

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (pidCol > 0 && String(rows[i][pidCol - 1]) === String(data.Personnel_ID)) { rowIndex = i; break; }
  }
  if (rowIndex < 1) return { success: false, message: 'ไม่พบบุคลากร' };

  const first = data.First_Name !== undefined ? String(data.First_Name).trim() : '';
  const last = data.Last_Name !== undefined ? String(data.Last_Name).trim() : '';
  const fullName = (first && last) ? (first + ' ' + last) : data.Full_Name || '';

  const set = function (name, value) {
    const c = col(name);
    if (c > 0) sheet.getRange(rowIndex + 1, c).setValue(value);
  };

  if (data.Prefix !== undefined) set('Prefix', data.Prefix);
  if (fullName !== '') set('Full_Name', fullName);
  set('First_Name', first);
  set('Last_Name', last);
  // เลขบัตรประชาชน (User_ID): เจ้าหน้าที่ นสส. แก้ไขได้ทุกอย่าง — ตรวจสอบให้เป็นตัวเลข 13 หลัก
  if (data.User_ID !== undefined) {
    const cid = String(data.User_ID).trim();
    if (cid && !/^\d{13}$/.test(cid)) {
      return { success: false, message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' };
    }
    if (cid) {
      const dup = getData_('Users').find(function (u) {
        return String(u.User_ID) === cid && String(u.Personnel_ID) !== String(data.Personnel_ID);
      });
      if (dup) {
        return { success: false, message: 'เลขบัตรประชาชนนี้ถูกใช้โดยบุคลากรคนอื่นแล้ว' };
      }
    }
    set('User_ID', cid);
  }
  if (data.Nickname !== undefined) set('Nickname', data.Nickname);
  if (data.Position !== undefined) set('Position', data.Position);
  if (data.Department !== undefined) set('Department', data.Department);
  if (data.Gender !== undefined) set('Gender', data.Gender);
  if (data.Birth_Date !== undefined) set('Birth_Date', data.Birth_Date);
  if (data.Weight_kg !== undefined) set('Weight_kg', data.Weight_kg);
  if (data.Height_cm !== undefined) set('Height_cm', data.Height_cm);
  set('BMI_Value', computeBmi_(data.Weight_kg, data.Height_cm));
  if (data.Profile_Image !== undefined) set('Profile_Image', data.Profile_Image);
  if (data.Activities !== undefined) set('Activities', data.Activities || 'sweet_free');
  if (data.Role !== undefined) set('Role', data.Role);
  if (data.Registration_Status !== undefined) set('Registration_Status', data.Registration_Status);
  if (data.Step_Record_Mode !== undefined && (data.Step_Record_Mode === '1' || data.Step_Record_Mode === '2')) set('Step_Record_Mode', data.Step_Record_Mode);

  return { success: true, message: 'อัปเดตข้อมูลบุคลากรสำเร็จ', Full_Name: fullName };
}

/**
 * เจ้าหน้าที่ นสส. (Admin) กดคืนค่ารหัสผ่านของบุคลากรเป็น pass1234
 * จากนั้นบุคลากรสามารถเข้าสู่ระบบด้วย pass1234 และตั้งรหัสผ่านใหม่เอง
 */
function resetPassword_(data) {
  ensureHeaders_('Users', USER_HEADERS);

  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่คืนค่ารหัสผ่านได้' };
  }

  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const pidCol = col('Personnel_ID');

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (pidCol > 0 && String(rows[i][pidCol - 1]) === String(data.Personnel_ID)) { rowIndex = i; break; }
  }
  if (rowIndex < 1) return { success: false, message: 'ไม่พบบุคลากร' };

  const pwdCol = col('Password');
  const statusCol = col('Registration_Status');
  if (pwdCol > 0) sheet.getRange(rowIndex + 1, pwdCol).setValue(hashPassword_('pass1234'));
  if (statusCol > 0) sheet.getRange(rowIndex + 1, statusCol).setValue('Registered');

  return { success: true, message: 'คืนค่ารหัสผ่านเป็น pass1234 เรียบร้อยแล้ว (บุคลากรสามารถตั้งรหัสผ่านใหม่ได้)' };
}

/**
 * ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง (ต้องกรอกรหัสผ่านเดิมให้ถูกต้อง)
 */
function changePassword_(data) {
  const files = getData_('Users');
  const user = files.find(function (u) { return String(u.User_ID) === String(data.User_ID); });
  if (!user) return { success: false, message: 'ไม่พบผู้ใช้' };

  if (!verifyPassword_(data.Old_Password, user.Password)) {
    return { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
  }
  const newPwd = String(data.New_Password || '');
  if (newPwd.length < 6) {
    return { success: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' };
  }

  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const uidCol = col('User_ID');
  const pwdCol = col('Password');
  if (uidCol < 1 || pwdCol < 1) return { success: false, message: 'เกิดข้อผิดพลาด' };

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][uidCol - 1]) === String(data.User_ID)) {
      sheet.getRange(i + 1, pwdCol).setValue(hashPassword_(newPwd));
      return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
    }
  }
  return { success: false, message: 'ไม่พบผู้ใช้' };
}

/**
 * ผู้ใช้แก้ไขข้อมูลส่วนตัวของตนเอง (ผ่าน popup โปรไฟล์ในแถบหัว)
 * แก้ไขได้เฉพาะ: คำนำหน้า, ชื่อ-นามสกุล, ชื่อเล่น, เพศ, ตำแหน่ง, ส่วนราชการ,
 * วันเกิด, น้ำหนัก/ส่วนสูง (คำนวณ BMI ให้อัตโนมัติ) และรูปโปรไฟล์
 * ไม่สามารถแก้ไข: เลขบัตรประชาชน, บทบาท, รหัสผ่าน, แต้ม, ระดับ (เป็นของ นสส./ระบบ)
 */
function updateMyProfile_(data) {
  ensureHeaders_('Users', USER_HEADERS);

  const uid = String(data.User_ID || '').trim();
  if (!uid) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };

  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const uidCol = col('User_ID');
  if (uidCol < 1) return { success: false, message: 'โครงสร้างชีท Users ไม่ถูกต้อง' };

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][uidCol - 1]) === uid) { rowIndex = i; break; }
  }
  if (rowIndex < 1) return { success: false, message: 'ไม่พบผู้ใช้ในระบบ กรุณาติดต่อ นสส.' };

  const g = function (name, fallback) {
    const c = col(name);
    return c > 0 ? String(rows[rowIndex][c - 1]) : String(fallback || '');
  };

  const first = data.First_Name !== undefined ? String(data.First_Name).trim() : g('First_Name');
  const last = data.Last_Name !== undefined ? String(data.Last_Name).trim() : g('Last_Name');
  const nickname = data.Nickname !== undefined ? String(data.Nickname).trim() : g('Nickname');
  if (!first || !last) return { success: false, message: 'กรุณากรอกชื่อและนามสกุลให้ครบ' };
  if (!nickname) return { success: false, message: 'กรุณากรอกชื่อเล่น (ข้อมูลจำเป็นสำหรับ นสส.)' };

  // ตรวจวันเกิด (ISO YYYY-MM-DD) ว่าถูกต้องจริง เช่น ไม่มีวันที่ 30 ก.พ.
  const bd = data.Birth_Date !== undefined ? String(data.Birth_Date).trim() : g('Birth_Date');
  if (bd) {
    const m = String(bd).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return { success: false, message: 'วันเกิดไม่อยู่ในรูปแบบที่ถูกต้อง' };
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
      return { success: false, message: 'วันที่เกิดไม่ถูกต้อง เช่น วันที่ไม่มีในเดือนดังกล่าว' };
    }
  }

  // ตรวจค่าน้ำหนัก / ส่วนสูง (ถ้ามีการส่งค่าเข้ามา)
  const weightRaw = data.Weight_kg !== undefined ? Number(data.Weight_kg) : NaN;
  const heightRaw = data.Height_cm !== undefined ? Number(data.Height_cm) : NaN;
  if (!isNaN(weightRaw) && (weightRaw < 20 || weightRaw > 300)) {
    return { success: false, message: 'กรุณากรอกน้ำหนักที่ถูกต้อง (20-300 กิโลกรัม)' };
  }
  if (!isNaN(heightRaw) && (heightRaw < 50 || heightRaw > 250)) {
    return { success: false, message: 'กรุณากรอกส่วนสูงที่ถูกต้อง (50-250 เซนติเมตร)' };
  }

  const newWeight = !isNaN(weightRaw) ? weightRaw : Number(g('Weight_kg'));
  const newHeight = !isNaN(heightRaw) ? heightRaw : Number(g('Height_cm'));
  const bmi = computeBmi_(newWeight, newHeight);

  const fullName = (first + ' ' + last).trim();
  const set = function (name, value) {
    const c = col(name);
    if (c > 0) sheet.getRange(rowIndex + 1, c).setValue(value);
  };

  if (data.Prefix !== undefined) set('Prefix', String(data.Prefix).trim());
  set('First_Name', first);
  set('Last_Name', last);
  set('Full_Name', fullName);
  set('Nickname', nickname);
  if (data.Position !== undefined) set('Position', String(data.Position).trim());
  if (data.Department !== undefined) set('Department', String(data.Department).trim());
  if (data.Gender !== undefined) set('Gender', String(data.Gender).trim());
  if (bd) set('Birth_Date', bd);
  if (!isNaN(weightRaw)) set('Weight_kg', weightRaw);
  if (!isNaN(heightRaw)) set('Height_cm', heightRaw);
  if (bmi !== '') set('BMI_Value', bmi);
  else if (data.Weight_kg !== undefined || data.Height_cm !== undefined) set('BMI_Value', '');

  // รูปโปรไฟล์: ถ้าส่งมาเป็น base64 ให้อัปโหลดไป Drive แล้วเก็บ File ID (ตั้งชื่อใหม่ตามข้อมูลปัจจุบัน)
  if (data.Profile_Image_Base64) {
    const pid = g('Personnel_ID', uid);
    const dept = data.Department !== undefined ? String(data.Department) : g('Department');
    const fileBase = buildProfileFileName_(fullName, dept, uid || pid);
    const uploaded = uploadProfileImageRaw_(String(data.Profile_Image_Base64), fileBase);
    if (uploaded && uploaded.error) {
      return { success: false, message: 'อัปโหลดรูปโปรไฟล์ล้มเหลว: ' + uploaded.error };
    }
    if (uploaded && uploaded.id) set('Profile_Image', uploaded.id);
  }

  // ส่งข้อมูลผู้ใช้ (ไม่รวมรหัสผ่าน) กลับไปเพื่อให้หน้าเว็บอัปเดตได้ทันที
  const updated = getData_('Users').find(function (u) { return String(u.User_ID) === uid; });
  if (updated && updated.Password) delete updated.Password;
  return { success: true, message: 'บันทึกข้อมูลโปรไฟล์สำเร็จ', user: updated || null };
}

/**
 * บันทึกน้ำหนัก/BMI หลังโครงการ (ผู้ใช้กรอกเอง) — เก็บเป็นประวัติในชีท Weight_After
 * เปิดให้บันทึกได้เฉพาะช่วงหลังจบโครงการ (หรือตามที่นสส. กำหนด)
 */
function saveWeightAfter_(data) {
  ensureHeaders_('Weight_After', WEIGHT_AFTER_HEADERS);
  const open = isWeightAfterOpen_();
  if (!open) {
    return {
      success: false,
      open: false,
      message: 'ยังไม่เปิดให้บันทึกน้ำหนักหลังโครงการ (เปิดให้บันทึกตั้งแต่วันที่โครงการสิ้นสุด ' + CONFIG.PROGRAM_END_DATE + ' เป็นต้นไป)'
    };
  }

  const uid = String(data.User_ID || '').trim();
  if (!uid) return { success: false, open: true, message: 'ไม่พบข้อมูลผู้ใช้' };
  const weight = Number(data.Weight_kg);
  if (!weight || weight < 20 || weight > 300) {
    return { success: false, open: true, message: 'กรุณากรอกน้ำหนักที่ถูกต้อง (20-300 กิโลกรัม)' };
  }

  const user = getData_('Users').find(function (u) { return String(u.User_ID) === uid; });
  if (!user) return { success: false, open: true, message: 'ไม่พบผู้ใช้ในระบบ กรุณาติดต่อ นสส.' };
  const height = Number(user.Height_cm);
  if (!height || height <= 0) return { success: false, open: true, message: 'ไม่พบส่วนสูงของท่านในระบบ กรุณาติดต่อ นสส.' };

  const sheet = getSheet_('Weight_After');
  const headers = sheet.getDataRange().getValues()[0] || [];
  const record = {
    Record_ID: generateSequentialId_('Weight_After', 'W'),
    User_ID: uid,
    Weight_kg: weight,
    Height_cm: height,
    BMI_Value: computeBmi_(weight, height),
    Recorded_At: getTimestamp_()
  };
  sheet.appendRow(rowFromHeader_(headers, record));
  return { success: true, open: true, message: 'บันทึกน้ำหนักหลังโครงการสำเร็จ', record: record };
}

/** ดึงประวัติการบันทึกน้ำหนักหลังโครงการของผู้ใช้ (เรียงล่าสุดก่อน) */
function getWeightAfter_(e) {
  ensureHeaders_('Weight_After', WEIGHT_AFTER_HEADERS);
  const params = e && e.parameter ? e.parameter : (e || {});
  const uid = String(params.User_ID || '').trim();
  const open = isWeightAfterOpen_();

  const user = getData_('Users').find(function (u) { return String(u.User_ID) === uid; });
  const records = getData_('Weight_After')
    .filter(function (r) { return String(r.User_ID) === uid; })
    .sort(function (a, b) {
      return String(b.Recorded_At) < String(a.Recorded_At) ? -1 : (String(b.Recorded_At) > String(a.Recorded_At) ? 1 : 0);
    });
  // ค่าแรก (baseline) จากชีท Baseline — สำหรับเปรียบเทียบกับครั้งล่าสุดหลังจบโครงการ
  const baseline = getData_('Baseline')
    .filter(function (b) { return String(b.User_ID) === uid; })
    .sort(function (a, b) {
      return String(a.Recorded_At) < String(b.Recorded_At) ? -1 : (String(a.Recorded_At) > String(b.Recorded_At) ? 1 : 0);
    })[0] || null;

  return {
    success: true,
    open: open,
    records: records,
    baseline: baseline,
    height: user ? user.Height_cm : '',
    currentWeight: user ? user.Weight_kg : '',
    currentBmi: user ? user.BMI_Value : ''
  };
}

/**
 * สรุปการเปรียบเทียบน้ำหนัก/BMI: ครั้งแรก (baseline) vs ครั้งล่าสุด (Weight_After / โปรไฟล์)
 * — Admin/Committee จะได้ทุกราย; ผู้ใช้อื่นได้เฉพาะของตนเอง
 */
function getWeightComparison_(e) {
  const requesterId = String((e && e.parameter && e.parameter.User_ID) || '');
  const requester = getData_('Users').find(function (u) { return String(u.User_ID) === requesterId; });
  const isAdmin = requester && (String(requester.Role) === 'Admin' || String(requester.Role) === 'Committee');
  const users = isAdmin ? getData_('Users') : (requester ? [requester] : []);

  const baselines = getDataIfExists_('Baseline');
  const weightAfter = getDataIfExists_('Weight_After');

  const baseMap = {};
  baselines.forEach(function (b) {
    const uid = String(b.User_ID || '');
    if (uid && !baseMap[uid]) baseMap[uid] = b;
  });
  const latestMap = {};
  weightAfter.forEach(function (r) {
    const uid = String(r.User_ID || '');
    if (!uid) return;
    const cur = latestMap[uid];
    if (!cur || String(r.Recorded_At || '') >= String(cur.Recorded_At || '')) latestMap[uid] = r;
  });

  return users.map(function (u) {
    const uid = String(u.User_ID || '');
    const b = baseMap[uid] || null;
    const l = latestMap[uid] || null;
    const baseW = b && Number(b.Weight_kg) ? Number(b.Weight_kg) : (Number(u.Weight_kg) || 0);
    const baseBmi = (b && Number(b.BMI_Value)) ? Number(b.BMI_Value) : (Number(u.BMI_Value) || null);
    const baseH = (b && Number(b.Height_cm)) ? Number(b.Height_cm) : (Number(u.Height_cm) || 0);
    const latestW = l && Number(l.Weight_kg) ? Number(l.Weight_kg) : (Number(u.Weight_kg) || 0);
    const latestBmi = l && Number(l.BMI_Value) ? Number(l.BMI_Value) : (Number(u.BMI_Value) || null);
    const latestDate = l ? String(l.Recorded_At || '') : '';
    return {
      User_ID: uid,
      Full_Name: String(u.Full_Name || ''),
      Department: String(u.Department || ''),
      Height_cm: baseH || 0,
      baseline: (baseW > 0) ? { Weight_kg: Math.round(baseW * 10) / 10, BMI_Value: baseBmi, Height_cm: baseH } : null,
      latest: {
        Weight_kg: Math.round(latestW * 10) / 10,
        BMI_Value: latestBmi,
        Recorded_At: latestDate,
        fromWeightAfter: !!l,
        fromProfile: !l
      },
      deltaWeight: (baseW > 0 && latestW > 0) ? Math.round((latestW - baseW) * 10) / 10 : null,
      deltaBmi: (baseBmi != null && latestBmi != null) ? Math.round((latestBmi - baseBmi) * 10) / 10 : null
    };
  });
}

/** เจ้าหน้าที่ นสส. / กรรมการประจำฝ่าย เปิด-ปิดช่วงบันทึกน้ำหนักหลังโครงการ */
function setWeightAfterWindow_(data) {
  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin' && String(actor.Role) !== 'Committee') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. หรือกรรมการประจำฝ่ายเท่านั้น' };
  }
  const open = String(data.Open) === '1';
  PropertiesService.getScriptProperties().setProperty('WEIGHT_AFTER_OPEN', open ? '1' : '0');
  return { success: true, open: open, message: open ? 'เปิดให้บันทึกน้ำหนักหลังโครงการแล้ว' : 'ปิดการบันทึกน้ำหนักหลังโครงการแล้ว' };
}

function loginUser_(data) {
  const users = getData_('Users');
  const user = users.find(u => String(u.User_ID) === String(data.User_ID));
  if (!user) return { success: false, message: 'ไม่พบบัญชีผู้ใช้' };
  if (!verifyPassword_(data.Password, user.Password)) return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  return { success: true, user };
}

function addStepLog_(data) {
  // ตรวจสอบโหมดบันทึก — Mode 2 บันทึกเองไม่ได้
  var checkUsers = getData_('Users');
  var checkUser = checkUsers.find(function (u) { return String(u.User_ID) === String(data.User_ID); });
  if (checkUser && String(checkUser.Step_Record_Mode || '1').trim() === '2') {
    return { success: false, message: 'คุณอยู่ในโหมดบันทึกโดยเจ้าหน้าที่ นสส. — ไม่สามารถบันทึกเองได้' };
  }
  ensureHeaders_('Steps_Log', STEPS_HEADERS);

  // อัปโหลดภาพหลักฐานไป Google Drive (โฟลเดอร์ Step_Proofs) + ตั้งชื่อไฟล์ User_ID_ชื่อ-สกุล_DDMMYYYY(BE)HHMM
  let imageDriveId = data.Image_Drive_ID || '';
  if (data.Image_Base64) {
    const users = getData_('Users');
    const user = users.find(function (u) { return String(u.User_ID) === String(data.User_ID); });
    const fullName = user ? user.Full_Name : (data.Full_Name || '');
    const uploaded = uploadProofImage_(data.Image_Base64, data.User_ID, fullName);
    if (uploaded && uploaded.error) {
      return { success: false, message: 'อัปโหลดรูปภาพหลักฐานล้มเหลว: ' + uploaded.error };
    }
    if (uploaded && uploaded.id) imageDriveId = uploaded.id;
  }

  appendData_('Steps_Log', {
    Record_ID: generateSequentialId_('Steps_Log', 'ST'),
    User_ID: data.User_ID,
    Date_Thai: data.Date_Thai || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    Steps_Count: data.Steps_Count || 0,
    Record_Method: data.Record_Method || 'Manual',
    Image_Drive_ID: imageDriveId,
    AI_Steps: (data.AI_Steps === undefined || data.AI_Steps === null || data.AI_Steps === '') ? '' : data.AI_Steps,
    AI_Confidence: (data.AI_Confidence === undefined || data.AI_Confidence === null || data.AI_Confidence === '') ? '' : data.AI_Confidence,
    Date_Match: data.Date_Match || '',
    Alert_Flag: data.Alert_Flag || 'FALSE',
    Alert_Reason: data.Alert_Reason || '',
    Status: data.Status || 'Pending',
    Week_Number: getWeekNumber_(),
    Auditor_ID: '',
    Recorded_At: getTimestamp_(),
    Notes: data.Notes || ''
  });
  return { success: true, message: 'บันทึกก้าวเดินสำเร็จ', image_drive_id: imageDriveId };
}

/**
 * แปลงค่าความจริง (boolean / string 'true'/'TRUE'/'1'/'yes'/'t' ฯลฯ) ให้เป็น boolean
 * รองรับทั้งค่า JSON (doPost) และ string จาก query parameter (doGet)
 */
function toBoolean_(val) {
  if (val === true || val === false) return val;
  if (val === undefined || val === null) return false;
  var s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 't';
}

function addSweetFree_(data) {
  // เติมคอลัมน์ Recorded_At (เวลาที่บันทึก) ให้ชีทที่ยังไม่มี — สำหรับข้อมูลใหม่ บันทึกเวลาอัตโนมัติ
  ensureHeaders_('Sweet_Free', SWEET_FREE_HEADERS);

  // ตรวจสิทธิ์: ต้องเป็น Admin หรือ Committee
  const recorder = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!recorder) return { success: false, message: 'ไม่พบผู้บันทึก' };
  if (String(recorder.Role) !== 'Admin' && String(recorder.Role) !== 'Committee') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. หรือกรรมการประจำฝ่ายเท่านั้นที่บันทึกผลงดหวานได้' };
  }

  // ตรวจช่วงเวลา: พุธ 14:00 น. – ศุกร์ 23:59 น. (ตามเวลาประเทศไทย UTC+7)
  const _bkk = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
  const day = _bkk.getUTCDay(); // 0=อาทิตย์ .. 6=เสาร์
  const minutes = _bkk.getUTCHours() * 60 + _bkk.getUTCMinutes();
  const withinWindow = (day === 3 && minutes >= 14 * 60) || day === 4 || day === 5;
  if (!withinWindow) {
    return { success: false, message: 'สามารถบันทึกผลงดหวานได้ตั้งแต่พุธ 14:00 น. ถึงศุกร์ 23:59 น. เท่านั้น' };
  }

  const sheet = getSheet_('Sweet_Free');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const userIdCol = col('User_ID');
  const wedCol = col('Wednesday_Date');
  const statusCol = col('Status');
  const loggedCol = col('Logged_By');

  // เปรียบเทียบวันที่โดย normalize ให้เป็น YYYY-MM-DD
  // (กันกรณีที่เซลล์ในชีทเป็น Date object แทน string แล้วเทียบไม่ตรง)
  function dateKeyOf_(v) {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
    return String(v || '').trim().slice(0, 10);
  }
  // สร้าง Date ที่แทนเที่ยงคืนวันพุธตามเวลาประเทศไทย (UTC+7)
  // เพื่อให้เก็บลงชีทเป็นช่วงเวลาเดียวกันเสมอ ไม่ขึ้นกับ timezone ของชีท
  var targetWed = dateKeyOf_(data.Wednesday_Date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'));
  var wedDate = null;
  if (targetWed) {
    var p = targetWed.split('-');
    if (p.length === 3) {
      wedDate = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) - 7 * 3600 * 1000);
    }
  }

  // อัปเดตแทนการเพิ่มซ้ำ: 1 บันทึกต่อบุคลากร 1 คนต่อวันพุธนั้น
  let rowIndex = -1;
  if (userIdCol > 0 && wedCol > 0 && targetWed) {
    const matched = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][userIdCol - 1]) === String(data.User_ID) &&
          dateKeyOf_(rows[i][wedCol - 1]) === targetWed) {
        matched.push(i);
      }
    }
    if (matched.length > 0) {
      rowIndex = matched[0];
      // ล้างแถวที่ซ้ำกัน (เก็บแถวแรกไว้แก้ไข) เพื่อให้ข้อมูลไม่มีรายการซ้ำ
      for (let k = matched.length - 1; k >= 1; k--) {
        sheet.deleteRow(matched[k] + 1);
      }
    }
  }

  const statusVal = toBoolean_(data.Status);
  if (rowIndex > 0) {
    if (statusCol > 0) sheet.getRange(rowIndex + 1, statusCol).setValue(statusVal);
    if (loggedCol > 0) sheet.getRange(rowIndex + 1, loggedCol).setValue(data.Logged_By || '');
    const recordedCol = col('Recorded_At');
    if (recordedCol > 0) sheet.getRange(rowIndex + 1, recordedCol).setValue(getTimestamp_());
    return { success: true, message: 'อัปเดตผลงดหวานสำเร็จ' };
  }

  appendData_('Sweet_Free', {
    Entry_ID: generateSequentialId_('Sweet_Free', 'SW'),
    User_ID: data.User_ID,
    Wednesday_Date: wedDate || targetWed,
    Status: statusVal,
    Logged_By: data.Logged_By || '',
    Recorded_At: getTimestamp_()
  });
  return { success: true, message: 'บันทึกผลงดหวานสำเร็จ' };
}

/**
 * ล้างข้อมูล Sweet_Free ที่ซ้ำ/ค่าว่าง: เก็บ 1 แถวต่อบุคลากร 1 คนต่อวันพุธ
 * - แถวซ้ำ: เก็บแถวที่บันทึกล่าสุด (index มากสุด) ลบแถวอื่น
 * - Status ว่าง: ลบทิ้ง (ข้อมูลบันทึกไม่สมบูรณ์จากเวอร์ชันเก่าที่มีบั๊ก)
 * - Wednesday_Date: normalize ให้ทุกแถวเก็บเป็นเที่ยงคืนวันพุธตามเวลาประเทศไทย (UTC+7)
 *   เพื่อให้หน้าจออ่านแล้วแสดงวันพุธได้ถูกต้อง (ข้อมูลเก่าเก็บเป็น 17:00Z ซึ่งเพี้ยน 1 วัน)
 * อนุญาตเฉพาะ Admin เท่านั้น
 */
function repairSweetFree_(data) {
  const admin = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By) && String(u.Role) === 'Admin';
  });
  if (!admin) return { success: false, message: 'เฉพาะผู้ดูแลระบบเท่านั้น' };

  const sheet = getSheet_('Sweet_Free');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (name) { return headers.indexOf(name) + 1; };
  const userIdCol = col('User_ID');
  const wedCol = col('Wednesday_Date');
  const statusCol = col('Status');
  if (userIdCol < 1 || wedCol < 1) {
    return { success: false, message: 'โครงสร้างชีท Sweet_Free ไม่ถูกต้อง' };
  }

  function dkey(v) {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
    return String(v || '').trim().slice(0, 10);
  }

  // 1) Normalize Wednesday_Date -> เที่ยงคืน (00:00) ของวันพุธตามปฏิทินไทย
  // ข้อมูลเดิมที่เก็บเป็นเที่ยงคืนไทย จะมี UTC date = วันก่อนหน้า (วันอังคาร) -> นับ +1
  // ข้อมูล seed เก่าที่เก็บเป็น "พุธ 17:00Z" มี UTC date = วันพุธ -> ใช้ตัวเดิม
  let normalized = 0;
  for (let i = 1; i < rows.length; i++) {
    const v = rows[i][wedCol - 1];
    if (!(v instanceof Date) || isNaN(v.getTime())) continue;
    const iy = v.getUTCFullYear();
    const im = v.getUTCMonth();
    const id = v.getUTCDate();
    const isTuesdayUtc = v.getUTCDay() === 2;
    const intendedIso = new Date(Date.UTC(iy, im, isTuesdayUtc ? id + 1 : id) - 7 * 3600 * 1000);
    const currentKey = dkey(v);
    const intendedKey = Utilities.formatDate(intendedIso, 'Asia/Bangkok', 'yyyy-MM-dd');
    if (currentKey !== intendedKey) {
      sheet.getRange(i + 1, wedCol).setValue(intendedIso);
      normalized++;
    }
  }

  // อ่านข้อมูลอีกครั้ง (ข้อมูลชีทเปลี่ยนจากเหตุการณ์รองรีเพจ normalize)
  const normalizedRows = sheet.getDataRange().getValues();

  // จัดกลุ่มตาม User_ID + Wednesday_Date
  const groups = {};
  for (let i = 1; i < normalizedRows.length; i++) {
    const user = String(normalizedRows[i][userIdCol - 1]).trim();
    const wed = dkey(normalizedRows[i][wedCol - 1]);
    if (!user || !wed) continue;
    const key = user + '|' + wed;
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  }

  // หาแถวที่จะลบ: (1) แถวซ้ำยกเว้นแถวสุดท้ายในแต่ละกลุ่ม (2) แถวที่ Status ว่าง
  const toDelete = [];
  Object.keys(groups).forEach(function (key) {
    const idxs = groups[key].sort(function (a, b) { return a - b; });
    if (idxs.length <= 1) return;
    const keep = idxs[idxs.length - 1]; // แถวล่าสุด
    for (let k = 0; k < idxs.length - 1; k++) toDelete.push(idxs[k]);
  });
  for (let i = 1; i < normalizedRows.length; i++) {
    const s = normalizedRows[i][statusCol - 1];
    const empty = s === null || s === undefined || String(s).trim() === '';
    if (empty && toDelete.indexOf(i) === -1) toDelete.push(i);
  }

  const deleted = toDelete.length;
  toDelete.sort(function (a, b) { return b - a; });
  toDelete.forEach(function (i) { sheet.deleteRow(i + 1); });
  return {
    success: true,
    message: 'ล้างข้อมูลสำเร็จ (แถวซ้ำ + แถวที่สถานะว่าง) ลบ ' + deleted + ' แถว · ปรับวันพุธ ' + normalized + ' แถว',
    deleted: deleted,
    normalized: normalized
  };
}

function addVoiceExecutive_(data) {
  appendData_('Voice_Executive', {
    Message_ID: generateSequentialId_('Voice_Executive', 'VM'),
    User_ID: data.User_ID || '',
    Category: data.Category || 'ทั่วไป',
    Content: data.Content || '',
    Is_Anonymous: data.Is_Anonymous || false,
    Timestamp: getTimestamp_()
  });
  return { success: true, message: 'ส่งข้อความสำเร็จ' };
}

function addWellnessAssessment_(data) {
  appendData_('Wellness_Assessment', {
    Assessment_ID: generateSequentialId_('Wellness_Assessment', 'WA'),
    User_ID: data.User_ID,
    Happiness: data.Happiness || 0,
    Physical_Health: data.Physical_Health || 0,
    Stress: data.Stress || 0,
    Assessment_Date: data.Assessment_Date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    Timestamp: getTimestamp_()
  });
  return { success: true, message: 'บันทึกการประเมินสำเร็จ' };
}

function addNews_(data) {
  appendData_('News', {
    News_ID: generateSequentialId_('News', 'N'),
    Title: data.Title || '',
    Content: data.Content || '',
    Image_URL: data.Image_URL || '',
    Created_By: data.Created_By || '',
    Created_Date: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    Send_Line_OA: data.Send_Line_OA || false
  });
  
  if (data.Send_Line_OA) {
    broadcastLine_('📢 ประกาศ: ' + data.Title);
  }
  
  return { success: true, message: 'สร้างข่าวสารสำเร็จ' };
}

function createHappyConnectMatch_(data) {
  appendData_('Happy_Connect', {
    Match_ID: generateSequentialId_('Happy_Connect', 'HC'),
    User_1_ID: data.User_1_ID || '',
    User_2_ID: data.User_2_ID || '',
    Match_Date: data.Match_Date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
    Mission_ID: data.Mission_ID || '',
    Confirmation_1: false,
    Confirmation_2: false
  });
  return { success: true, message: 'จับคู่ Happy Connect สำเร็จ' };
}

function confirmHappyConnect_(data) {
  const sheet = getSheet_('Happy_Connect');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.Match_ID) {
      const headers = rows[0];
      const colIndex = headers.indexOf(data.field) + 1;
      if (colIndex > 0) {
        sheet.getRange(i + 1, colIndex).setValue(true);
      }
      return { success: true, message: 'ยืนยันการจับคู่สำเร็จ' };
    }
  }
  return { success: false, message: 'ไม่พบ Match_ID' };
}

function registerTraining_(data) {
  const trainings = getData_('Training');
  const training = trainings.find(function (t) {
    return String(t.Training_ID) === String(data.Training_ID);
  });
  if (!training) return { success: false, message: 'ไม่พบหลักสูตรอบรม' };
  if (training.Status === 'Closed' || training.Status === 'Done') {
    return { success: false, message: 'ปิดรับสมัครแล้ว' };
  }

  const maxSeats = Number(training.Max_Seats) || 0;
  const registeredCount = Number(training.Registered_Count) || 0;
  if (maxSeats > 0 && registeredCount >= maxSeats) {
    return { success: false, message: 'ที่นั่งเต็มแล้ว (' + registeredCount + '/' + maxSeats + ')' };
  }

  // ไม่ให้ลงทะเบียนซ้ำ
  const regs = getData_('Training_Registration');
  const dup = regs.find(function (r) {
    return String(r.Training_ID) === String(data.Training_ID) &&
           String(r.User_ID) === String(data.User_ID) &&
           r.Status === 'Registered';
  });
  if (dup) return { success: false, message: 'คุณลงทะเบียนหลักสูตรนี้แล้ว' };

  appendData_('Training_Registration', {
    Reg_ID: generateSequentialId_('Training_Registration', 'R'),
    Training_ID: data.Training_ID,
    User_ID: data.User_ID,
    Status: 'Registered'
  });

  // อัปเดต Registered_Count +1
  const sheet = getSheet_('Training');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const idCol = headers.indexOf('Training_ID') + 1;
  const cntCol = headers.indexOf('Registered_Count') + 1;
  if (idCol > 0 && cntCol > 0) {
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol - 1]) === String(data.Training_ID)) {
        sheet.getRange(i + 1, cntCol).setValue(registeredCount + 1);
        break;
      }
    }
  }
  return { success: true, message: 'ลงทะเบียนอบรมสำเร็จ' };
}

/** สร้างหลักสูตรอบรมใหม่ (Admin / จ นสส. เท่านั้น) */
function addTraining_(data) {
  const registrant = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Created_By);
  });
  if (!registrant) return { success: false, message: 'ไม่พบผู้สร้างกิจกรรม' };
  if (String(registrant.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่สร้างกิจกรรมอบรมได้' };
  }

  appendData_('Training', {
    Training_ID: generateSequentialId_('Training', 'T'),
    Title: data.Title || '',
    Description: data.Description || '',
    Date_Thai: data.Date_Thai || '',
    Time: data.Time || '',
    Location: data.Location || '',
    Max_Seats: data.Max_Seats || 0,
    Registered_Count: 0,
    Status: data.Status || 'Open'
  });
  return { success: true, message: 'สร้างกิจกรรมอบรมสำเร็จ' };
}

function getWeekNumber_() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now - start + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60000) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}
// ===== SAMPLE DATA SEEDER =====

function seedSampleData() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // ── Users Sheet (10 records, 3 บทบาท: Admin/Committee/Employee) ──
  let sheet = ss.getSheetByName('Users') || ss.insertSheet('Users');
  sheet.clear();
  sheet.appendRow(USER_HEADERS);
  const sampleUsers = [
    // Admin (นสส.) / Committee / Employee — รหัสผ่านทุกคน: pass1234 (เก็บเป็น hash)
    ['1099900000011','นาย','สมชาย รักสุขภาพ','สมชาย','นักจัดการงานทั่วไป','ฝ่ายทะเบียน','1985-01-01','ชาย','72','175','23.5','32','Admin','','1240','ต้นแบบลาดพร้าวสร้างสุข','P001','Registered','นสส. (Admin)','2026-08-01 09:00:00','สมชาย','รักสุขภาพ','','sweet_free,steps,training'],
    ['1099900000020','นางสาว','สมหญิง ใจดี','หญิง','เจ้าพนักงานการเงิน','ฝ่ายการคลัง','1990-03-15','หญิง','58','162','22.1','28','Committee','','980','สร้างสุข','P002','Registered','นสส. (Admin)','2026-08-01 09:05:00','สมหญิง','ใจดี','','sweet_free,steps'],
    ['1099900000038','นาย','วิชัย แข็งแรง','วิชัย','เจ้าพนักงานธุรการ','ฝ่ายรักษาความสะอาดฯ','1987-07-20','ชาย','80','178','25.2','34','Committee','','1560','ต้นแบบลาดพร้าวสร้างสุข','P003','Registered','นสส. (Admin)','2026-08-01 09:10:00','วิชัย','แข็งแรง','','sweet_free,steps,training'],
    ['1099900000046','นาง','กัญญา สดใส','กัญญา','นักจัดการงานทั่วไป','ฝ่ายสิ่งแวดล้อมฯ','1992-11-05','หญิง','55','160','21.5','26','Employee','','750','สุขภาพดี','P004','Registered','นสส. (Admin)','2026-08-01 09:15:00','กัญญา','สดใส','','sweet_free,steps'],
    ['1099900000054','นาย','อนันต์ มั่งมี','อนันต์','หัวหน้าฝ่ายโยธา','ฝ่ายโยธา','1982-06-10','ชาย','85','180','26.2','36','Employee','','2100','ต้นแบบลาดพร้าวสร้างสุข','P005','Registered','นสส. (Admin)','2026-08-01 09:20:00','อนันต์','มั่งมี','','sweet_free,training'],
    ['1099900000062','นางสาว','สุดา ร่าเริง','สุดา','นักจัดการงานทั่วไป','ฝ่ายพัฒนาชุมชน','1995-02-22','หญิง','52','158','20.8','25','Employee','','620','กำลังก้าว','P006','Registered','นสส. (Admin)','2026-08-01 09:25:00','สุดา','ร่าเริง','','sweet_free,steps'],
    ['1099900000071','นาย','สมเกียรติ ขยันดี','เกียรติ','เจ้าพนักงานจัดเก็บฯ','ฝ่ายรายได้','1986-08-18','ชาย','75','172','25.4','33','Employee','','1150','สร้างสุข','P007','Registered','นสส. (Admin)','2026-08-01 09:30:00','สมเกียรติ','ขยันดี','','sweet_free'],
    ['1099900000089','นาง','ประภาพร งามเลิศ','พร','นักจัดการงานทั่วไป','ฝ่ายปกครอง','1988-12-30','หญิง','60','165','22.0','27','Employee','','1850','ต้นแบบลาดพร้าวสร้างสุข','P008','Registered','นสส. (Admin)','2026-08-01 09:35:00','ประภาพร','งามเลิศ','','sweet_free,steps,training'],
    ['1099900000097','นาย','ธีระชัย มั่นคง','ธี','เจ้าพนักงานธุรการ','ฝ่ายการศึกษา','1991-04-14','ชาย','70','170','24.2','31','Employee','','890','สุขภาพดี','P009','Registered','นสส. (Admin)','2026-08-01 09:40:00','ธีระชัย','มั่นคง','','sweet_free,steps'],
    ['1099900000101','นางสาว','น้ำฝน ใจเย็น','ฝน','นักจัดการงานทั่วไป','ฝ่ายการคลัง','1993-10-08','หญิง','54','160','21.1','26','Employee','','540','เริ่มต้น','P010','Registered','นสส. (Admin)','2026-08-01 09:45:00','น้ำฝน','ใจเย็น','','sweet_free,steps,training'],
  ];
  sampleUsers.forEach(row => {
    const hashIndex = USER_HEADERS.indexOf('Password');
    row[hashIndex] = hashPassword_('pass1234');
    sheet.appendRow(row);
  });

  // ── Steps_Log Sheet (30 records) ──
  sheet = ss.getSheetByName('Steps_Log') || ss.insertSheet('Steps_Log');
  sheet.clear();
  sheet.appendRow(STEPS_HEADERS);
  const sampleSteps = [
    ['ST001','1099900000011','2026-07-27','8240','Google Fit','','Approved',30,'1099900000089'],
    ['ST002','1099900000011','2026-07-26','7800','Manual','','Approved',30,'1099900000089'],
    ['ST003','1099900000011','2026-07-25','9120','Google Fit','','Approved',30,'1099900000089'],
    ['ST004','1099900000020','2026-07-27','6540','Manual','','Pending',30,''],
    ['ST005','1099900000020','2026-07-26','8200','Google Fit','','Approved',30,'1099900000089'],
    ['ST006','1099900000038','2026-07-27','11200','Google Fit','','Approved',30,'1099900000089'],
    ['ST007','1099900000038','2026-07-26','9500','Manual','','Approved',30,'1099900000089'],
    ['ST008','1099900000046','2026-07-27','7200','Manual','','Pending',30,''],
    ['ST009','1099900000046','2026-07-26','8100','Google Fit','','Approved',30,'1099900000089'],
    ['ST010','1099900000054','2026-07-27','9800','Google Fit','','Approved',30,'1099900000089'],
    ['ST011','1099900000054','2026-07-25','10500','Manual','','Approved',30,'1099900000089'],
    ['ST012','1099900000062','2026-07-27','5100','Manual','','Pending',30,''],
    ['ST013','1099900000062','2026-07-25','7800','Google Fit','','Approved',30,'1099900000089'],
    ['ST014','1099900000071','2026-07-27','8900','Google Fit','','Approved',30,'1099900000089'],
    ['ST015','1099900000071','2026-07-26','7200','Manual','','Approved',30,'1099900000089'],
    ['ST016','1099900000089','2026-07-27','9500','Google Fit','','Approved',30,'1099900000089'],
    ['ST017','1099900000089','2026-07-26','11000','Google Fit','','Approved',30,'1099900000089'],
    ['ST018','1099900000097','2026-07-27','6700','Manual','','Pending',30,''],
    ['ST019','1099900000097','2026-07-26','5900','Manual','','Approved',30,'1099900000089'],
    ['ST020','1099900000101','2026-07-27','4300','Manual','','Approved',30,'1099900000089'],
    ['ST021','1099900000011','2026-07-24','10200','Google Fit','','Approved',30,'1099900000089'],
    ['ST022','1099900000020','2026-07-24','5600','Manual','','Pending',30,''],
    ['ST023','1099900000038','2026-07-24','11500','Google Fit','','Approved',30,'1099900000089'],
    ['ST024','1099900000046','2026-07-24','7100','Manual','','Approved',30,'1099900000089'],
    ['ST025','1099900000054','2026-07-24','8800','Google Fit','','Approved',30,'1099900000089'],
    ['ST026','1099900000062','2026-07-24','3900','Manual','','Pending',30,''],
    ['ST027','1099900000071','2026-07-24','9400','Google Fit','','Approved',30,'1099900000089'],
    ['ST028','1099900000089','2026-07-24','6200','Manual','','Pending',30,''],
    ['ST029','1099900000097','2026-07-24','7800','Google Fit','','Approved',30,'1099900000089'],
    ['ST030','1099900000101','2026-07-24','4800','Manual','','Pending',30,''],
  ];
  sampleSteps.forEach(row => sheet.appendRow(row));

  // ── Sweet_Free Sheet (25 records) ──
  sheet = ss.getSheetByName('Sweet_Free') || ss.insertSheet('Sweet_Free');
  sheet.clear();
  sheet.appendRow(SWEET_FREE_HEADERS);
  const sampleSweet = [
    ['SW001','1099900000011','2026-07-22',true,'1099900000089','2026-07-22 14:30:00'],
    ['SW002','1099900000020','2026-07-22',true,'1099900000089','2026-07-22 14:32:00'],
    ['SW003','1099900000038','2026-07-22',false,'1099900000089','2026-07-22 14:35:00'],
    ['SW004','1099900000046','2026-07-22',true,'1099900000089','2026-07-22 14:40:00'],
    ['SW005','1099900000054','2026-07-22',true,'1099900000089','2026-07-22 14:41:00'],
    ['SW006','1099900000062','2026-07-22',false,'1099900000089','2026-07-22 14:45:00'],
    ['SW007','1099900000071','2026-07-22',true,'1099900000089','2026-07-22 14:47:00'],
    ['SW008','1099900000089','2026-07-22',true,'1099900000089','2026-07-22 14:50:00'],
    ['SW009','1099900000097','2026-07-22',true,'1099900000089','2026-07-22 14:52:00'],
    ['SW010','1099900000101','2026-07-22',false,'1099900000089','2026-07-22 14:55:00'],
    ['SW011','1099900000011','2026-07-22',true,'1099900000089','2026-07-22 15:05:00'],
    ['SW012','1099900000020','2026-07-22',true,'1099900000089','2026-07-22 15:10:00'],
    ['SW013','1099900000038','2026-07-22',true,'1099900000089','2026-07-22 15:12:00'],
    ['SW014','1099900000046','2026-07-22',false,'1099900000089','2026-07-22 15:15:00'],
    ['SW015','1099900000054','2026-07-22',true,'1099900000089','2026-07-22 15:18:00'],
    ['SW016','1099900000062','2026-07-22',false,'1099900000089','2026-07-22 15:20:00'],
    ['SW017','1099900000071','2026-07-22',true,'1099900000089','2026-07-22 15:22:00'],
    ['SW018','1099900000089','2026-07-22',true,'1099900000089','2026-07-22 15:25:00'],
    ['SW019','1099900000097','2026-07-22',true,'1099900000089','2026-07-22 15:28:00'],
    ['SW020','1099900000101','2026-07-22',false,'1099900000089','2026-07-22 15:30:00'],
    ['SW021','1099900000011','2026-07-15',true,'1099900000089','2026-07-15 14:30:00'],
    ['SW022','1099900000020','2026-07-15',false,'1099900000089','2026-07-15 14:34:00'],
    ['SW023','1099900000038','2026-07-15',true,'1099900000089','2026-07-15 14:38:00'],
    ['SW024','1099900000054','2026-07-15',true,'1099900000089','2026-07-15 14:42:00'],
    ['SW025','1099900000071','2026-07-15',true,'1099900000089','2026-07-15 14:46:00'],
  ];
  sampleSweet.forEach(row => sheet.appendRow(row));

  // ── Happy_Connect Sheet (8 records) ──
  sheet = ss.getSheetByName('Happy_Connect') || ss.insertSheet('Happy_Connect');
  sheet.clear();
  sheet.appendRow(['Match_ID','User_1_ID','User_2_ID','Match_Date','Mission_ID','Confirmation_1','Confirmation_2','Mission_Image','Feedback_Score']);
  const sampleMatch = [
    ['HC001','1099900000011','1099900000038','2026-07-21','M001',true,true,'',3],
    ['HC002','1099900000020','1099900000054','2026-07-21','M002',true,false,'',2],
    ['HC003','1099900000046','1099900000071','2026-07-21','M003',false,false,'',0],
    ['HC004','1099900000062','1099900000089','2026-07-21','M001',true,true,'',3],
    ['HC005','1099900000097','1099900000101','2026-07-21','M002',true,true,'',2],
    ['HC006','1099900000011','1099900000062','2026-07-14','M003',true,false,'',1],
    ['HC007','1099900000020','1099900000089','2026-07-14','M001',true,true,'',3],
    ['HC008','1099900000054','1099900000071','2026-07-14','M002',false,true,'',1],
  ];
  sampleMatch.forEach(row => sheet.appendRow(row));

  // ── News Sheet (6 records) ──
  sheet = ss.getSheetByName('News') || ss.insertSheet('News');
  sheet.clear();
  sheet.appendRow(['News_ID','Title','Content','Image_URL','Created_By','Created_Date','Send_Line_OA']);
  const sampleNews = [
    ['N001','เตรียมพบกับกิจกรรม "เดินกินลม ชมลาดพร้าว" ครั้งที่ 5','ขอเชิญชวนเจ้าหน้าที่ทุกท่านร่วมกิจกรรมเดิน-วิ่งเพื่อสุขภาพ พร้อมชมบรรยากาศสวนสาธารณะเขตลาดพร้าว','https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800','1099900000089','2026-07-25',true],
    ['N002','5 เคล็ดลับ งดหวานเพื่อลดพุงแบบคนรุ่นใหม่','การลดน้ำตาลไม่ใช่เรื่องยาก แค่เริ่มต้นจากการเปลี่ยนเครื่องดื่มประจำวัน มาดูเคล็ดลับง่ายๆ ที่ทำได้ทันที','https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800','1099900000089','2026-07-24',true],
    ['N003','เปิดรับสมัครการอบรม Office Syndrome รุ่นที่ 2','ผู้ที่มีอาการปวดคอ บ่า ไหล่ เราขอเชิญเข้าร่วมการอบรมกับนักกายภาพบำบัดมืออาชีพ','https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800','1099900000089','2026-07-22',true],
    ['N004','กิจกรรม Happy Connect ประจำเดือนสิงหาคม','พบกับกิจกรรมจับคู่บัดดี้ต่างฝ่าย เพื่อสร้างความสัมพันธ์ที่ดีในองค์กร ประจำเดือนสิงหาคมนี้','https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800','1099900000089','2026-07-20',true],
    ['N005','ผลสำรวจความสุขประจำเดือนมิถุนายน','บุคลากรลาดพร้าวมีคะแนนความสุขเฉลี่ยเพิ่มขึ้น 15% จากเดือนก่อนหน้า ขอบคุณทุกท่านที่ร่วมสร้างสุข','https://images.unsplash.com/photo-1559757175-5700dde675bc?w=800','1099900000089','2026-07-18',true],
    ['N006','เปิดรับสมัครทีม นสส. รุ่นใหม่','ขอเชิญผู้สนใจร่วมเป็นทีมงาน นสส. เพื่อขับเคลื่อนกิจกรรมสร้างสุขในองค์กร','https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800','1099900000089','2026-07-15',true],
  ];
  sampleNews.forEach(row => sheet.appendRow(row));

  // ── Wellness_Assessment Sheet (25 records) ──
  sheet = ss.getSheetByName('Wellness_Assessment') || ss.insertSheet('Wellness_Assessment');
  sheet.clear();
  sheet.appendRow(['Assessment_ID','User_ID','Happiness','Physical_Health','Stress','Assessment_Date','Timestamp']);
  const sampleWellness = [
    ['WA001','1099900000011',4,5,2,'2026-07-27','2026-07-27 08:30:00'],
    ['WA002','1099900000020',3,4,3,'2026-07-27','2026-07-27 09:00:00'],
    ['WA003','1099900000038',5,4,1,'2026-07-27','2026-07-27 10:00:00'],
    ['WA004','1099900000046',4,3,3,'2026-07-27','2026-07-27 11:00:00'],
    ['WA005','1099900000054',4,4,2,'2026-07-27','2026-07-27 12:00:00'],
    ['WA006','1099900000062',3,3,4,'2026-07-27','2026-07-27 08:00:00'],
    ['WA007','1099900000071',4,4,2,'2026-07-27','2026-07-27 13:00:00'],
    ['WA008','1099900000089',5,5,1,'2026-07-27','2026-07-27 07:30:00'],
    ['WA009','1099900000097',3,3,3,'2026-07-27','2026-07-27 09:30:00'],
    ['WA010','1099900000101',2,3,4,'2026-07-27','2026-07-27 10:00:00'],
    ['WA011','1099900000011',4,4,2,'2026-07-27','2026-07-27 08:00:00'],
    ['WA012','1099900000020',3,2,3,'2026-07-27','2026-07-27 11:00:00'],
    ['WA013','1099900000038',4,5,1,'2026-07-27','2026-07-27 09:00:00'],
    ['WA014','1099900000046',5,4,2,'2026-07-27','2026-07-27 10:30:00'],
    ['WA015','1099900000054',3,3,3,'2026-07-27','2026-07-27 14:00:00'],
    ['WA016','1099900000062',4,2,2,'2026-07-27','2026-07-27 08:15:00'],
    ['WA017','1099900000071',4,4,2,'2026-07-27','2026-07-27 11:30:00'],
    ['WA018','1099900000089',3,3,4,'2026-07-27','2026-07-27 13:30:00'],
    ['WA019','1099900000097',4,5,1,'2026-07-27','2026-07-27 09:45:00'],
    ['WA020','1099900000101',3,2,3,'2026-07-27','2026-07-27 10:15:00'],
    ['WA021','1099900000011',5,5,1,'2026-07-26','2026-07-26 08:30:00'],
    ['WA022','1099900000038',4,3,2,'2026-07-26','2026-07-26 10:00:00'],
    ['WA023','1099900000054',3,4,3,'2026-07-26','2026-07-26 12:00:00'],
    ['WA024','1099900000020',4,4,2,'2026-07-25','2026-07-25 09:00:00'],
    ['WA025','1099900000071',3,3,4,'2026-07-25','2026-07-25 14:00:00'],
  ];
  sampleWellness.forEach(row => sheet.appendRow(row));

  // ── Voice_Executive Sheet (8 records) ──
  sheet = ss.getSheetByName('Voice_Executive') || ss.insertSheet('Voice_Executive');
  sheet.clear();
  sheet.appendRow(['Message_ID','User_ID','Category','Content','Is_Anonymous','Timestamp']);
  const sampleVoice = [
    ['VM001','1099900000011','ขอบคุณ','ขอขอบคุณผู้บริหารที่จัดกิจกรรมดีๆ เพื่อสุขภาพของบุคลากร',false,'2026-07-27 10:00:00'],
    ['VM002','1099900000020','ปัญหา','อยากให้เพิ่มจุดบริการน้ำดื่มในแต่ละชั้น เพื่อส่งเสริมการดื่มน้ำ',true,'2026-07-26 14:30:00'],
    ['VM003','1099900000038','พัฒนา','แนะนำให้มีการแข่งขันก้าวเดินระหว่างฝ่ายเพื่อกระตุ้นการมีส่วนร่วม',false,'2026-07-25 16:00:00'],
    ['VM004','','ขออภัย','ขออภัยที่ไม่ได้เข้าร่วมกิจกรรมเมื่อสัปดาห์ที่แล้ว ติดภารกิจด่วน',true,'2026-07-24 09:15:00'],
    ['VM005','1099900000054','ขอบคุณ','ขอบคุณทีม นสส. ที่ดำเนินกิจกรรมอย่างต่อเนื่อง ทำให้องค์กรน่าอยู่ขึ้น',false,'2026-07-23 11:45:00'],
    ['VM006','1099900000071','ข้อเสนอแนะ','อยากให้มีกิจกรรมออกกำลังกายสัปดาห์ละ 2 ครั้ง',false,'2026-07-22 15:00:00'],
    ['VM007','1099900000089','ขอบคุณ','ขอบคุณเพื่อนร่วมงานทุกคนที่ร่วมใจกันทำกิจกรรมสร้างสุข',true,'2026-07-21 09:30:00'],
    ['VM008','1099900000038','พัฒนา','ควรมีการจัดอันดับฝ่ายที่มีสุขภาพดีที่สุดทุกเดือน',false,'2026-07-20 13:00:00'],
  ];
  sampleVoice.forEach(row => sheet.appendRow(row));

  // ── Training Sheet (5 records) ──
  sheet = ss.getSheetByName('Training') || ss.insertSheet('Training');
  sheet.clear();
  sheet.appendRow(['Training_ID','Title','Description','Date_Thai','Time','Location','Max_Seats','Registered_Count','Status']);
  const sampleTraining = [
    ['T001','การจัดการความเครียดในที่ทำงาน','เรียนรู้เทคนิคการจัดการความเครียดและการผ่อนคลายจิตใจ','2026-08-10','09:00-12:00','ห้องประชุมชั้น 3',30,22,'Open'],
    ['T002','Office Syndrome รุ่นที่ 2','อบรมเชิงปฏิบัติการป้องกันและบรรเทาอาการ Office Syndrome','2026-08-15','13:00-16:00','ห้องอบรมชั้น 5',25,25,'Closed'],
    ['T003','การปฐมพยาบาลเบื้องต้น','เรียนรู้วิธีการปฐมพยาบาลเบื้องต้นและการช่วยชีวิตขั้นพื้นฐาน','2026-08-20','09:00-16:00','ห้องประชุมใหญ่',40,15,'Open'],
    ['T004','โภชนาการเพื่อสุขภาพที่ดี','เรียนรู้การเลือกรับประทานอาหารที่เหมาะสมสำหรับบุคลากรออฟฟิศ','2026-08-05','10:00-12:00','ห้องอาหารชั้น 2',20,20,'Done'],
    ['T005','การออกกำลังกายในสำนักงาน','ท่าออกกำลังกายง่ายๆ ที่ทำได้ระหว่างทำงาน','2026-08-25','14:00-15:30','ลานอเนกประสงค์',50,12,'Open'],
  ];
  sampleTraining.forEach(row => sheet.appendRow(row));

  // ── Training_Registration Sheet (5 records) ──
  sheet = ss.getSheetByName('Training_Registration') || ss.insertSheet('Training_Registration');
  sheet.clear();
  sheet.appendRow(['Reg_ID','Training_ID','User_ID','Status']);
  const sampleReg = [
    ['R001','T001','1099900000011','Registered'],
    ['R002','T001','1099900000038','CheckedIn'],
    ['R003','T002','1099900000020','Registered'],
    ['R004','T002','1099900000054','Cancelled'],
    ['R005','T004','1099900000089','CheckedIn'],
  ];
  sampleReg.forEach(row => sheet.appendRow(row));

  return { success: true, message: 'เพิ่มข้อมูลตัวอย่าง 20+ รายการสำเร็จ' };
}

// ===== STEP PROOF IMAGE (Google Drive) =====

/** หา/สร้างโฟลเดอร์ base (Ladprao_Happy_Evidence) — รองรับกรณี DRIVE_FOLDER_ID ไม่มีอยู่จริง */
function getStepProofsBaseFolder_() {
  if (CONFIG.DRIVE_FOLDER_ID) {
    try {
      return DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    } catch (e) {
      console.error('getStepProofsBaseFolder_: folder by ID not found, fallback to create by name:', e.toString());
    }
  }
  const BASE_NAME = 'Ladprao_Happy_Evidence';
  const it = DriveApp.getFoldersByName(BASE_NAME);
  if (it.hasNext()) return it.next();
  const folder = DriveApp.createFolder(BASE_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

/** หา/สร้างโฟลเดอร์ Step_Proofs ใต้ base folder — สร้างเองถ้ายังไม่มี */
function getStepProofsFolder_() {
  const base = getStepProofsBaseFolder_();
  const it = base.getFoldersByName(CONFIG.STEP_PROOF_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  const folder = base.createFolder(CONFIG.STEP_PROOF_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

/** ตรวจสอบสิทธิ์ Drive + คืนข้อมูลโฟลเดอร์ (สำหรับหน้า Admin ตรวจสอบว่าระบบพร้อมใช้) */
function testDrive_() {
  try {
    const folder = getStepProofsFolder_();
    return {
      success: true,
      folderName: folder.getName(),
      folderId: folder.getId(),
      folderUrl: 'https://drive.google.com/drive/folders/' + folder.getId()
    };
  } catch (e) {
    console.error('testDrive_ error:', e);
    return { success: false, error: e.toString() };
  }
}

/** ตั้งชื่อไฟล์: User_ID_ชื่อ-สกุล_DDMMYYYY(BE)HHMM เช่น 1000010020123_มานะ ใจเย็น_310725690847 */
function buildProofFileName_(userId, fullName, date) {
  const tz = 'Asia/Bangkok';
  const dd = Utilities.formatDate(date, tz, 'dd');
  const MM = Utilities.formatDate(date, tz, 'MM');
  const yyyy = (parseInt(Utilities.formatDate(date, tz, 'yyyy'), 10) + 543).toString();
  const HHmm = Utilities.formatDate(date, tz, 'HHmm');
  const safeName = String(fullName || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return String(userId || '') + '_' + safeName + '_' + dd + MM + yyyy + HHmm;
}

function uploadProofImage_(base64, userId, fullName) {
  try {
    const folder = getStepProofsFolder_();
    const decoded = Utilities.base64Decode(base64);

    // เดา mime type จาก magic bytes
    let mimeType = 'image/jpeg';
    const header = String(base64).substring(0, 12);
    if (header.indexOf('iVBORw0KGgo') === 0) mimeType = 'image/png';
    else if (header.indexOf('R0lGOD') === 0) mimeType = 'image/gif';
    else if (header.indexOf('/9j/') === 0) mimeType = 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : 'jpg';

    const fileName = buildProofFileName_(userId, fullName, new Date());
    const blob = Utilities.newBlob(decoded, mimeType, fileName + '.' + ext);
    const file = folder.createFile(blob);
    // แชร์ "ใครมีลิงก์ก็ดูได้" เพื่อให้จนท.นสส. เปิดดูภาพหลักฐานในหน้า Admin ได้โดยไม่ต้องขอสิทธิ์
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
  } catch (e) {
    console.error('uploadProofImage_ error:', e);
    return { error: e.toString() };
  }
}

// ===== STEP VERIFICATION (Admin / นสส.) =====

/**
 * อนุมัติ / ไม่อนุมัติจำนวนก้าวจากภาพ
 * เงื่อนไข: ผู้ตรวจสอบ (Auditor) ต้องเป็น "บุคคลต่างฝ่าย" กับผู้บันทึก
 */
function updateStepStatus_(data) {
  ensureHeaders_('Steps_Log', STEPS_HEADERS);
  const sheet = getSheet_('Steps_Log');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  const col = function (name) { return headers.indexOf(name) + 1; };
  const recordCol = col('Record_ID');
  const userCol = col('User_ID');
  if (recordCol < 1 || userCol < 1) return { success: false, message: 'Steps_Log ยังไม่มีข้อมูล' };

  let rowIndex = -1;
  let submitterId = '';
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][recordCol - 1]) === String(data.Record_ID)) {
      rowIndex = i;
      submitterId = rows[i][userCol - 1];
      break;
    }
  }
  if (rowIndex < 1) return { success: false, message: 'ไม่พบ Record_ID' };

  // ⚠️ ตรวจสอบ "บุคคลต่างฝ่าย" — ผู้ตรวจต้องอยู่คนละฝ่ายกับผู้บันทึกก้าว
  const users = getData_('Users');
  const submitter = users.find(function (u) { return String(u.User_ID) === String(submitterId); });
  const auditor = users.find(function (u) { return String(u.User_ID) === String(data.Auditor_ID); });
  if (!auditor) return { success: false, message: 'ไม่พบข้อมูลผู้ตรวจสอบ' };
  if (submitter && submitter.Department && auditor.Department &&
      String(submitter.Department) === String(auditor.Department)) {
    return { success: false, message: 'ไม่สามารถตรวจสอบได้ ต้องเป็นบุคคลต่างฝ่ายกับผู้บันทึกก้าว' };
  }

  const setCol = function (name, value) {
    const c = col(name);
    if (c > 0) sheet.getRange(rowIndex + 1, c).setValue(value);
  };

  const newStatus = data.Status === 'Approved' ? 'Approved' : 'Rejected';
  setCol('Status', newStatus);
  setCol('Auditor_ID', data.Auditor_ID || '');
  setCol('Reviewed_At', getTimestamp_());
  if (newStatus === 'Rejected') setCol('Reject_Reason', data.Reject_Reason || '');

  // เจ้าหน้าที่ นสส. สามารถแก้ไขจำนวนก้าวให้ตรงกับรูปหลักฐานก่อนอนุมัติ
  const newSteps = data.Steps_Count !== undefined && data.Steps_Count !== null && data.Steps_Count !== ''
    ? Number(data.Steps_Count)
    : NaN;
  if (newStatus === 'Approved' && !isNaN(newSteps) && newSteps >= 0) {
    setCol('Steps_Count', newSteps);
  }

  // Audit Log
  ensureHeaders_('Audit_Log', AUDIT_HEADERS);
  appendData_('Audit_Log', {
    Audit_ID: generateSequentialId_('Audit_Log', 'AU'),
    Record_ID: data.Record_ID,
    Action: 'STEP_' + newStatus.toUpperCase(),
    User_ID: data.Auditor_ID || '',
    Detail: newStatus === 'Rejected' ? ('Reject reason: ' + (data.Reject_Reason || '')) : 'Approve step image proof',
    Timestamp: getTimestamp_()
  });

  return { success: true, message: newStatus === 'Approved' ? 'อนุมัติจำนวนก้าวสำเร็จ' : 'ไม่อนุมัติจำนวนก้าวแล้ว' };
}

// ===== GOOGLE FIT LINK MANAGEMENT =====

/**
 * ตรวจสอบว่า Gmail นี้ถูกผูกกับ user ใดหรือยัง
 */
function checkGoogleFitEmail_(e) {
  const email = e && e.email ? e.email : (e && e.parameter ? e.parameter.email : '');
  if (!email) return { duplicate: false };

  const sheet = getSheet_('Google_Fit_Links');
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { duplicate: false };

  const headers = data[0];
  const emailIdx = headers.indexOf('Gmail');
  if (emailIdx < 0) return { duplicate: false };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailIdx]).toLowerCase() === email.toLowerCase()) {
      return { duplicate: true, linkedUser: String(data[i][0] || '').trim() };
    }
  }
  return { duplicate: false };
}

/**
 * บันทึกการเชื่อมต่อ Google Fit (User_ID + Gmail)
 * - หาก Gmail นี้มีอยู่แล้วสำหรับ User_ID เดียวกัน -> อัปเดต Connected_At
 * - หาก Gmail นี้มีอยู่แล้วแต่ User_ID คนละคน -> reject (กันซ้ำ)
 * - หากใหม่ทั้งคู่ -> append ใหม่
 */
function saveGoogleFitLink_(data) {
  const sheet = getSheet_('Google_Fit_Links');

  // Initialize headers if needed
  const existingData = sheet.getDataRange().getValues();
  if (existingData.length < 1 || existingData[0][0] !== 'User_ID') {
    sheet.clear();
    sheet.appendRow(['User_ID','Gmail','Connected_At']);
    sheet.getRange(1, 1, 1, 1).setNumberFormat('@');
    // เนื่องจากล้างชีทหมดแล้ว จึง append ใหม่เลย — บังคับ User_ID เป็นข้อความ
    var initUid = String(data.User_ID || '').trim();
    sheet.appendRow([initUid, data.email || '', data.connected_at || getTimestamp_()]);
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('@');
    // กันชีทแปลงเป็นตัวเลข (เช่น 1.1E+12)
    try { SpreadsheetApp.flush(); } catch(e) {}
    return { success: true };
  }
  // กันคอลัมน์ User_ID ถูกมองเป็นตัวเลข — ตั้ง format เป็นข้อความทั้งคอลัมน์
  try { sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat('@'); } catch(e) {}

  const headers = existingData[0];
  const uidIdx = headers.indexOf('User_ID');
  const emailIdx = headers.indexOf('Gmail');
  const dateIdx = headers.indexOf('Connected_At');

  const newUid = String(data.User_ID || '').trim();
  const newEmail = String(data.email || '').trim().toLowerCase();
  const newDate = data.connected_at || getTimestamp_();

  // ค้นหา row ที่มี Gmail นี้อยู่แล้ว
  for (let i = 1; i < existingData.length; i++) {
    const rowEmail = String(existingData[i][emailIdx] || '').trim().toLowerCase();
    const rowUid = String(existingData[i][uidIdx] || '').trim();

    if (rowEmail === newEmail) {
      // พบ Gmail ซ้ำ
      if (rowUid === newUid) {
        // เดียวกับ User_ID เดิม -> อัปเดต Connected_At
        sheet.getRange(i + 1, dateIdx + 1).setValue(newDate);
        return { success: true, updated: true };
      } else {
        // Gmail นี้ผูกกับคนอื่นอยู่แล้ว -> reject
        return { success: false, error: 'Gmail นี้ถูกผูกกับผู้ใช้อื่นแล้ว' };
      }
    }
  }

  // ไม่พบ Gmail นี้ -> append ใหม่ — บังคับ User_ID เป็นข้อความ
  sheet.appendRow([newUid, newEmail, newDate]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('@');
  try { SpreadsheetApp.flush(); } catch(e) {}
  return { success: true };
}

/**
 * รีเซ็ตข้อมูลการเชื่อมต่อ Google Fit ทั้งหมด (ล้างชีท Google_Fit_Links)
 * ใช้สำหรับเริ่มต้นใหม่ หรือแก้ไขปัญหาข้อมูลซ้ำ
 * เฉพาะ Admin (นสส.) เท่านั้นที่เรียกได้
 */
function resetGoogleFitLinks_(data) {
  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่รีเซ็ตการเชื่อมต่อ Google Fit ได้' };
  }

  const sheet = getSheet_('Google_Fit_Links');
  sheet.clear();
  sheet.appendRow(['User_ID', 'Gmail', 'Connected_At']);

  return { success: true, message: 'ล้างข้อมูลการเชื่อมต่อ Google Fit เรียบร้อยแล้ว' };
}

/**
 * รีเซ็ตการเชื่อมต่อ Google Fit ของผู้ใช้รายเดียว (ลบเฉพาะ Gmail ของ User_ID นั้น)
 * เฉพาะ Admin (นสส.) เท่านั้นที่เรียกได้
 */
function resetUserGoogleFitLink_(data) {
  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่รีเซ็ตการเชื่อมต่อ Google Fit ได้' };
  }

  const targetUserId = String(data.User_ID || '').trim();
  if (!targetUserId) return { success: false, message: 'กรุณาระบุ User_ID' };

  const sheet = getSheet_('Google_Fit_Links');
  const dataRange = sheet.getDataRange().getValues();
  if (dataRange.length < 2) return { success: true, message: 'ไม่มีข้อมูลให้ลบ' };

  const headers = dataRange[0];
  const uidIdx = headers.indexOf('User_ID');
  if (uidIdx < 0) return { success: false, message: 'โครงสร้างชีทไม่ถูกต้อง' };

  const rowsToDelete = [];
  for (let i = 1; i < dataRange.length; i++) {
    if (String(dataRange[i][uidIdx] || '').trim() === targetUserId) {
      rowsToDelete.push(i + 1);
    }
  }

  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }

  return { success: true, message: 'ลบการเชื่อมต่อ Google Fit ของผู้ใช้ ' + targetUserId + ' เรียบร้อยแล้ว (' + rowsToDelete.length + ' รายการ)' };
}

// ===== PROFILE IMAGE (Google Drive) =====

const PROFILE_FOLDER_NAME = 'Profile_Images';

/** หา/สร้างโฟลเดอร์ Profile_Images ใต้ base folder — สร้างเองถ้ายังไม่มี */
function getProfileImagesFolder_() {
  const base = getStepProofsBaseFolder_();
  const it = base.getFoldersByName(PROFILE_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  const folder = base.createFolder(PROFILE_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

/** สร้างชื่อไฟล์รูปโปรไฟล์ตามแบบ: ชื่อ-สกุล_ส่วนราชการ_เลขบัตรประชาชน (ไม่มีส่วนขยายไฟล์) */
function buildProfileFileName_(fullName, department, citizenId) {
  const safe = function (s) {
    return String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  };
  return safe(fullName) + '_' + safe(department) + '_' + safe(citizenId);
}

/**
 * อัปโหลด base64 ไปโฟลเดอร์ Profile_Images — คืน {id, url}
 * ชื่อไฟล์ = ชื่อ-สกุล_ส่วนราชการ_เลขบัตรประชาชน
 * หากมีไฟล์ชื่อเดียวกันเดิมอยู่แล้ว จะลบไฟล์เดิมออกก่อนแล้วอัปโหลดใหม่ (ทับของเดิม)
 */
function uploadProfileImageRaw_(base64, fileBaseName) {
  try {
    let mimeType = 'image/jpeg';
    if (String(base64).indexOf('iVBORw0KGgo') === 0) mimeType = 'image/png';
    else if (String(base64).indexOf('R0lGOD') === 0) mimeType = 'image/gif';
    else if (String(base64).indexOf('/9j/') === 0) mimeType = 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : 'jpg';

    const folder = getProfileImagesFolder_();

    // ทับของเดิม: หาไฟล์ที่มีชื่อฐานเดียวกันลบออกก่อน (รองรับนามสกุลต่างกัน เช่น jpg/png)
    const baseName = String(fileBaseName || '') || ('profile_' + getTimestamp_().replace(/[- :]/g, ''));
    const all = folder.getFiles();
    while (all.hasNext()) {
      const f = all.next();
      const fName = String(f.getName() || '');
      const fBase = fName.replace(/\.[^/.]+$/, '');
      if (fBase === baseName) {
        try { folder.removeFile(f); } catch (e) { /* ข้ามไฟล์ที่ลบไม่ได้ */ }
      }
    }

    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, baseName + '.' + ext);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
  } catch (e) {
    console.error('uploadProfileImageRaw_ error:', e);
    return { error: e.toString() };
  }
}

/**
 * อัปโหลดรูปโปรไฟล์บุคลากรไป Google Drive แล้วบันทึก Drive File ID ลงคอลัมน์ Profile_Image
 * รับ base64 (ไม่รวม data: prefix) + Personnel_ID หรือ User_ID
 */
function uploadProfileImage_(e) {
  ensureHeaders_('Users', USER_HEADERS);
  const data = e && e.parameter ? e.parameter : (e && e.postData ? JSON.parse(e.postData.contents) : e);
  const base64 = String(data.Image_Base64 || '');
  const pid = String(data.Personnel_ID || '');
  const uid = String(data.User_ID || '');
  if (!base64) return { success: false, message: 'ไม่พบรูปภาพ' };
  if (!pid && !uid) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };

  const users = getData_('Users');
  let target;
  if (pid) target = users.find(function (u) { return String(u.Personnel_ID) === pid; });
  else target = users.find(function (u) { return String(u.User_ID) === uid; });
  if (!target) return { success: false, message: 'ไม่พบบุคลากร' };

  const fullName = String(target.Full_Name || '') || ((target.First_Name || '') + ' ' + (target.Last_Name || '')).trim();
  const fileBase = buildProfileFileName_(fullName, target.Department, uid || pid);
  const uploaded = uploadProfileImageRaw_(base64, fileBase);
  if (uploaded.error) return { success: false, message: 'อัปโหลดรูปโปรไฟล์ล้มเหลว: ' + uploaded.error };
  const fileId = uploaded.id;

  // อัปเดตคอลัมน์ Profile_Image
  const sheet = getSheet_('Users');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0] || [];
  const col = function (n) { return headers.indexOf(n) + 1; };
  const pidCol = col('Personnel_ID');
  const uidCol = col('User_ID');
  const imgCol = col('Profile_Image');
  if (imgCol < 1) return { success: false, message: 'คอลัมน์ Profile_Image ไม่มีในชีท' };

  for (let i = 1; i < rows.length; i++) {
    const matches = pid
      ? (pidCol > 0 && String(rows[i][pidCol - 1]) === pid)
      : (uidCol > 0 && String(rows[i][uidCol - 1]) === uid);
    if (matches) {
      sheet.getRange(i + 1, imgCol).setValue(fileId);
      return {
        success: true,
        Profile_Image: fileId,
        url: 'https://drive.google.com/file/d/' + fileId + '/view'
      };
    }
  }
  return { success: false, message: 'อัปโหลดสำเร็จแต่ไม่พบแถวผู้ใช้ในชีท' };
}

// ===== DATABASE MANAGEMENT (จัดการฐานข้อมูล) =====

/** หัวคอลัมน์ของชีท Points_History (อ้างอิงจากคอลัมน์ที่ระบบอ่านผ่าน path 'points') */
const POINTS_HISTORY_HEADERS = ['Point_ID','User_ID','Points','Source','Reference_ID','Timestamp'];

/** นิยามชีททั้งหมดที่จำเป็นต่อการใช้งานบนเว็บไซต์ + หัวคอลัมน์มาตรฐาน */
const DATABASE_SHEET_DEFS = [
  { name: 'Users', headers: USER_HEADERS },
  { name: 'Steps_Log', headers: STEPS_HEADERS },
  { name: 'Sweet_Free', headers: SWEET_FREE_HEADERS },
  { name: 'Happy_Connect', headers: ['Match_ID','User_1_ID','User_2_ID','Match_Date','Mission_ID','Confirmation_1','Confirmation_2','Mission_Image','Feedback_Score'] },
  { name: 'Voice_Executive', headers: ['Message_ID','User_ID','Category','Content','Is_Anonymous','Timestamp'] },
  { name: 'News', headers: ['News_ID','Title','Content','Image_URL','Created_By','Created_Date','Send_Line_OA'] },
  { name: 'Audit_Log', headers: AUDIT_HEADERS },
  { name: 'Wellness_Assessment', headers: ['Assessment_ID','User_ID','Happiness','Physical_Health','Stress','Assessment_Date','Timestamp'] },
  { name: 'Points_History', headers: POINTS_HISTORY_HEADERS },
  { name: 'Training', headers: ['Training_ID','Title','Description','Date_Thai','Time','Location','Max_Seats','Registered_Count','Status'] },
  { name: 'Training_Registration', headers: ['Reg_ID','Training_ID','User_ID','Status'] },
  { name: 'Weight_After', headers: WEIGHT_AFTER_HEADERS },
  { name: 'Baseline', headers: BASELINE_HEADERS },
  { name: 'Google_Fit_Links', headers: ['User_ID','Gmail','Connected_At'] }
];

/** อ่านบัญชี Admin (Role = Admin) ทั้งหมดจากชีท Users ก่อนล้างฐานข้อมูล */
function readAdminRows_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const roleIdx = headers.indexOf('Role');
  if (roleIdx < 0) return [];
  const admins = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][roleIdx]) === 'Admin') {
      const row = {};
      headers.forEach(function (h, idx) { row[h] = data[i][idx]; });
      admins.push(row);
    }
  }
  return admins;
}

/** สร้างบัญชี Admin เริ่มต้น (pass1234) เมื่อล้างฐานข้อมูลแล้วไม่มี Admin เหลืออยู่ */
function seedDefaultAdmin_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return;
  const headers = sheet.getDataRange().getValues()[0] || [];
  sheet.appendRow(rowFromHeader_(headers, {
    User_ID: '1099900000011',
    Prefix: 'นาย',
    Full_Name: 'สมชาย รักสุขภาพ',
    Nickname: 'สมชาย',
    Position: 'นักจัดการงานทั่วไป',
    Department: 'ฝ่ายทะเบียน',
    Birth_Date: '1985-01-01',
    Gender: 'ชาย',
    Weight_kg: '72',
    Height_cm: '175',
    BMI_Value: '23.5',
    Waist_Inch: '32',
    Role: 'Admin',
    Password: hashPassword_('pass1234'),
    Total_Points: 0,
    Level: 'ต้นแบบลาดพร้าวสร้างสุข',
    Personnel_ID: 'P001',
    Registration_Status: 'Registered',
    Created_By: 'ระบบ',
    Created_Date: getTimestamp_(),
    First_Name: 'สมชาย',
    Last_Name: 'รักสุขภาพ',
    Activities: 'sweet_free,steps,training'
  }));
}

/**
 * รีเซ็ตฐานข้อมูลใหม่ทั้งหมด: ลบชีทเดิมทุกชีท แล้วสร้างชีทที่จำเป็นใหม่พร้อมหัวคอลัมน์
 * เก็บเฉพาะบัญชี Admin เดิมไว้ (ถ้าไม่มี จะสร้าง Admin เริ่มต้น: 1099900000011 / pass1234)
 * วิธีใช้: เปิด Apps Script Editor แล้วรัน resetDatabase()
 */
function resetDatabase() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const admins = readAdminRows_();

  // ── ลบชีทเดิมทั้งหมด (กันลบชีทสุดท้าย — ใช้ชีทที่เหลือเป็น Users ใหม่) ──
  let sheets = ss.getSheets();
  while (sheets.length > 1) {
    ss.deleteSheet(sheets[sheets.length - 1]);
    sheets = ss.getSheets();
  }
  sheets[0].clear();
  sheets[0].setName('Users');

  // ── สร้างชีทที่จำเป็นทั้งหมดใหม่พร้อมหัวคอลัมน์ ──
  DATABASE_SHEET_DEFS.forEach(function (def) {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) sheet = ss.insertSheet(def.name);
    sheet.clear();
    sheet.appendRow(def.headers);
  });

  // ── คืนบัญชี Admin เดิม (หรือสร้าง Admin เริ่มต้นถ้าไม่มี) ──
  const usersSheet = ss.getSheetByName('Users');
  const headers = usersSheet.getDataRange().getValues()[0] || [];
  admins.forEach(function (a) {
    usersSheet.appendRow(rowFromHeader_(headers, a));
  });
  if (admins.length === 0) seedDefaultAdmin_();

  return {
    success: true,
    message: 'สร้างชีทใหม่ ' + DATABASE_SHEET_DEFS.length + ' ชีทสำเร็จ (เก็บ Admin ' + (admins.length || 1) + ' ราย)',
    sheets: DATABASE_SHEET_DEFS.map(function (d) { return d.name; }),
    adminsKept: admins.length || 1
  };
}

/**
 * ลบข้อมูลจำนวนก้าวทั้งหมดในชีท Steps_Log (คงหัวคอลัมน์ไว้)
 * วิธีใช้: เปิด Apps Script Editor แล้วรัน clearStepsLog()
 */
function clearStepsLog() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Steps_Log');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Steps_Log' };
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  // บันทึก Audit Log
  try {
    ensureHeaders_('Audit_Log', AUDIT_HEADERS);
    appendData_('Audit_Log', {
      Audit_ID: generateSequentialId_('Audit_Log', 'AU'),
      Record_ID: 'CLEAR-STEPS-' + getTimestamp_().replace(/[^0-9]/g, '').substring(0, 14),
      Action: 'CLEAR_STEPS_LOG',
      User_ID: '',
      Detail: 'ล้างข้อมูลจำนวนก้าวทั้งหมด (คง header) — ลบ ' + Math.max(0, lastRow - 1) + ' แถว',
      Timestamp: getTimestamp_()
    });
  } catch (e) {}
  return { success: true, message: 'ลบข้อมูลจำนวนก้าวทั้งหมดแล้ว', cleared: Math.max(0, lastRow - 1) };
}

/**
 * ล้างข้อมูลการบันทึกงดหวานทั้งหมดในชีท Sweet_Free (คงหัวคอลัมน์ไว้)
 * วิธีใช้: เปิด Apps Script Editor แล้วรัน clearSweetFreeLog()
 */
function clearSweetFreeLog() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Sweet_Free');
  if (!sheet) return { success: false, message: 'ไม่พบชีท Sweet_Free' };
  const lastRow = sheet.getLastRow();
  const cleared = Math.max(0, lastRow - 1);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  try {
    ensureHeaders_('Audit_Log', AUDIT_HEADERS);
    appendData_('Audit_Log', {
      Audit_ID: generateSequentialId_('Audit_Log', 'AU'),
      Record_ID: 'CLEAR-SWEET-' + getTimestamp_().replace(/[^0-9]/g, '').substring(0, 14),
      Action: 'CLEAR_SWEET_FREE',
      User_ID: '',
      Detail: 'ล้างข้อมูลงดหวานทั้งหมด (คง header) — ลบ ' + cleared + ' แถว',
      Timestamp: getTimestamp_()
    });
  } catch (e) {}
  return { success: true, message: 'ลบข้อมูลงดหวานทั้งหมดแล้ว', cleared: cleared };
}

/**
 * ล้างข้อมูลจำนวนก้าว + งดหวาน พร้อมกันเพื่อเริ่มรอบบันทึกใหม่ (คงหัวคอลัมน์ไว้)
 * - ล้างชีท Steps_Log และ Sweet_Free
 * - คงหัวคอลัมน์ (row 1) และไม่แตะชีทอื่น (Users, Points_History ฯลฯ ยังอยู่ครบ)
 * - บันทึก Audit_Log 1 รายการรวม
 * วิธีใช้: เปิด Apps Script Editor แล้วรัน clearStepsAndSweetFree()
 *          หรือเรียกผ่าน API: action=clear-cycle-data (ต้องเป็น Admin)
 */
function clearStepsAndSweetFree() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const targets = ['Steps_Log', 'Sweet_Free'];
  const result = { stepsCleared: 0, sweetCleared: 0 };
  targets.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    const cleared = Math.max(0, lastRow - 1);
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    if (name === 'Steps_Log') result.stepsCleared = cleared;
    if (name === 'Sweet_Free') result.sweetCleared = cleared;
  });
  try {
    ensureHeaders_('Audit_Log', AUDIT_HEADERS);
    appendData_('Audit_Log', {
      Audit_ID: generateSequentialId_('Audit_Log', 'AU'),
      Record_ID: 'CLEAR-CYCLE-' + getTimestamp_().replace(/[^0-9]/g, '').substring(0, 14),
      Action: 'CLEAR_CYCLE_DATA',
      User_ID: '',
      Detail: 'ล้างข้อมูลเริ่มรอบใหม่: Steps_Log ' + result.stepsCleared + ' แถว, Sweet_Free ' + result.sweetCleared + ' แถว',
      Timestamp: getTimestamp_()
    });
  } catch (e) {}
  return {
    success: true,
    message: 'ล้างข้อมูลจำนวนก้าว (' + result.stepsCleared + ' แถว) และงดหวาน (' + result.sweetCleared + ' แถว) เรียบร้อย — พร้อมเริ่มรอบบันทึกใหม่',
    stepsCleared: result.stepsCleared,
    sweetCleared: result.sweetCleared
  };
}

/**
 * API: ล้างข้อมูลรอบบันทึกใหม่ผ่าน Frontend (เฉพาะ Admin)
 * - ตรวจสิทธิ์ Logged_By ต้องเป็น Admin
 * - รองรับพารามิเตอร์ targets: 'steps' | 'sweet' | 'all' (ดีฟอลต์ 'all')
 * - คืนจำนวนแถวที่ลบ + บันทึก Audit_Log พร้อม User_ID ผู้ดำเนินการ
 */
function clearCycleData_(data) {
  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ (Logged_By)' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. (Admin) เท่านั้นที่ล้างข้อมูลรอบใหม่ได้' };
  }
  const target = String(data.targets || data.target || 'all').toLowerCase();
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let toClear = [];
  if (target === 'steps') toClear = ['Steps_Log'];
  else if (target === 'sweet' || target === 'sweet_free') toClear = ['Sweet_Free'];
  else toClear = ['Steps_Log', 'Sweet_Free'];

  const counts = {};
  toClear.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) { counts[name] = 0; return; }
    const lastRow = sheet.getLastRow();
    const cleared = Math.max(0, lastRow - 1);
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    counts[name] = cleared;
  });

  ensureHeaders_('Audit_Log', AUDIT_HEADERS);
  const rid = 'CLEAR-CYCLE-' + getTimestamp_().replace(/[^0-9]/g, '').substring(0, 14);
  appendData_('Audit_Log', {
    Audit_ID: generateSequentialId_('Audit_Log', 'AU'),
    Record_ID: rid,
    Action: 'CLEAR_CYCLE_DATA',
    User_ID: String(data.Logged_By),
    Detail: 'Admin ' + String(actor.Full_Name || actor.User_ID) + ' ล้าง ' + toClear.join('+') + ' — ' + JSON.stringify(counts),
    Timestamp: getTimestamp_()
  });

  const stepsN = counts['Steps_Log'] || 0;
  const sweetN = counts['Sweet_Free'] || 0;
  let msg = '';
  if (toClear.length === 2) msg = 'ล้างข้อมูลจำนวนก้าว (' + stepsN + ' แถว) และงดหวาน (' + sweetN + ' แถว) เรียบร้อย — พร้อมเริ่มรอบบันทึกใหม่';
  else if (toClear[0] === 'Steps_Log') msg = 'ล้างข้อมูลจำนวนก้าว ' + stepsN + ' แถวเรียบร้อย';
  else msg = 'ล้างข้อมูลงดหวาน ' + sweetN + ' แถวเรียบร้อย';

  return { success: true, message: msg, cleared: counts, targets: toClear };
}

/**
 * ล้างข้อมูลทั้งหมดในทุกชีท (คงหัวคอลัมน์ + บัญชี Admin เดิมไว้)
 * วิธีใช้: เปิด Apps Script Editor แล้วรัน clearAllData()
 */
function clearAllData() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const admins = readAdminRows_();
  const cleared = [];
  DATABASE_SHEET_DEFS.forEach(function (def) {
    const sheet = ss.getSheetByName(def.name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    cleared.push(def.name);
  });
  if (admins.length > 0) {
    const usersSheet = ss.getSheetByName('Users');
    const headers = usersSheet.getDataRange().getValues()[0] || [];
    admins.forEach(function (a) {
      usersSheet.appendRow(rowFromHeader_(headers, a));
    });
  } else {
    seedDefaultAdmin_();
  }
  return {
    success: true,
    message: 'ล้างข้อมูลทั้งหมดในทุกชีทแล้ว (คงโครงสร้าง + Admin ' + (admins.length || 1) + ' ราย)',
    cleared: cleared
  };
}

// ===== EXECUTE SEED (Run this once to populate data) =====

// ===== STEP RECORD MODE MANAGEMENT =====

/**
 * เปลี่ยนโหมดการบันทึกนับก้าวของบุคลากร (1 = บันทึกเอง, 2 = เจ้าหน้าที่ นสส. บันทึกให้)
 * Admin เท่านั้น
 */
function setStepRecordMode_(data) {
  ensureHeaders_('Users', USER_HEADERS);
  
  const actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่เปลี่ยนโหมดบันทึกได้' };
  }
  
  var mode = String(data.Step_Record_Mode || '').trim();
  if (mode !== '1' && mode !== '2') {
    return { success: false, message: 'โหมดบันทึกต้องเป็น 1 หรือ 2 เท่านั้น' };
  }
  
  var sheet = getSheet_('Users');
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0] || [];
  var col = function (name) { return headers.indexOf(name) + 1; };
  var pidCol = col('Personnel_ID');
  
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (pidCol > 0 && String(rows[i][pidCol - 1]) === String(data.Personnel_ID)) {
      rowIndex = i;
      break;
    }
  }
  // fallback: หากไม่พบด้วย Personnel_ID ให้ลองหาด้วย User_ID (กรณีบุคลากรลงทะเบียนแล้ว)
  if (rowIndex < 1 && data.User_ID) {
    var uidCol = col('User_ID');
    for (var i2 = 1; i2 < rows.length; i2++) {
      if (uidCol > 0 && String(rows[i2][uidCol - 1]) === String(data.User_ID)) {
        rowIndex = i2;
        break;
      }
    }
  }
  if (rowIndex < 1) return { success: false, message: 'ไม่พบบุคลากร (Personnel_ID=' + String(data.Personnel_ID||'') + ', User_ID=' + String(data.User_ID||'') + ')' };
  
  var modeCol = col('Step_Record_Mode');
  if (modeCol < 1) {
    ensureHeaders_('Users', USER_HEADERS);
    // รีโหลด headers หลังเพิ่มคอลัมน์
    rows = sheet.getDataRange().getValues();
    headers = rows[0] || [];
    col = function (name) { return headers.indexOf(name) + 1; };
    modeCol = col('Step_Record_Mode');
    pidCol = col('Personnel_ID');
  }
  if (modeCol > 0) {
    sheet.getRange(rowIndex + 1, modeCol).setValue(mode);
  } else {
    return { success: false, message: 'เพิ่มคอลัมน์ Step_Record_Mode ไม่สำเร็จ กรุณาตรวจสอบชีท Users' };
  }
  
  var modeLabel = mode === '1' ? 'บันทึกเอง' : 'เจ้าหน้าที่ นสส. บันทึกให้';
  return { success: true, message: 'เปลี่ยนโหมดบันทึกเป็น "' + modeLabel + '" สำเร็จ', Step_Record_Mode: mode };
}

/**
 * เจ้าหน้าที่ นสส. บันทึกนับก้าวแบบกลุ่ม (Batch) — ให้ Mode 2 โดยเฉพาะ
 * บันทึกทันทีเป็น Approved (ไม่ต้องรออนุมัติ)
 * ป้องกันการบันทึกซ้ำ: ถ้าวันนั้นมี Approved แล้ว จะข้ามไป (ไม่เขียนทับ)
 */
function addBatchSteps_(data) {
  ensureHeaders_('Steps_Log', STEPS_HEADERS);
  
  // 1. ตรวจสิทธิ์: ต้องเป็น Admin
  var actor = getData_('Users').find(function (u) {
    return String(u.User_ID) === String(data.Logged_By);
  });
  if (!actor) return { success: false, message: 'ไม่พบผู้ดำเนินการ' };
  if (String(actor.Role) !== 'Admin') {
    return { success: false, message: 'เฉพาะเจ้าหน้าที่ นสส. เท่านั้นที่บันทึกแบบกลุ่มได้' };
  }
  
  var weekStart = String(data.Week_Start || '').trim();
  if (!weekStart) return { success: false, message: 'กรุณาระบุวันที่เริ่มต้นสัปดาห์ (จันทร์)' };
  
  var allowOverwrite = String(data.Allow_Overwrite || data.allowOverwrite || data.AllowOverwrite || '') === '1' || String(data.Allow_Overwrite || '').toLowerCase() === 'true' || data.Allow_Overwrite === true;

  var stepsList = data.Steps;
  if (!stepsList || !stepsList.length) {
    return { success: false, message: 'ไม่มีข้อมูลที่ต้องบันทึก' };
  }
  
  // 2. โหลด users เพื่อตรวจ Mode
  var users = getData_('Users');
  
  // 3. โหลด Steps_Log ที่มีอยู่แล้วในสัปดาห์นี้ (สำหรับตรวจซ้ำ)
  var allSteps = getData_('Steps_Log');
  var existingApproved = {};
  for (var j = 0; j < allSteps.length; j++) {
    var s = allSteps[j];
    if (String(s.Status) === 'Approved') {
      var dateKey = normalizeDateKey_(s.Date_Thai);
      var userKey = String(s.User_ID);
      if (!existingApproved[userKey]) existingApproved[userKey] = {};
      existingApproved[userKey][dateKey] = s;
    }
  }
  
  var saved = 0;
  var skipped = 0;
  var errors = 0;
  var details = [];
  
  for (var i = 0; i < stepsList.length; i++) {
    var item = stepsList[i];
    var userId = String(item.User_ID || '').trim();
    var dayStr = String(item.Day || '').trim();
    var stepsCount = Number(item.Steps_Count) || 0;
    
    // ตรวจ user — รองรับทั้ง User_ID (ลงทะเบียนแล้ว) และ Personnel_ID (รอลงทะเบียน)
    var targetUser = users.find(function (u) { return String(u.User_ID) === userId || String(u.Personnel_ID) === userId; });
    if (!targetUser) {
      details.push({ User_ID: userId, Day: dayStr, status: 'error', message: 'ไม่พบผู้ใช้' });
      errors++;
      continue;
    }
    
    // ตรวจ Mode — บันทึกได้เฉพาะ Mode 2 (ยกเว้น Pending ที่ยังไม่มี User_ID ให้บันทึกได้เลย)
    var isPending = !String(targetUser.User_ID || '').trim();
    var recordMode = String(targetUser.Step_Record_Mode || '1').trim();
    if (!isPending && recordMode !== '2') {
      details.push({ User_ID: userId, Day: dayStr, status: 'error', message: 'บุคลากรอยู่ใน Mode บันทึกเอง (Mode 1)' });
      errors++;
      continue;
    }
    
    // ตรวจซ้ำ — ถ้าวันนั้นมี Approved แล้ว → ข้าม หรือแทนที่ถ้า allowOverwrite
    var dayKey = normalizeDateKey_(dayStr);
    var existingForDay = existingApproved[userId] ? existingApproved[userId][dayKey] : null;
    if (existingForDay) {
      if (!allowOverwrite) {
        details.push({ User_ID: userId, Day: dayStr, status: 'skipped', message: 'วันนี้มีข้อมูล Approved แล้ว' });
        skipped++;
        continue;
      }
      // allowOverwrite = true → อัปเดตรายการเดิมแทนการข้าม
    }
    
    // ตรวจจำนวนก้าว
    if (stepsCount <= 0) {
      details.push({ User_ID: userId, Day: dayStr, status: 'error', message: 'จำนวนก้าวต้องมากกว่า 0' });
      errors++;
      continue;
    }
    
    // อัปโหลดรูปภาพ
    var imageDriveId = '';
    if (item.Image_Base64) {
      var uploaded = uploadProofImage_(item.Image_Base64, userId, targetUser.Full_Name || '');
      if (uploaded && uploaded.error) {
        details.push({ User_ID: userId, Day: dayStr, status: 'error', message: 'อัปโหลดรูปไม่สำเร็จ: ' + uploaded.error });
        errors++;
        continue;
      }
      if (uploaded && uploaded.id) imageDriveId = uploaded.id;
    }
    
    // บันทึกลง Steps_Log — ถ้า allowOverwrite และมีรายการเดิม ให้อัปเดตแทน append
    if (existingForDay && allowOverwrite) {
      // หาแถวในชีทแล้วอัปเดต
      var sheet = getSheet_('Steps_Log');
      var rows = sheet.getDataRange().getValues();
      var headers = rows[0] || [];
      var col = function(name){ return headers.indexOf(name)+1; };
      var uidCol = col('User_ID');
      var dateCol = col('Date_Thai');
      var statusCol = col('Status');
      var targetRow = -1;
      for (var r = 1; r < rows.length; r++) {
        if (String(rows[r][uidCol-1])===String(userId) && normalizeDateKey_(rows[r][dateCol-1])===dayKey && String(rows[r][statusCol-1])==='Approved') {
          targetRow = r;
          // เลือกแถวล่าสุดถ้ามีซ้ำ
        }
      }
      if (targetRow > 0) {
        var set = function(name, value){ var c=col(name); if(c>0) sheet.getRange(targetRow+1, c).setValue(value); };
        var incomingStatus2 = String(item.Status || '').trim();
        var finalStatus2 = (incomingStatus2 === 'Approved' || incomingStatus2 === 'Pending' || incomingStatus2 === 'Rejected') ? incomingStatus2 : (String(item.Alert_Flag || 'FALSE') === 'TRUE' ? 'Pending' : 'Approved');
        set('Steps_Count', stepsCount);
        if (imageDriveId) set('Image_Drive_ID', imageDriveId);
        set('AI_Steps', (item.AI_Steps !== undefined && item.AI_Steps !== null && item.AI_Steps !== '') ? item.AI_Steps : '');
        set('AI_Confidence', (item.AI_Confidence !== undefined && item.AI_Confidence !== null && item.AI_Confidence !== '') ? item.AI_Confidence : '');
        set('Date_Match', item.Date_Match || '');
        set('Alert_Flag', item.Alert_Flag || 'FALSE');
        set('Alert_Reason', item.Alert_Reason || '');
        set('Status', finalStatus2);
        set('Auditor_ID', String(data.Logged_By));
        set('Recorded_At', getTimestamp_());
        if (item.Notes) set('Notes', item.Notes);
        saved++;
        details.push({ User_ID: userId, Day: dayStr, status: 'updated', Steps_Count: stepsCount });
        // อัปเดต cache ในรอบเดียวกันกันซ้ำอีก
        if (!existingApproved[userId]) existingApproved[userId]={};
        existingApproved[userId][dayKey] = { Status:'Approved', Date_Thai: dayStr, User_ID: userId, Steps_Count: stepsCount };
        continue;
      }
    }
    // Server-only AI: ถ้า Next.js ส่ง Status มา (Approved/Pending) ให้ใช้ตามนั้น ไม่เช่นนั้นดูจาก Alert_Flag
    var incomingStatus = String(item.Status || '').trim();
    var finalStatus = (incomingStatus === 'Approved' || incomingStatus === 'Pending' || incomingStatus === 'Rejected') ? incomingStatus : (String(item.Alert_Flag || 'FALSE') === 'TRUE' ? 'Pending' : 'Approved');
    appendData_('Steps_Log', {
      Record_ID: generateSequentialId_('Steps_Log', 'ST'),
      User_ID: userId,
      Date_Thai: dayStr,
      Steps_Count: stepsCount,
      Record_Method: 'เจ้าหน้าที่ นสส. (บันทึกให้)',
      Image_Drive_ID: imageDriveId,
      AI_Steps: (item.AI_Steps !== undefined && item.AI_Steps !== null && item.AI_Steps !== '') ? item.AI_Steps : '',
      AI_Confidence: (item.AI_Confidence !== undefined && item.AI_Confidence !== null && item.AI_Confidence !== '') ? item.AI_Confidence : '',
      Date_Match: item.Date_Match || '',
      Alert_Flag: item.Alert_Flag || 'FALSE',
      Alert_Reason: item.Alert_Reason || '',
      Status: finalStatus,
      Week_Number: getWeekNumber_(),
      Auditor_ID: String(data.Logged_By),
      Recorded_At: getTimestamp_(),
      Notes: item.Notes || ''
    });
    
    saved++;
    details.push({ User_ID: userId, Day: dayStr, status: 'saved', Steps_Count: stepsCount });
  }
  
  // Audit Log
  ensureHeaders_('Audit_Log', AUDIT_HEADERS);
  appendData_('Audit_Log', {
    Audit_ID: generateSequentialId_('Audit_Log', 'AU'),
    Record_ID: 'BATCH-' + getTimestamp_().replace(/[^0-9]/g, '').substring(0, 14),
    Action: 'BATCH_STEP_SAVE',
    User_ID: String(data.Logged_By),
    Detail: 'Batch save: ' + saved + ' saved, ' + skipped + ' skipped, ' + errors + ' errors',
    Timestamp: getTimestamp_()
  });
  
  return {
    success: true,
    message: 'บันทึกสำเร็จ ' + saved + ' รายการ' + (skipped > 0 ? ', ข้าม ' + skipped + ' รายการ (วันซ้ำ)' : '') + (errors > 0 ? ', ผิดพลาด ' + errors + ' รายการ' : ''),
    saved: saved,
    skipped: skipped,
    errors: errors,
    details: details
  };
}

/** แปลง Date_Thai เป็น key YYYY-MM-DD (local) */
function normalizeDateKey_(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return s;
}
