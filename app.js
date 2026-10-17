/**
 * ระบบนิเทศภายใน โรงเรียนบ้านสันดาบ สพป.สมุทรสาคร
 * Application Logic & Google Services Connector
 * โทนสีชมพู - รองรับการประเมิน 4 ครั้ง และการใช้งานบนมือถือ
 */

// Configuration IDs
const CONFIG = {
  centralSheetId: '1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA',
  supervisionSheetId: '1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E',
  driveFolderId: '1BF30rLUzeTA4CYNkbZq8DnyuWfiwumCH',
  webAppUrlKey: 'bansandab_supervision_webapp_url',
  defaultWebAppUrl: 'https://script.google.com/macros/s/AKfycbwh3nEjhvnFeHqLPznuO2BAUopOU4O1HgGYDxFEbe9jBa7ZuT2FOOGw-V9S1K-trM8o/exec',
  historyStorageKey: 'bansandab_supervision_history'
};

// 4 Evaluation Rounds Configuration
const ROUNDS_CONFIG = {
  1: {
    num: 1,
    thaiNum: '1',
    name: 'ตนเอง',
    fullName: 'ครั้งที่ 1: ตนเอง',
    title: 'การประเมินตนเองโดยครูผู้สอน',
    desc: 'ระบบจะระบุผู้ประเมินเป็นตนเองและตั้งค่าลายมือชื่อให้อัตโนมัติ',
    defaultObserverType: 'self',
    defaultObserverName: 'ตนเอง',
    defaultPosition: 'ครู โรงเรียนบ้านสันดาบ',
    supervisorName: 'ตนเอง'
  },
  2: {
    num: 2,
    thaiNum: '2',
    name: 'เพื่อนครู',
    fullName: 'ครั้งที่ 2: เพื่อนครู',
    title: 'การประเมินโดยเพื่อนครูร่วมสังเกตชั้นเรียน',
    desc: 'ระบุชื่อเพื่อนครูผู้ทำหน้าที่สังเกตการสอนและประเมินชั้นเรียน',
    defaultObserverType: 'other',
    defaultObserverName: '',
    defaultPosition: 'ครู โรงเรียนบ้านสันดาบ',
    supervisorName: ''
  },
  3: {
    num: 3,
    thaiNum: '3',
    name: 'หัวหน้างาน',
    fullName: 'ครั้งที่ 3: หัวหน้างาน',
    title: 'การประเมินโดยหัวหน้ากลุ่มสาระการเรียนรู้ / หัวหน้าฝ่ายวิชาการ',
    desc: 'หัวหน้างานวิชาการหรือหัวหน้ากลุ่มสาระฯ เป็นผู้สังเกตและประเมิน',
    defaultObserverType: 'other',
    defaultObserverName: 'หัวหน้างานวิชาการ / หัวหน้ากลุ่มสาระฯ',
    defaultPosition: 'หัวหน้างานวิชาการ / หัวหน้ากลุ่มสาระ',
    supervisorName: 'หัวหน้างานวิชาการ / หัวหน้ากลุ่มสาระฯ'
  },
  4: {
    num: 4,
    thaiNum: '4',
    name: 'ผู้อำนวยการ',
    fullName: 'ครั้งที่ 4: ผู้อำนวยการ',
    title: 'การประเมินโดยผู้อำนวยการสถานศึกษา',
    desc: 'ผู้อำนวยการสถานศึกษาเป็นผู้นิเทศและประเมินผล',
    defaultObserverType: 'other',
    defaultObserverName: 'นายกฤษฎา ผลพล',
    defaultPosition: 'ผู้อำนวยการสถานศึกษา',
    supervisorName: 'นายกฤษฎา ผลพล'
  }
};

let currentRound = 1;
let currentForm = 'form1';
let editingRecordId = null; // ID ของข้อมูลที่กำลังแก้ไขอยู่ (ถ้าเป็น null คือการบันทึกรายการใหม่)

let isSavingRecord = false;

/**
 * Save Current Active Form (มีระบบ Debounce และ Lock ปุ่ม ป้องกันการบันทึกซ้ำซ้อน)
 */
async function saveCurrentRecord() {
  if (isSavingRecord) {
    console.warn('ระบบกำลังบันทึกข้อมูลอยู่ กรุณารอสักครู่...');
    return;
  }
  const btnSave = document.getElementById('btn-save-main');
  isSavingRecord = true;
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.setAttribute('disabled', 'disabled');
    btnSave.innerHTML = '⏳ กำลังบันทึกข้อมูล...';
  }

  try {
    if (currentForm === 'form2') {
      await saveRecordForm2();
    } else {
      await saveRecordForm1();
    }
  } catch (err) {
    console.error('Error during saveCurrentRecord:', err);
    showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (err.message || err), 'error');
  } finally {
    isSavingRecord = false;
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.removeAttribute('disabled');
      btnSave.innerHTML = '💾 บันทึกข้อมูล';
    }
  }
}

/**
 * ดาวน์โหลดเอกสารเป็นไฟล์ .PDF โดยจัดระเบียบหน้า A4 และรูปแบบ TH SarabunPSK สวยงาม
 */
function downloadCurrentPDF() {
  syncAllPrintValues();

  const cfg = ROUNDS_CONFIG[currentRound];
  const isF2 = (currentForm === 'form2');
  const formName = isF2 ? 'แบบประเมินตนเอง_นิเทศ' : 'แบบนิเทศสังเกตชั้นเรียน';
  const teacherName = (isF2 
    ? (document.getElementById('f2-teacher-name').value || '')
    : (document.getElementById('f1-teacher-name').value || '')) || 'ครูผู้สอน';
  const safeTeacher = teacherName.replace(/\s+/g, '_');
  const year = (isF2 ? document.getElementById('f2-year').value : document.getElementById('f1-year').value) || '2569';
  const filename = `${formName}_ครั้งที่${currentRound}_${safeTeacher}_ปีการศึกษา${year}`;

  const originalTitle = document.title;
  document.title = filename;

  showToast('📄 กำลังเปิดหน้าต่างพิมพ์... ในช่องปลายทาง (Destination) ให้เลือก "บันทึกเป็น PDF" (Save as PDF)', 'info');

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  }, 300);
}

/**
 * Modal Dialog Controller: กล่องข้อความแจ้งเตือนกลางจอเมื่อกดบันทึกข้อมูล และรีเฟรชหน้าต่างใหม่
/**
 * ฟอร์แมตเวลาปัจจุบันให้อยู่ในรูปแบบ พ.ศ. (ไทย) อย่างแน่นอน (dd/MM/yyyy HH:mm:ss)
 */
function getFormattedCurrentTimestamp() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear() < 2500 ? (now.getFullYear() + 543) : now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}

/**
 * ปรับฟอร์แมต timestamp ให้เป็นปี พ.ศ. สม่ำเสมอ
 */
function formatThaiTimestampDisplay(ts) {
  if (!ts) return '';
  let str = String(ts).trim();
  // แปลง ค.ศ. (2020-2099) เป็น พ.ศ. (+543)
  return str.replace(/\b(20\d\d)\b/g, (match, yr) => String(Number(yr) + 543));
}

/**
 * ตรวจสอบความซ้ำซ้อนของการประเมิน (เพื่อป้องกันการสร้างประวัติซ้ำเกินจริงจากการดึงหลายแหล่ง)
 * ในระบบนิเทศโรงเรียนบ้านสันดาบ ครู 1 ท่าน จะมีผลการประเมิน 1 รายการ ต่อรอบ (ครั้งที่ 1, 2, 3, 4) ต่อแบบฟอร์ม
 */
function isSameEvaluationRecord(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;

  const teacherA = (a.teacherName || '').trim().replace(/\s+/g, ' ');
  const teacherB = (b.teacherName || '').trim().replace(/\s+/g, ' ');
  if (!teacherA || !teacherB || teacherA !== teacherB) {
    return false;
  }

  const formA = (a.formType || (a.type && a.type.includes('ประเมินตนเอง') ? 'form2' : 'form1')).trim();
  const formB = (b.formType || (b.type && b.type.includes('ประเมินตนเอง') ? 'form2' : 'form1')).trim();
  if (formA !== formB) {
    return false;
  }

  // เทียบรอบการประเมิน (ครั้งที่ 1, 2, 3, 4)
  const roundNumA = String(a.round || a.roundName || a.roundShort || '1').match(/\d+/);
  const roundNumB = String(b.round || b.roundName || b.roundShort || '1').match(/\d+/);
  const rA = roundNumA ? roundNumA[0] : '1';
  const rB = roundNumB ? roundNumB[0] : '1';

  return rA === rB;
}

/**
 * กรองล้างประวัติซ้ำซ้อนออกจากรายการทั้งหมด ให้เหลือรายการจริงเพียง 1 รายการต่อการประเมิน
 */
function deduplicateRecordList(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  list.forEach(rec => {
    if (!rec || !rec.teacherName) return;
    const existingIdx = result.findIndex(ex => isSameEvaluationRecord(ex, rec));
    if (existingIdx === -1) {
      const cloned = { ...rec };
      cloned.timestamp = formatThaiTimestampDisplay(cloned.timestamp);
      result.push(cloned);
    } else {
      const existing = result[existingIdx];
      // ผสานข้อมูลเข้าด้วยกันเพื่อให้ได้รายการที่สมบูรณ์ที่สุด
      if (rec.fileUrl && !existing.fileUrl) existing.fileUrl = rec.fileUrl;
      if (rec.signature && !existing.signature) existing.signature = rec.signature;
      if (rec.signatures && !existing.signatures) existing.signatures = rec.signatures;
      if (rec.teacherSignature && !existing.teacherSignature) existing.teacherSignature = rec.teacherSignature;
      if (rec.supervisorSignature && !existing.supervisorSignature) existing.supervisorSignature = rec.supervisorSignature;
      if (rec.scores && Object.keys(rec.scores).length > 0 && (!existing.scores || Object.keys(existing.scores).length === 0)) {
        existing.scores = rec.scores;
      }
      if (!existing.totalScore && rec.totalScore) existing.totalScore = rec.totalScore;
      if (!existing.quality && rec.quality) existing.quality = rec.quality;
      if (rec.recommendation && !existing.recommendation) existing.recommendation = rec.recommendation;
      // ให้ความสำคัญกับ ID ที่แน่นอน (ไม่ใช้ ID ชั่วคราวของ sheet)
      if (existing.id && existing.id.startsWith('sheet') && rec.id && !rec.id.startsWith('sheet')) {
        existing.id = rec.id;
      }
    }
  });
  return result;
}

/**
 * ล้างข้อมูลในแบบฟอร์มให้สะอาดเพื่อพร้อมสำหรับการประเมินครูท่านต่อไป
 */
function clearFormAfterSave(formType) {
  if (formType === 'form1') {
    for (let i = 1; i <= 24; i++) {
      delete form1Scores[i];
      for (let s = 1; s <= 4; s++) {
        const cell = document.getElementById(`f1-cell-${i}-${s}`);
        if (cell) cell.classList.remove('selected');
      }
    }
    const rec = document.getElementById('f1-recommendation');
    if (rec) rec.value = '';
    calculateForm1();
  } else if (formType === 'form2') {
    for (let i = 1; i <= 14; i++) {
      delete form2Scores[i];
      for (let s = 1; s <= 5; s++) {
        const cell = document.getElementById(`f2-cell-${i}-${s}`);
        if (cell) cell.classList.remove('selected');
      }
    }
    const rec = document.getElementById('f2-recommendation');
    if (rec) rec.value = '';
    calculateForm2();
  }
}

/**
 * Modal Dialog Controller: กล่องข้อความแจ้งเตือนกลางจอเมื่อกดบันทึกข้อมูล "บันทึกข้อมูลเรียบร้อย"
 */
let modalNextActionFn = null;
let modalCountdownTimer = null;

function showCenterSaveSuccessModal(data) {
  const overlay = document.getElementById('save-success-modal-overlay');
  if (!overlay) {
    alert('บันทึกข้อมูลเรียบร้อย');
    if (typeof data.onNext === 'function') data.onNext();
    return;
  }

  const roundEl = document.getElementById('modal-record-round');
  const typeEl = document.getElementById('modal-record-type');
  const teacherEl = document.getElementById('modal-record-teacher');
  const scoreEl = document.getElementById('modal-record-score');
  const titleEl = document.getElementById('modal-success-title');
  const subtitleEl = document.getElementById('modal-success-subtitle');
  const iconEl = document.getElementById('modal-status-icon');

  if (roundEl) roundEl.textContent = data.roundName || '-';
  if (typeEl) typeEl.textContent = data.formTypeTitle || '-';
  if (teacherEl) teacherEl.textContent = data.teacherName || '-';
  if (scoreEl) scoreEl.textContent = data.scoreText || '-';

  if (titleEl) {
    titleEl.textContent = 'บันทึกข้อมูลเรียบร้อย';
  }
  if (subtitleEl) {
    subtitleEl.textContent = data.isEdit ? 'ข้อมูลเดิมได้รับการอัปเดตเรียบร้อยแล้ว' : 'ผลการประเมินได้รับการบันทึกลงฐานข้อมูลเรียบร้อยแล้ว';
  }
  if (iconEl) {
    iconEl.textContent = '✅';
  }

  const sheetStatusEl = document.getElementById('modal-record-sheet-status');
  if (sheetStatusEl) {
    sheetStatusEl.innerHTML = '<span style="color:#059669; font-weight:700;">✅ บันทึกข้อมูลเรียบร้อย</span>';
  }

  modalNextActionFn = data.onNext || (() => {
    switchForm('history');
    loadHistoryFromDatabase(false);
  });

  // แสดงกล่องแจ้งเตือนกลางจอ
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // ล้างตัวจับเวลา ไม่รีเฟรชเอง ให้ผู้ใช้กด "ตกลง" ด้วยตนเองอย่างชัดเจน
  if (modalCountdownTimer) {
    clearTimeout(modalCountdownTimer);
    modalCountdownTimer = null;
  }
}

function executeModalNextAction() {
  if (modalCountdownTimer) {
    clearTimeout(modalCountdownTimer);
    modalCountdownTimer = null;
  }
  closeSaveSuccessModal();
  if (typeof modalNextActionFn === 'function') {
    const fn = modalNextActionFn;
    modalNextActionFn = null;
    fn();
  } else {
    switchForm('history');
    loadHistoryFromDatabase(false);
  }
}

function closeSaveSuccessModal() {
  if (modalCountdownTimer) {
    clearTimeout(modalCountdownTimer);
    modalCountdownTimer = null;
  }
  const overlay = document.getElementById('save-success-modal-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  document.body.style.overflow = '';
}

function handleModalOverlayClick(event) {
  if (event.target.id === 'save-success-modal-overlay') {
    executeModalNextAction();
  }
}


// Form 1: แบบนิเทศสังเกตชั้นเรียน (24 รายการ ใน 5 ด้าน)
const FORM1_CATEGORIES = [
  {
    name: 'ด้านผู้สอน',
    items: [
      { id: 1, text: 'แนะแนวการสอน การวัดและประเมินผลแก่ผู้เรียน' },
      { id: 2, text: 'ความรู้ความสามารถของครูผู้สอน' },
      { id: 3, text: 'ความมีคุณธรรม จริยธรรมของผู้สอน' },
      { id: 4, text: 'บุคลิกภาพโดยรวมของครูผู้สอน' },
      { id: 5, text: 'การเตรียมความพร้อม เตรียมการสอน และความตรงต่อเวลา' },
      { id: 6, text: 'ความสามารถในการจัดการชั้นเรียน และแก้ไขปัญหาในชั้นเรียน' }
    ]
  },
  {
    name: 'ด้านเนื้อหา',
    items: [
      { id: 7, text: 'เนื้อหาที่สอนมีความน่าสนใจ ทันสมัย' },
      { id: 8, text: 'เนื้อหาครอบคลุมและสอดคล้องกับตัวชี้วัด' },
      { id: 9, text: 'เนื้อหามีความเหมาะสมกับระดับความรู้ ความสามารถของผู้เรียน' }
    ]
  },
  {
    name: 'ด้านกิจกรรมการเรียนการสอน',
    items: [
      { id: 10, text: 'ดำเนินการสอนอย่างเป็นลำดับตามขั้นตอนของการจัดการเรียนรู้' },
      { id: 11, text: 'จัดกิจกรรมการเรียนการสอนด้วยวิธีการที่หลากหลาย' },
      { id: 12, text: 'จัดกิจกรรมให้ผู้เรียนได้ฝึกค้นคว้า รวบรวมข้อมูล คิดวิเคราะห์ สังเคราะห์' },
      { id: 13, text: 'จัดกิจกรรมให้ผู้เรียนสร้างองค์ความรู้ได้ด้วยตนเอง' },
      { id: 14, text: 'จัดบรรยากาศการเรียนรู้ที่ดึงดูดความสนใจก่อให้เกิดความสุขแก่ผู้เรียน' },
      { id: 15, text: 'จัดกิจกรรมให้ผู้เรียนสามารถพัฒนาสมรรถนะสำคัญ และคุณลักษณะอันพึงประสงค์' },
      { id: 16, text: 'ผู้เรียนมีความกระตือรือร้นและสนุกสนานในการเรียน' }
    ]
  },
  {
    name: 'ด้านสื่อและสิ่งสนับสนุนการเรียนการสอน',
    items: [
      { id: 17, text: 'มีเอกสารและสื่อประกอบในการจัดการเรียนรู้ที่หลากหลาย' },
      { id: 18, text: 'สื่อที่ใช้สามารถเชื่อมโยงกับเนื้อหาที่สอนให้นักเรียนเกิดการเรียนรู้ได้ดีขึ้น' },
      { id: 19, text: 'มีการนำเทคโนโลยีสมัยใหม่เข้ามาใช้ในการเรียนการสอน' }
    ]
  },
  {
    name: 'ด้านการวัดและประเมินผลการเรียน',
    items: [
      { id: 20, text: 'มีวิธีการประเมินผลตามสภาพจริง' },
      { id: 21, text: 'มีวิธีการประเมินผลที่หลากหลาย' },
      { id: 22, text: 'มีการประเมินผลที่สอดคล้องกับมาตรฐานการเรียนรู้/ตัวชี้วัด/กิจกรรมการเรียนรู้' },
      { id: 23, text: 'ผู้เรียนมีส่วนร่วมในการประเมินผล' },
      { id: 24, text: 'เกณฑ์การประเมินชิ้นงาน/ภาระงานที่เหมาะสม' }
    ]
  }
];

// Form 2: แบบประเมินตนเอง นิเทศ / การนิเทศชั้นเรียน (14 รายการ)
const FORM2_ITEMS = [
  { id: 1, text: 'มีสัญลักษณ์ ชาติ ศาสนา พระมหากษัตริย์' },
  { id: 2, text: 'มีป้ายชั้นเรียน ป้ายชื่อครูประจำชั้น' },
  { id: 3, text: 'การจัดโต๊ะทำงานของครู นักเรียน เป็นระเบียบเรียบร้อย' },
  { id: 4, text: 'มีป้ายสถิติผลสัมฤทธิ์ทางการเรียน' },
  { id: 5, text: 'มีรายชื่อสมาชิกในห้องเรียน' },
  { id: 6, text: 'มีป้ายชื่อเวรประจำวัน' },
  { id: 7, text: 'มีป้ายข้อตกลงของห้องเรียน' },
  { id: 8, text: 'มีมุมเสริมประสบการณ์' },
  { id: 9, text: 'มีตารางสอน/ ตารางเรียนประจำห้องเรียน' },
  { id: 10, text: 'มีการจัดป้ายนิเทศตามกลุ่มสาระการเรียนรู้ในห้องเรียน และป้ายนิเทศหน้าชั้นเรียน' },
  { id: 11, text: 'มีเอกสารคู่มือครูเพื่อใช้ประกอบการจัดการเรียนรู้' },
  { id: 12, text: 'จัดเก็บผลงานนักเรียนเป็นระบบระเบียบ' },
  { id: 13, text: 'การจัดบรรยากาศในห้องเรียน การตกแต่งห้องเรียนที่เอื้อต่อการเรียนรู้ของนักเรียน' },
  { id: 14, text: 'ห้องเรียนสะอาดเป็นระเบียบเรียบร้อย' }
];

// Teachers list from Central DB
let teachersData = [
  { name: 'นางสาวทิพย์สุคนธ์ อ่องเมือง', grade: 'อ.1-อ.2', role: 'ครู (ฝ่ายงบประมาณ)' },
  { name: 'นางสาวธารณี สินศุข', grade: 'อ.3', role: 'ครู (ฝ่ายบริหารงานทั่วไป)' },
  { name: 'นางสาวสุวรรณี นิลประดับ', grade: 'ป.1', role: 'ครู (ฝ่ายงบประมาณ)' },
  { name: 'นางสาวนิศารัตน์ ฉิมขันธ์', grade: 'ป.2', role: 'ครู (หัวหน้างานฝ่ายบริหารทั่วไป)' },
  { name: 'นางสาวชลลดา ซ่อนกลิ่น', grade: 'ป.3', role: 'ครูผู้ช่วย (ฝ่ายวิชาการ)' },
  { name: 'นางสาววรัญญา พิศแสนสุวรรณ', grade: 'ป.4', role: 'ครู (ฝ่ายงบประมาณ)' },
  { name: 'สุจิตตรา ปางสุข', grade: 'ป.5', role: 'ครู (หัวหน้างานฝ่ายวิชาการ)' },
  { name: 'นายณัฏฐ์ ไตรพุทธมาศ', grade: 'ป.6', role: 'ครู (หัวหน้างานฝ่ายบุคคล)' },
  { name: 'นายสุโลธร ธนาวิชิตฤกษ์', grade: '', role: 'ครู ชำนาญการ (หัวหน้างานฝ่ายงบประมาณ)' },
  { name: 'นายธนโชค ขุนพิลึก', grade: '', role: 'ครูผู้ช่วย (ฝ่ายบริหารงานทั่วไป)' },
  { name: 'นายพิศณุ เพียสีนุ้ย', grade: '', role: 'ครูอัตราจ้าง (ฝ่ายบริหารงานทั่วไป)' },
  { name: 'นายคเณศ ชุนสิทธิ์', grade: '', role: 'ครูอัตราจ้าง (ฝ่ายบริหารงานทั่วไป)' },
  { name: 'นายกฤษฎา ผลพล', grade: '', role: 'ผู้อำนวยการสถานศึกษา' }
];

let studentsData = [];

// Form States
const form1Scores = {};
const form2Scores = {};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Set default dates
  const today = new Date().toISOString().split('T')[0];
  const f1Date = document.getElementById('f1-date');
  if (f1Date) f1Date.value = today;
  const f2Date = document.getElementById('f2-date');
  if (f2Date) f2Date.value = today;
  
  // Set default time for Form 2
  const now = new Date();
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const f2Time = document.getElementById('f2-time');
  if (f2Time) f2Time.value = timeStr;

  // Render evaluation tables
  renderForm1Table();
  renderForm2Table();

  // Populate teacher dropdowns
  populateTeacherDropdowns();

  // Default numeral mode: Hindu-Arabic
  setNumeralMode('arabic', true);

  // Default: ครั้งที่ 1 ตนเอง + แบบสังเกตชั้นเรียน
  selectRoundAndForm(1, 'form1');

  // Load Central Data
  loadCentralData(false);

  // Load history records from Database (Google Sheets + Server DB + Storage)
  loadHistoryFromDatabase(false);

  // ล้างลายเซ็นและแคชเก่าทุกครั้งที่เปิด/รีเฟรชหน้า เพื่อให้แบบฟอร์มใหม่ว่างเปล่าเสมอ
  clearAllSignaturesFromForm(true);

  // Load and update saved Web App URL and UI status
  updateSettingsUI();
});

let allRoundsExpanded = false;

/**
 * ย่อหรือขยายรอบการประเมินแต่ละรอบ (ปุ่มครั้งที่และปุ่มย่อยย่อขยายได้)
 */
function toggleRoundBlock(roundNum) {
  const block = document.getElementById(`round-block-${roundNum}`);
  if (!block) return;

  const isCollapsed = block.classList.contains('collapsed');
  const isActive = block.classList.contains('active');

  if (isActive) {
    if (isCollapsed) {
      block.classList.remove('collapsed');
      block.classList.add('expanded');
    } else {
      block.classList.remove('expanded');
      block.classList.add('collapsed');
    }
  } else {
    // ถ้าคลิกรอบอื่น ให้เลือกและเปิดขยายรอบนั้นทันที
    selectRoundAndForm(roundNum, currentForm || 'form1');
  }
}

/**
 * ย่อหรือขยายรอบการประเมินทั้งหมดพร้อมกัน
 */
function toggleAllRounds() {
  allRoundsExpanded = !allRoundsExpanded;
  for (let r = 1; r <= 4; r++) {
    const block = document.getElementById(`round-block-${r}`);
    if (block) {
      if (allRoundsExpanded) {
        block.classList.remove('collapsed');
        block.classList.add('expanded');
      } else {
        block.classList.remove('expanded');
        block.classList.add('collapsed');
      }
    }
  }
  const btn = document.getElementById('btn-toggle-rounds');
  if (btn) {
    btn.textContent = allRoundsExpanded ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด';
  }
}

/**
 * คลิกปุ่มหลักแต่ละครั้งทางด้านซ้าย (Backward compatibility)
 */
function handleRoundMainClick(roundNum) {
  toggleRoundBlock(roundNum);
}

/**
 * เลือกรอบการประเมิน (ปุ่มหลัก) และแบบประเมิน (ปุ่มย่อย) ทางด้านซ้าย
 * @param {number} roundNum - 1: ตนเอง, 2: เพื่อนครู, 3: หัวหน้างาน, 4: ผู้อำนวยการ
 * @param {string} formId - 'form1' (แบบสังเกตชั้นเรียน) หรือ 'form2' (แบบประเมินตนเอง)
 */
function selectRoundAndForm(roundNum, formId) {
  currentRound = roundNum;
  currentForm = (formId === 'form2') ? 'form2' : 'form1';
  const cfg = ROUNDS_CONFIG[roundNum];

  // 1. อัปเดตสถานะปุ่มหลักทางด้านซ้าย (Active block & ขยายปุ่มย่อย)
  for (let r = 1; r <= 4; r++) {
    const block = document.getElementById(`round-block-${r}`);
    if (block) {
      if (r === roundNum) {
        block.classList.add('active');
        block.classList.remove('collapsed');
        block.classList.add('expanded');
      } else {
        block.classList.remove('active');
        if (!allRoundsExpanded) {
          block.classList.remove('expanded');
        }
      }
    }
  }

  // 2. อัปเดตสถานะปุ่มย่อย (Active sub-btn)
  document.querySelectorAll('.sidebar-sub-btn').forEach(btn => btn.classList.remove('active'));
  const activeSubBtn = document.getElementById(`sub-btn-${roundNum}-${currentForm}`);
  if (activeSubBtn) {
    activeSubBtn.classList.add('active');
  }

  // เคลียร์ active จากปุ่มเมนูด้านล่าง (ประวัติ / ทะเบียน)
  const sideHistory = document.getElementById('side-link-history');
  if (sideHistory) sideHistory.classList.remove('active');
  const sideDir = document.getElementById('side-link-directory');
  if (sideDir) sideDir.classList.remove('active');

  // 3. สลับการแสดงผลแบบประเมินทางด้านขวา
  document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`view-${currentForm}`);
  if (targetView) {
    targetView.classList.add('active');
  }

  // 4. อัปเดตแถบสถานะ (Breadcrumb) บน Action Bar ด้านขวา
  const formTitle = currentForm === 'form1' ? 'แบบสังเกตชั้นเรียน (24 ข้อ)' : 'แบบประเมินตนเอง (14 ข้อ)';
  const breadcrumb = document.getElementById('current-breadcrumb');
  if (breadcrumb) {
    breadcrumb.innerHTML = `🎯 <strong>${cfg.fullName}</strong> &gt; ${formTitle}`;
  }

  // 5. อัปเดตแท็กบนหัวเอกสารราชการสำหรับพิมพ์ A4 / ดูตัวอย่าง
  const f1PrintTag = document.getElementById('f1-print-round-tag');
  if (f1PrintTag) {
    f1PrintTag.textContent = `การประเมินครั้งที่ ${cfg.thaiNum} (${cfg.name})`;
  }
  const f2PrintTag = document.getElementById('f2-print-round-tag');
  if (f2PrintTag) {
    f2PrintTag.textContent = `การประเมินครั้งที่ ${cfg.thaiNum} (${cfg.name})`;
  }

  // 6. ตั้งค่าผู้ประเมินและผู้สังเกตตามรอบที่เลือก (Presets)
  applyRoundPresets(cfg);

  // 7. คำนวณคะแนนแสดงผลทันที
  if (currentForm === 'form1') {
    calculateForm1();
  } else {
    calculateForm2();
  }

  // แจ้งเตือน Toast นุ่มนวล
  const formNameShort = currentForm === 'form1' ? 'แบบสังเกตชั้นเรียน' : 'แบบประเมินตนเอง';
  showToast(`เลือก: ${cfg.fullName} > ${formNameShort}`, 'info');

  // บนจอมือถือ เลื่อนสายตาไปยังเอกสาร
  if (window.innerWidth <= 768) {
    const mainContent = document.querySelector('.right-content-area');
    if (mainContent) {
      window.scrollTo({ top: mainContent.offsetTop - 65, behavior: 'smooth' });
    }
  }
}

/**
 * Backward compatibility: เลือก 4 ครั้ง
 */
function selectRound(roundNum) {
  const targetForm = (currentForm === 'form1' || currentForm === 'form2') ? currentForm : 'form1';
  selectRoundAndForm(roundNum, targetForm);
}

/**
 * สลับแท็บมุมมอง (Tab View Switcher) รองรับประวัติ และทะเบียนครู/นักเรียน
 */
function switchForm(formId) {
  if (formId === 'form1' || formId === 'form2') {
    selectRoundAndForm(currentRound, formId);
    return;
  }
  if (formId === 'settings') {
    formId = 'history';
  }

  currentForm = formId;

  // ซ่อนทุก view และเปิด view ที่เลือก
  document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`view-${formId}`);
  if (targetView) targetView.classList.add('active');

  // ปรับสถานะปุ่มใน Sidebar ด้านซ้าย
  document.querySelectorAll('.sidebar-sub-btn').forEach(btn => btn.classList.remove('active'));
  const sideHistory = document.getElementById('side-link-history');
  const sideDir = document.getElementById('side-link-directory');
  const sideSettings = document.getElementById('side-link-settings');

  if (formId === 'history') {
    if (sideHistory) sideHistory.classList.add('active');
    if (sideDir) sideDir.classList.remove('active');
    if (sideSettings) sideSettings.classList.remove('active');

    const breadcrumb = document.getElementById('current-breadcrumb');
    if (breadcrumb) {
      breadcrumb.innerHTML = `📋 <strong>ประวัติการนิเทศชั้นเรียน</strong>`;
    }
    loadHistoryFromDatabase(false);
  } else if (formId === 'directory') {
    if (sideHistory) sideHistory.classList.remove('active');
    if (sideDir) sideDir.classList.add('active');
    if (sideSettings) sideSettings.classList.remove('active');

    const breadcrumb = document.getElementById('current-breadcrumb');
    if (breadcrumb) {
      breadcrumb.innerHTML = `👥 <strong>ทะเบียนครูและนักเรียน โรงเรียนบ้านสันดาบ</strong>`;
    }
    renderTeachersDirectory();
    renderStudentsTable();
  } else if (formId === 'settings') {
    if (sideHistory) sideHistory.classList.remove('active');
    if (sideDir) sideDir.classList.remove('active');
    if (sideSettings) sideSettings.classList.add('active');

    const breadcrumb = document.getElementById('current-breadcrumb');
    if (breadcrumb) {
      breadcrumb.innerHTML = `⚙️ <strong>การตั้งค่าเชื่อมต่อ Google Sheets & Google Drive</strong>`;
    }
    updateSettingsUI();
  } else {
    if (sideHistory) sideHistory.classList.remove('active');
    if (sideDir) sideDir.classList.remove('active');
    if (sideSettings) sideSettings.classList.remove('active');
  }

  if (window.innerWidth <= 768) {
    const mainContent = document.querySelector('.right-content-area');
    if (mainContent) {
      window.scrollTo({ top: mainContent.offsetTop - 65, behavior: 'smooth' });
    }
  }
}

/**
 * ตั้งค่าผู้ประเมินและผู้สังเกตตามรอบการประเมิน (Observer / Evaluator Presets)
 * ครั้งที่ 1 ตนเอง, ครั้งที่ 2 เพื่อนครู, ครั้งที่ 3 หัวหน้างาน, ครั้งที่ 4 ผู้อำนวยการ
 */
function applyRoundPresets(cfg) {
  const f1TeacherEl = document.getElementById('f1-teacher-name');
  const f2TeacherEl = document.getElementById('f2-teacher-name');
  const teacherNameF1 = f1TeacherEl ? f1TeacherEl.value : '';
  const teacherNameF2 = f2TeacherEl ? f2TeacherEl.value : '';

  const f1RadioSelf = document.getElementById('f1_radio_self');
  const f1RadioOther = document.getElementById('f1_radio_other');
  const f1ObsName = document.getElementById('f1-observer-name');
  const f1SigName = document.getElementById('f1-sig-name');
  const f1SigPos = document.getElementById('f1-sig-position');

  const f2Supervisor = document.getElementById('f2-supervisor');
  const f2SigSup = document.getElementById('f2-sig-supervisor');
  const f2SigSupPos = document.getElementById('f2-sig-supervisor-pos');

  if (cfg.num === 1) {
    // ครั้งที่ 1: ตนเอง
    if (f1RadioSelf) f1RadioSelf.checked = true;
    if (f1ObsName) f1ObsName.value = teacherNameF1 || 'ตนเอง';
    if (f1SigName) f1SigName.value = teacherNameF1 || '';
    if (f1SigPos) f1SigPos.value = 'ครู โรงเรียนบ้านสันดาบ';

    if (f2Supervisor) f2Supervisor.value = teacherNameF2 || 'ตนเอง';
    if (f2SigSup) f2SigSup.value = teacherNameF2 || '';
    if (f2SigSupPos) f2SigSupPos.value = 'ครู โรงเรียนบ้านสันดาบ';

  } else if (cfg.num === 2) {
    // ครั้งที่ 2: เพื่อนครู
    if (f1RadioOther) f1RadioOther.checked = true;
    if (f1ObsName) {
      f1ObsName.value = '';
      f1ObsName.placeholder = 'ระบุชื่อเพื่อนครูผู้ร่วมสังเกตการสอน';
    }
    if (f1SigName) f1SigName.value = '';
    if (f1SigPos) f1SigPos.value = 'ครู โรงเรียนบ้านสันดาบ';

    if (f2Supervisor) {
      f2Supervisor.value = '';
      f2Supervisor.placeholder = 'ระบุชื่อเพื่อนครูผู้นิเทศ';
    }
    if (f2SigSup) f2SigSup.value = '';
    if (f2SigSupPos) f2SigSupPos.value = 'ครู โรงเรียนบ้านสันดาบ';

  } else if (cfg.num === 3) {
    // ครั้งที่ 3: หัวหน้างาน
    if (f1RadioOther) f1RadioOther.checked = true;
    if (f1ObsName) f1ObsName.value = 'หัวหน้างานวิชาการ / หัวหน้ากลุ่มสาระฯ';
    if (f1SigName) f1SigName.value = '';
    if (f1SigPos) f1SigPos.value = 'หัวหน้างานวิชาการ / หัวหน้ากลุ่มสาระ';

    if (f2Supervisor) f2Supervisor.value = 'หัวหน้างานวิชาการ / หัวหน้ากลุ่มสาระฯ';
    if (f2SigSup) f2SigSup.value = '';
    if (f2SigSupPos) f2SigSupPos.value = 'หัวหน้างานวิชาการ / หัวหน้ากลุ่มสาระ';

  } else if (cfg.num === 4) {
    // ครั้งที่ 4: ผู้อำนวยการ
    if (f1RadioOther) f1RadioOther.checked = true;
    if (f1ObsName) f1ObsName.value = 'นายกฤษฎา ผลพล';
    if (f1SigName) f1SigName.value = 'นายกฤษฎา ผลพล';
    if (f1SigPos) f1SigPos.value = 'ผู้อำนวยการสถานศึกษา';

    if (f2Supervisor) f2Supervisor.value = 'นายกฤษฎา ผลพล';
    if (f2SigSup) f2SigSup.value = 'นายกฤษฎา ผลพล';
    if (f2SigSupPos) f2SigSupPos.value = 'ผู้อำนวยการสถานศึกษา';
  }
}

/**
 * เปิด/ปิด เมนูด้านซ้ายบนมือถือ
 */
function toggleMobileSidebar() {
  const sidebar = document.getElementById('left-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
  }
}

/**
 * Render Form 1 Table (24 items in 5 categories, 4 rating levels)
 */
function renderForm1Table() {
  const tbody = document.getElementById('tbody-form1');
  tbody.innerHTML = '';

  FORM1_CATEGORIES.forEach(category => {
    const catRow = document.createElement('tr');
    catRow.className = 'category-header-row';
    catRow.innerHTML = `<td colspan="6">${category.name}</td>`;
    tbody.appendChild(catRow);

    category.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.id = `f1-row-${item.id}`;
      const numLabel = formatNumber(item.id);
      const isSel4 = form1Scores[item.id] === 4 ? 'selected' : '';
      const isSel3 = form1Scores[item.id] === 3 ? 'selected' : '';
      const isSel2 = form1Scores[item.id] === 2 ? 'selected' : '';
      const isSel1 = form1Scores[item.id] === 1 ? 'selected' : '';
      
      tr.innerHTML = `
        <td style="text-align:center; font-weight:bold;">${numLabel}</td>
        <td>${item.text}</td>
        <td class="score-cell ${isSel4}" id="f1-cell-${item.id}-4" onclick="selectScoreForm1(${item.id}, 4)">
          <div class="check-box-indicator">✓</div>
        </td>
        <td class="score-cell ${isSel3}" id="f1-cell-${item.id}-3" onclick="selectScoreForm1(${item.id}, 3)">
          <div class="check-box-indicator">✓</div>
        </td>
        <td class="score-cell ${isSel2}" id="f1-cell-${item.id}-2" onclick="selectScoreForm1(${item.id}, 2)">
          <div class="check-box-indicator">✓</div>
        </td>
        <td class="score-cell ${isSel1}" id="f1-cell-${item.id}-1" onclick="selectScoreForm1(${item.id}, 1)">
          <div class="check-box-indicator">✓</div>
        </td>
      `;

      tbody.appendChild(tr);
    });
  });
}

/**
 * Render Form 2 Table (14 items, 5 rating levels)
 */
function renderForm2Table() {
  const tbody = document.getElementById('tbody-form2');
  tbody.innerHTML = '';

  FORM2_ITEMS.forEach(item => {
    const tr = document.createElement('tr');
    tr.id = `f2-row-${item.id}`;
    const numLabel = formatNumber(item.id);
    const isSel5 = form2Scores[item.id] === 5 ? 'selected' : '';
    const isSel4 = form2Scores[item.id] === 4 ? 'selected' : '';
    const isSel3 = form2Scores[item.id] === 3 ? 'selected' : '';
    const isSel2 = form2Scores[item.id] === 2 ? 'selected' : '';
    const isSel1 = form2Scores[item.id] === 1 ? 'selected' : '';

    tr.innerHTML = `
      <td style="text-align:center; font-weight:bold;">${numLabel}</td>
      <td>${item.text}</td>
      <td class="score-cell ${isSel5}" id="f2-cell-${item.id}-5" onclick="selectScoreForm2(${item.id}, 5)">
        <div class="check-box-indicator">✓</div>
      </td>
      <td class="score-cell ${isSel4}" id="f2-cell-${item.id}-4" onclick="selectScoreForm2(${item.id}, 4)">
        <div class="check-box-indicator">✓</div>
      </td>
      <td class="score-cell ${isSel3}" id="f2-cell-${item.id}-3" onclick="selectScoreForm2(${item.id}, 3)">
        <div class="check-box-indicator">✓</div>
      </td>
      <td class="score-cell ${isSel2}" id="f2-cell-${item.id}-2" onclick="selectScoreForm2(${item.id}, 2)">
        <div class="check-box-indicator">✓</div>
      </td>
      <td class="score-cell ${isSel1}" id="f2-cell-${item.id}-1" onclick="selectScoreForm2(${item.id}, 1)">
        <div class="check-box-indicator">✓</div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * Score Selection for Form 1
 */
function selectScoreForm1(itemId, score) {
  if (form1Scores[itemId] === score) {
    delete form1Scores[itemId];
  } else {
    form1Scores[itemId] = score;
  }

  for (let s = 1; s <= 4; s++) {
    const cell = document.getElementById(`f1-cell-${itemId}-${s}`);
    if (cell) {
      if (form1Scores[itemId] === s) {
        cell.classList.add('selected');
      } else {
        cell.classList.remove('selected');
      }
    }
  }

  calculateForm1();
}

/**
 * Real-Time Calculation for Form 1
 */
function calculateForm1() {
  const counts = { 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalScore = 0;
  let answeredCount = 0;

  for (let i = 1; i <= 24; i++) {
    const score = form1Scores[i];
    if (score) {
      counts[score]++;
      totalScore += score;
      answeredCount++;
    }
  }

  // Update counts in footer
  document.getElementById('f1-count-4').textContent = counts[4];
  document.getElementById('f1-count-3').textContent = counts[3];
  document.getElementById('f1-count-2').textContent = counts[2];
  document.getElementById('f1-count-1').textContent = counts[1];

  const maxScore = 24 * 4; // 96
  const percentage = ((totalScore / maxScore) * 100).toFixed(2);

  // Interpretation (81-96 ดีมาก, 63-80 ดี, 44-62 พอใช้, 24-43 ปรับปรุง)
  let quality = 'ยังไม่ได้ประเมิน';
  let qualityBadgeClass = '';

  if (answeredCount > 0) {
    if (totalScore >= 81) {
      quality = 'ดีมาก';
      qualityBadgeClass = 'badge-excellent';
    } else if (totalScore >= 63) {
      quality = 'ดี';
      qualityBadgeClass = 'badge-good';
    } else if (totalScore >= 44) {
      quality = 'พอใช้';
      qualityBadgeClass = 'badge-fair';
    } else {
      quality = 'ปรับปรุง';
      qualityBadgeClass = 'badge-improve';
    }
  }

  // Update Dashboard
  document.getElementById('f1-dash-score').textContent = totalScore;
  document.getElementById('f1-dash-percent').textContent = percentage;
  document.getElementById('f1-dash-progress').textContent = answeredCount;
  
  const dashBadge = document.getElementById('f1-dash-quality');
  dashBadge.textContent = quality;
  dashBadge.className = `stat-badge-quality ${qualityBadgeClass}`;

  // Update Grand summary in table footer (แยกบรรทัด คะแนนรวม และ ระดับคุณภาพ)
  const grandSummary = document.getElementById('f1-grand-summary');
  if (grandSummary) {
    if (answeredCount === 0) {
      grandSummary.innerHTML = `
        <div style="font-weight: 800; line-height: 1.4;">0 คะแนน (รอประเมิน)</div>
        <div style="font-weight: 800; line-height: 1.4;">ระดับ รอประเมิน</div>
      `;
    } else {
      grandSummary.innerHTML = `
        <div style="font-weight: 800; line-height: 1.4;">${totalScore} คะแนน (${percentage}%)</div>
        <div style="font-weight: 800; line-height: 1.4; color: var(--primary-darker);">ระดับ ${quality}</div>
      `;
    }
  }
}

/**
 * Score Selection for Form 2
 */
function selectScoreForm2(itemId, score) {
  if (form2Scores[itemId] === score) {
    delete form2Scores[itemId];
  } else {
    form2Scores[itemId] = score;
  }

  for (let s = 1; s <= 5; s++) {
    const cell = document.getElementById(`f2-cell-${itemId}-${s}`);
    if (cell) {
      if (form2Scores[itemId] === s) {
        cell.classList.add('selected');
      } else {
        cell.classList.remove('selected');
      }
    }
  }

  calculateForm2();
}

/**
 * Real-Time Calculation for Form 2
 */
function calculateForm2() {
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalScore = 0;
  let answeredCount = 0;

  for (let i = 1; i <= 14; i++) {
    const score = form2Scores[i];
    if (score) {
      counts[score]++;
      totalScore += score;
      answeredCount++;
    }
  }

  document.getElementById('f2-count-5').textContent = counts[5];
  document.getElementById('f2-count-4').textContent = counts[4];
  document.getElementById('f2-count-3').textContent = counts[3];
  document.getElementById('f2-count-2').textContent = counts[2];
  document.getElementById('f2-count-1').textContent = counts[1];

  const average = answeredCount > 0 ? (totalScore / 14).toFixed(2) : '0.00';

  let quality = 'ยังไม่ได้ประเมิน';
  let qualityBadgeClass = '';

  const avgNum = parseFloat(average);
  if (answeredCount > 0) {
    if (avgNum >= 4.26) {
      quality = 'ดีมาก';
      qualityBadgeClass = 'badge-excellent';
    } else if (avgNum >= 3.51) {
      quality = 'ดี';
      qualityBadgeClass = 'badge-good';
    } else if (avgNum >= 2.76) {
      quality = 'พอใช้';
      qualityBadgeClass = 'badge-fair';
    } else {
      quality = 'ปรับปรุง';
      qualityBadgeClass = 'badge-improve';
    }
  }

  document.getElementById('f2-dash-score').textContent = totalScore;
  document.getElementById('f2-dash-avg').textContent = average;
  document.getElementById('f2-dash-progress').textContent = answeredCount;

  const dashBadge = document.getElementById('f2-dash-quality');
  dashBadge.textContent = quality;
  dashBadge.className = `stat-badge-quality ${qualityBadgeClass}`;

  const f2ScoreAvg = document.getElementById('f2-score-avg-summary');
  if (f2ScoreAvg) {
    f2ScoreAvg.innerHTML = answeredCount > 0 
      ? `<div style="font-weight: 800; line-height: 1.35;">${totalScore} คะแนน</div><div style="font-weight: 800; line-height: 1.35;">ค่าเฉลี่ย ${average}</div>`
      : `<div style="font-weight: 800; line-height: 1.35;">0 คะแนน</div><div style="font-weight: 800; line-height: 1.35;">ค่าเฉลี่ย 0.00</div>`;
  }

  const f2Grand = document.getElementById('f2-grand-summary');
  if (f2Grand) {
    f2Grand.innerHTML = answeredCount > 0 
      ? `<strong>ระดับ ${quality} (คะแนนเฉลี่ย ${average})</strong>` 
      : '<strong>รอการประเมิน</strong>';
  }
}

/**
 * Quick Fill presets
 */
function quickFillForm1(score) {
  for (let i = 1; i <= 24; i++) {
    form1Scores[i] = score;
    for (let s = 1; s <= 4; s++) {
      const cell = document.getElementById(`f1-cell-${i}-${s}`);
      if (cell) {
        if (s === score) cell.classList.add('selected');
        else cell.classList.remove('selected');
      }
    }
  }
  calculateForm1();
  showToast(`ตั้งค่าคะแนนระดับ ${score} ให้ครบทุก 24 ข้อแล้ว`, 'info');
}

function quickFillForm2(score) {
  for (let i = 1; i <= 14; i++) {
    form2Scores[i] = score;
    for (let s = 1; s <= 5; s++) {
      const cell = document.getElementById(`f2-cell-${i}-${s}`);
      if (cell) {
        if (s === score) cell.classList.add('selected');
        else cell.classList.remove('selected');
      }
    }
  }
  calculateForm2();
  showToast(`ตั้งค่าคะแนนระดับ ${score} ให้ครบทุก 14 ข้อแล้ว`, 'info');
}

/**
 * Reset Forms
 */
function resetForm1() {
  if (!confirm('ต้องการล้างข้อมูลในแบบนิเทศสังเกตชั้นเรียนใช่หรือไม่?')) return;
  for (let i = 1; i <= 24; i++) {
    delete form1Scores[i];
    for (let s = 1; s <= 4; s++) {
      const cell = document.getElementById(`f1-cell-${i}-${s}`);
      if (cell) cell.classList.remove('selected');
    }
  }
  document.getElementById('f1-recommendation').value = '';
  calculateForm1();
  showToast('ล้างข้อมูลแบบนิเทศสังเกตชั้นเรียนเรียบร้อย', 'info');
}

function resetForm2() {
  if (!confirm('ต้องการล้างข้อมูลในแบบประเมินตนเอง นิเทศใช่หรือไม่?')) return;
  for (let i = 1; i <= 14; i++) {
    delete form2Scores[i];
    for (let s = 1; s <= 5; s++) {
      const cell = document.getElementById(`f2-cell-${i}-${s}`);
      if (cell) cell.classList.remove('selected');
    }
  }
  document.getElementById('f2-recommendation').value = '';
  calculateForm2();
  showToast('ล้างข้อมูลแบบประเมินตนเองเรียบร้อย', 'info');
}

/**
 * Populate Teacher Dropdowns
 */
function populateTeacherDropdowns() {
  const f1Select = document.getElementById('f1-teacher-select');
  const f2Select = document.getElementById('f2-teacher-select');
  if (!f1Select || !f2Select) return;

  const currentF1Val = f1Select.value;
  const currentF2Val = f2Select.value;

  f1Select.innerHTML = '<option value="">-- กรุณาเลือกครูผู้สอนจากฐานข้อมูลกลาง --</option>';
  f2Select.innerHTML = '<option value="">-- กรุณาเลือกครูผู้รับการนิเทศจากฐานข้อมูลกลาง --</option>';

  const seen = new Set();
  teachersData.forEach(t => {
    if (!t || !t.name) return;
    const key = t.name + '|' + (t.grade || '');
    if (!seen.has(key)) {
      seen.add(key);
      const roleText = t.grade ? `(${t.grade})` : (t.role ? `(${t.role})` : '');
      
      const opt1 = document.createElement('option');
      opt1.value = t.name;
      opt1.dataset.grade = t.grade || '';
      opt1.dataset.role = t.role || '';
      opt1.textContent = roleText ? `${t.name} ${roleText}` : t.name;
      f1Select.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = t.name;
      opt2.dataset.grade = t.grade || '';
      opt2.dataset.role = t.role || '';
      opt2.textContent = roleText ? `${t.name} ${roleText}` : t.name;
      f2Select.appendChild(opt2);
    }
  });

  if (currentF1Val && Array.from(f1Select.options).some(o => o.value === currentF1Val)) {
    f1Select.value = currentF1Val;
  }
  if (currentF2Val && Array.from(f2Select.options).some(o => o.value === currentF2Val)) {
    f2Select.value = currentF2Val;
  }

  renderTeachersDirectory();
}

/**
 * Synchronize Grade value for print display
 */
function syncGradePrintVal(val) {
  const printEl = document.getElementById('f1-grade-print-val');
  if (printEl) printEl.textContent = val || '';
}

function syncGradePrintValForm2(val) {
  const printEl = document.getElementById('f2-grade-print-val');
  if (printEl) printEl.textContent = val || '';
}

/**
 * แปลงวันที่ YYYY-MM-DD เป็นรูปแบบวันที่ไทย (DD/MM/YYYY) ปราศจาก icon ปฏิทิน
 */
function formatThaiDateDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const thaiYear = year < 2400 ? year + 543 : year;
  const dNum = parseInt(parts[2], 10);
  const mNum = parseInt(parts[1], 10);
  const dayStr = String(dNum).padStart(2, '0');
  const monthStr = String(mNum).padStart(2, '0');
  const yearStr = String(thaiYear);
  if (currentNumeralMode === 'thai') {
    return `${toThaiNumeral(dayStr)}/${toThaiNumeral(monthStr)}/${toThaiNumeral(yearStr)}`;
  }
  return `${dayStr}/${monthStr}/${yearStr}`;
}

/**
 * Synchronize all print values before printing
 * ซิงค์ค่าข้อมูลทั้งหมดลงใน text spans เพื่อให้ระบบพิมพ์แสดงผลสวยงาม ตัวอักษรเท่ากัน ไม่มี icon
 */
function syncAllPrintValues() {
  const sync = (inputId, spanId, transform) => {
    const input = document.getElementById(inputId);
    const span = document.getElementById(spanId);
    if (span && input) {
      let val = input.value || '';
      if (transform) val = transform(val);
      span.textContent = val;
    }
  };

  // Form 1 Headers
  sync('f1-term', 'f1-term-print-val');
  sync('f1-year', 'f1-year-print-val');

  // Form 1 General Info
  const f1TeacherSelect = document.getElementById('f1-teacher-select');
  const f1TeacherPrint = document.getElementById('f1-teacher-print-val');
  const f1TeacherName = document.getElementById('f1-teacher-name');
  if (f1TeacherPrint) {
    f1TeacherPrint.textContent = (f1TeacherSelect && f1TeacherSelect.value) || (f1TeacherName && f1TeacherName.value) || '';
  }

  sync('f1-date', 'f1-date-print-val', formatThaiDateDisplay);
  sync('f1-subject', 'f1-subject-print-val');
  sync('f1-subject-code', 'f1-code-print-val');
  sync('f1-grade', 'f1-grade-print-val');
  sync('f1-period', 'f1-period-print-val');
  sync('f1-unit', 'f1-unit-print-val');

  // Form 1 Observer 1.3: แสดงข้อมูลครบถ้วนทั้ง ตนเอง และ ผู้อื่นประเมิน พร้อม radio indicators
  const isSelf = document.getElementById('f1_radio_self')?.checked;
  const radioSelfEl = document.getElementById('f1-print-radio-self');
  const radioOtherEl = document.getElementById('f1-print-radio-other');
  const obsNameValEl = document.getElementById('f1-print-observer-name');
  const obsNameInput = document.getElementById('f1-observer-name');

  if (radioSelfEl && radioOtherEl) {
    if (isSelf) {
      radioSelfEl.classList.add('checked');
      radioOtherEl.classList.remove('checked');
    } else {
      radioSelfEl.classList.remove('checked');
      radioOtherEl.classList.add('checked');
    }
  }

  if (obsNameValEl) {
    const rawVal = obsNameInput ? obsNameInput.value.trim() : '';
    if (isSelf) {
      if (rawVal && rawVal !== 'ตนเอง') {
        obsNameValEl.textContent = rawVal;
      } else {
        obsNameValEl.textContent = '....................................................';
      }
    } else {
      if (rawVal) {
        obsNameValEl.textContent = rawVal;
      } else {
        obsNameValEl.textContent = '....................................................';
      }
    }
  }

  // Form 1 Signatures
  sync('f1-sig-name', 'f1-sig-name-print-val');
  sync('f1-sig-position', 'f1-sig-pos-print-val');

  // Form 2 Headers
  sync('f2-year', 'f2-year-print-val');
  sync('f2-term', 'f2-term-print-val');

  // Form 2 General Info
  const f2TeacherSelect = document.getElementById('f2-teacher-select');
  const f2TeacherPrint = document.getElementById('f2-teacher-print-val');
  const f2TeacherName = document.getElementById('f2-teacher-name');
  if (f2TeacherPrint) {
    f2TeacherPrint.textContent = (f2TeacherSelect && f2TeacherSelect.value) || (f2TeacherName && f2TeacherName.value) || '';
  }

  sync('f2-grade', 'f2-grade-print-val');
  sync('f2-room', 'f2-room-print-val');
  sync('f2-date', 'f2-date-print-val', formatThaiDateDisplay);
  sync('f2-time', 'f2-time-print-val', val => val ? (val + ' น.') : '');
  sync('f2-supervisor', 'f2-supervisor-print-val');

  // Form 2 Signatures
  sync('f2-sig-teacher', 'f2-sig-teacher-print-val');
  sync('f2-sig-supervisor', 'f2-sig-supervisor-print-val');
  sync('f2-sig-supervisor-pos', 'f2-sig-supervisor-pos-print-val');

  // ตรวจสอบสถานะการแนบลายเซ็น: แนบลายเซ็น ต้องไม่มี .
  [
    { imgId: 'f1-sig-img', slotId: 'f1-sig-target-slot', dotsId: 'f1-sig-dots' },
    { imgId: 'f2-teacher-sig-img', slotId: 'f2-teacher-sig-target-slot', dotsId: 'f2-teacher-sig-dots' },
    { imgId: 'f2-sup-sig-img', slotId: 'f2-sup-sig-target-slot', dotsId: 'f2-sup-sig-dots' }
  ].forEach(sig => {
    const img = document.getElementById(sig.imgId);
    const slot = document.getElementById(sig.slotId);
    const dots = document.getElementById(sig.dotsId);
    const hasSig = img && img.src && img.src.length > 50 && !img.src.endsWith('/');
    if (hasSig) {
      if (slot) slot.classList.add('has-signature');
      if (dots) {
        dots.classList.add('hide-sig-dots');
        dots.style.display = 'none';
      }
    } else {
      if (slot) slot.classList.remove('has-signature');
      if (dots) {
        dots.classList.remove('hide-sig-dots');
        dots.style.display = 'inline';
      }
    }
  });
}

window.addEventListener('beforeprint', syncAllPrintValues);

/**
 * Handle Teacher Selected in Form 1
 */
function onTeacherSelectedForm1(teacherName) {
  const select = document.getElementById('f1-teacher-select');
  const selectedOpt = select ? select.options[select.selectedIndex] : null;
  const f1TeacherName = document.getElementById('f1-teacher-name');
  const f1PrintVal = document.getElementById('f1-teacher-print-val');
  
  if (teacherName) {
    if (f1TeacherName) f1TeacherName.value = teacherName;
    if (f1PrintVal) f1PrintVal.textContent = teacherName;

    // หา grade จาก selectedOpt หรือจาก teachersData
    let grade = (selectedOpt && selectedOpt.dataset.grade) ? selectedOpt.dataset.grade : '';
    if (!grade) {
      const foundTeacher = teachersData.find(t => t && t.name === teacherName);
      if (foundTeacher) grade = foundTeacher.grade || '';
    }

    if (grade) {
      const gEl = document.getElementById('f1-grade');
      if (gEl) {
        gEl.value = grade;
        syncGradePrintVal(grade);
      }
    }

    // If Round 1 (ตนเอง), update observer to this teacher
    if (currentRound === 1) {
      const obsName = document.getElementById('f1-observer-name');
      if (obsName) obsName.value = teacherName;
      const sigName = document.getElementById('f1-sig-name');
      if (sigName) sigName.value = teacherName;
      const obsPrint = document.getElementById('f1-observer-print-val');
      if (obsPrint) obsPrint.textContent = teacherName;
    }

    syncAllPrintValues();
    showToast(`เลือกครูผู้สอน: ${teacherName}`, 'info');
  } else {
    if (f1TeacherName) f1TeacherName.value = '';
    if (f1PrintVal) f1PrintVal.textContent = '';
    syncAllPrintValues();
  }
}

/**
 * Handle Teacher Selected in Form 2
 */
function onTeacherSelectedForm2(teacherName) {
  const select = document.getElementById('f2-teacher-select');
  const selectedOpt = select ? select.options[select.selectedIndex] : null;
  const f2TeacherName = document.getElementById('f2-teacher-name');
  const f2PrintVal = document.getElementById('f2-teacher-print-val');

  if (teacherName) {
    if (f2TeacherName) f2TeacherName.value = teacherName;
    if (f2PrintVal) f2PrintVal.textContent = teacherName;

    const sigTeacher = document.getElementById('f2-sig-teacher');
    if (sigTeacher) sigTeacher.value = teacherName;

    // หา grade จาก selectedOpt หรือจาก teachersData
    let grade = (selectedOpt && selectedOpt.dataset.grade) ? selectedOpt.dataset.grade : '';
    if (!grade) {
      const foundTeacher = teachersData.find(t => t && t.name === teacherName);
      if (foundTeacher) grade = foundTeacher.grade || '';
    }

    if (grade) {
      const gEl = document.getElementById('f2-grade');
      if (gEl) {
        gEl.value = grade;
        syncGradePrintValForm2(grade);
      }
      const roomEl = document.getElementById('f2-room');
      if (roomEl) roomEl.value = `ห้องเรียนชั้น ${grade}`;
      const roomPrint = document.getElementById('f2-room-print-val');
      if (roomPrint) roomPrint.textContent = `ห้องเรียนชั้น ${grade}`;
    }

    // If Round 1 (ตนเอง), update supervisor to this teacher
    if (currentRound === 1) {
      const sup = document.getElementById('f2-supervisor');
      if (sup) sup.value = teacherName;
      const sigSup = document.getElementById('f2-sig-supervisor');
      if (sigSup) sigSup.value = teacherName;
      const supPrint = document.getElementById('f2-supervisor-print-val');
      if (supPrint) supPrint.textContent = teacherName;
    }

    syncAllPrintValues();
    showToast(`เลือกครูผู้รับการนิเทศ: ${teacherName}`, 'info');
  } else {
    if (f2TeacherName) f2TeacherName.value = '';
    if (f2PrintVal) f2PrintVal.textContent = '';
    syncAllPrintValues();
  }
}

/**
 * Toggle observer type Form 1
 */
function toggleObserverTypeForm1(type) {
  const observerNameInput = document.getElementById('f1-observer-name');
  const sigNameInput = document.getElementById('f1-sig-name');
  const teacherName = document.getElementById('f1-teacher-name').value;

  if (type === 'self') {
    observerNameInput.value = teacherName || 'ตนเอง';
    sigNameInput.value = teacherName || '';
  } else {
    observerNameInput.value = ROUNDS_CONFIG[currentRound].defaultObserverName || '';
    sigNameInput.value = '';
  }
  syncAllPrintValues();
}

// Storage keys for custom added teachers and students
const CUSTOM_TEACHERS_KEY = 'bansandab_custom_teachers';
const CUSTOM_STUDENTS_KEY = 'bansandab_custom_students';

function getCustomTeachers() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TEACHERS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function getCustomStudents() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_STUDENTS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

/**
 * Load Central Data from Google Sheets & Merge with Local Additions
 */
async function loadCentralData(showNotification = true) {
  const teachersUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.centralSheetId}/gviz/tq?tqx=out:json&sheet=Teachers`;
  const studentsUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.centralSheetId}/gviz/tq?tqx=out:json`;

  const defaultGradeMap = {
    'นางสาวทิพย์สุคนธ์ อ่องเมือง': 'อ.1-อ.2',
    'นางสาวธารณี สินศุข': 'อ.3',
    'นางสาวสุวรรณี นิลประดับ': 'ป.1',
    'นางสาวนิศารัตน์ ฉิมขันธ์': 'ป.2',
    'นางสาวชลลดา ซ่อนกลิ่น': 'ป.3',
    'นางสาววรัญญา พิศแสนสุวรรณ': 'ป.4',
    'สุจิตตรา ปางสุข': 'ป.5',
    'นางสาวสุจิตตรา ปางสุข': 'ป.5',
    'นายณัฏฐ์ ไตรพุทธมาศ': 'ป.6',
    'นายกฤษฎา ผลพล': '',
    'นายสุโลธร ธนาวิชิตฤกษ์': '',
    'นายธนโชค ขุนพิลึก': '',
    'นายพิศณุ เพียสีนุ้ย': '',
    'นายคเณศ ชุนสิทธิ์': ''
  };

  try {
    const tResponse = await fetch(teachersUrl);
    if (tResponse.ok) {
      const text = await tResponse.text();
      const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const data = JSON.parse(jsonStr);

      const rows = data && data.table ? data.table.rows : null;
      if (rows && rows.length > 0) {
        const loaded = [];
        rows.forEach(r => {
          if (!r || !r.c) return;
          // Col 0: ID
          // Col 1: ชื่อ-นามสกุล
          // Col 2: ตำแหน่ง
          // Col 3: ฝ่ายงาน
          // Col 4: สังกัด
          // Col 7: เบอร์โทร
          // Col 9: รูปภาพ Drive URL
          const id = r.c[0] ? String(r.c[0].f || r.c[0].v || '').trim() : '';
          const rawName = r.c[1] ? String(r.c[1].v || r.c[1].f || '').trim() : '';
          const name = rawName.replace(/\s+/g, ' ');
          const pos = r.c[2] ? String(r.c[2].v || r.c[2].f || '').trim().replace(/\s+/g, ' ') : '';
          const dept = r.c[3] ? String(r.c[3].v || r.c[3].f || '').trim().replace(/\s+/g, ' ') : '';
          const phone = r.c[7] ? String(r.c[7].f || r.c[7].v || '').trim() : '';
          const photoUrl = r.c[9] ? String(r.c[9].v || '').trim() : '';

          if (name && !name.includes('ชื่อ-นามสกุล') && !name.includes('ชื่อ - นามสกุล')) {
            let grade = defaultGradeMap[name] || '';
            if (!grade) {
              const match = (pos + ' ' + dept).match(/[อป]\.\s*\d/);
              if (match) grade = match[0].replace(/\s+/g, '');
              else if (pos.startsWith('อ.') || pos.startsWith('ป.')) grade = pos;
              else if (dept.startsWith('อ.') || dept.startsWith('ป.')) grade = dept;
            }

            let role = pos;
            if (dept && !pos.includes(dept)) {
              role = pos ? `${pos} (${dept})` : dept;
            }
            if (!role) role = 'ครู';

            loaded.push({
              id: id,
              name: name,
              grade: grade,
              role: role,
              pos: pos,
              dept: dept,
              phone: phone,
              photoUrl: photoUrl
            });
          }
        });
        if (loaded.length > 0) {
          teachersData = loaded;
        }
      }
    }
  } catch (err) {
    console.warn('Live fetch for teachers failed, using cached list:', err);
  }

  // ผสานข้อมูลครูที่เพิ่มเข้ามาเอง (Custom Teachers from localStorage)
  const customTeachers = getCustomTeachers();
  customTeachers.forEach(ct => {
    if (!teachersData.some(t => t.name === ct.name && t.role === ct.role)) {
      teachersData.push(ct);
    }
  });
  populateTeacherDropdowns();

  try {
    const sResponse = await fetch(studentsUrl);
    if (sResponse.ok) {
      const text = await sResponse.text();
      const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const data = JSON.parse(jsonStr);

      const rows = data && data.table ? data.table.rows : null;
      if (rows && rows.length > 0) {
        studentsData = rows.map(r => ({
          year: r.c[0] ? String(r.c[0].f || r.c[0].v || '') : '',
          grade: r.c[1] ? String(r.c[1].v || '') : '',
          nationalId: r.c[2] ? String(r.c[2].f || r.c[2].v || '') : '',
          studentCode: r.c[3] ? String(r.c[3].f || r.c[3].v || '') : '',
          name: r.c[4] ? String(r.c[4].v || '').replace(/\s+/g, ' ') : '',
          gender: r.c[5] ? String(r.c[5].v || '') : '',
          birthday: r.c[6] ? String(r.c[6].f || r.c[6].v || '') : '',
          status: r.c[7] ? String(r.c[7].v || '') : 'เรียนอยู่'
        })).filter(s => s.name && s.name.trim() && !s.name.includes('ชื่อ-นามสกุล') && !s.name.includes('ชื่อ - นามสกุล'));
      }
    }
  } catch (err) {
    console.warn('Live fetch for students failed, loading fallback:', err);
  }

  // ผสานข้อมูลนักเรียนที่เพิ่มเข้ามาเอง (Custom Students from localStorage)
  const customStudents = getCustomStudents();
  customStudents.forEach(cs => {
    if (!studentsData.some(s => s.studentCode === cs.studentCode)) {
      studentsData.unshift(cs);
    }
  });

  renderTeachersDirectory();
  renderStudentsTable();

  const teacherCountEl = document.getElementById('dir-teachers-count');
  if (teacherCountEl) teacherCountEl.textContent = teachersData.length;
  const studentCountEl = document.getElementById('dir-students-count');
  if (studentCountEl) studentCountEl.textContent = studentsData.length;

  if (showNotification) {
    showToast(`เชื่อมต่อฐานข้อมูลกลางสำเร็จ: ครู ${teachersData.length} ท่าน, นักเรียน ${studentsData.length} คน`, 'success');
  }
}

/**
 * จัดการเพิ่มข้อมูลครู (Add Teacher)
 */
function handleAddTeacher(event) {
  event.preventDefault();
  const nameInput = document.getElementById('add-teacher-name');
  const posInput = document.getElementById('add-teacher-pos');
  const name = nameInput ? nameInput.value.trim() : '';
  const pos = posInput ? posInput.value.trim() : '';

  if (!name || !pos) {
    alert('กรุณากรอกชื่อ-นามสกุลและเลือกตำแหน่ง/ชั้นรับผิดชอบ');
    return;
  }

  // ตรวจสอบข้อมูลซ้ำ
  if (teachersData.some(t => t.name === name && t.role === pos)) {
    alert('มีข้อมูลครูท่านนี้ในระบบแล้ว');
    return;
  }

  const newTeacher = {
    name: name,
    grade: pos.startsWith('อ.') || pos.startsWith('ป.') ? pos : '',
    role: pos.startsWith('อ.') || pos.startsWith('ป.') ? `ครูประจำชั้น ${pos}` : pos,
    custom: true
  };

  const customTeachers = getCustomTeachers();
  customTeachers.push(newTeacher);
  localStorage.setItem(CUSTOM_TEACHERS_KEY, JSON.stringify(customTeachers));

  teachersData.push(newTeacher);
  populateTeacherDropdowns();
  renderTeachersDirectory();

  const countEl = document.getElementById('dir-teachers-count');
  if (countEl) countEl.textContent = teachersData.length;

  if (nameInput) nameInput.value = '';
  if (posInput) posInput.value = '';
  showToast(`เพิ่มข้อมูลครู: ${name} สำเร็จแล้ว`, 'success');
}

/**
 * ลบข้อมูลครู
 */
function deleteTeacher(name, role) {
  if (confirm(`คุณต้องการลบข้อมูล ${name} ใช่หรือไม่?`)) {
    let customTeachers = getCustomTeachers();
    customTeachers = customTeachers.filter(t => !(t.name === name && (t.role === role || t.grade === role)));
    localStorage.setItem(CUSTOM_TEACHERS_KEY, JSON.stringify(customTeachers));

    teachersData = teachersData.filter(t => !(t.name === name && (t.role === role || t.grade === role)));
    populateTeacherDropdowns();
    renderTeachersDirectory();

    const countEl = document.getElementById('dir-teachers-count');
    if (countEl) countEl.textContent = teachersData.length;
    showToast(`ลบข้อมูล ${name} เรียบร้อยแล้ว`, 'info');
  }
}

/**
 * Render Teachers in Directory View (ตารางเต็มแถว 100%)
 */
function renderTeachersDirectory() {
  const tbody = document.getElementById('dir-teachers-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  teachersData.forEach((t, idx) => {
    if (!t || !t.name) return;
    const safeName = String(t.name).replace(/'/g, "\\'");
    const safeGrade = String(t.grade || '').replace(/'/g, "\\'");
    const roleDisplay = t.grade ? `${t.role || 'ครู'} (${t.grade})` : (t.role || 'ครู');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;">${idx + 1}</td>
      <td style="font-weight:700;">${t.name}</td>
      <td><span class="status-badge" style="background:#fce7f3; color:#831843; border:none; font-weight:700;">${roleDisplay}</span></td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn btn-secondary" style="padding:0.25rem 0.65rem; font-size:0.9rem; margin-right:4px;" onclick="applyTeacherToForms('${safeName}', '${safeGrade}')">
          เลือกใช้
        </button>
        <button type="button" class="btn btn-outline-danger" style="padding:0.25rem 0.55rem; font-size:0.9rem;" onclick="deleteTeacher('${safeName}', '${String(t.role || t.grade || '').replace(/'/g, "\\'")}')" title="ลบ">
          🗑️ ลบ
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function applyTeacherToForms(name, grade) {
  const f1Select = document.getElementById('f1-teacher-select');
  if (f1Select) {
    f1Select.value = name;
    onTeacherSelectedForm1(name);
  }

  const f2Select = document.getElementById('f2-teacher-select');
  if (f2Select) {
    f2Select.value = name;
    onTeacherSelectedForm2(name);
  }

  switchForm('form1');
  showToast(`เลือก ${name} ในแบบประเมินเรียบร้อย`, 'success');
}

/**
 * จัดการเพิ่มข้อมูลนักเรียน (Add Student)
 */
function handleAddStudent(event) {
  event.preventDefault();
  const gradeInput = document.getElementById('add-student-grade');
  const codeInput = document.getElementById('add-student-code');
  const nameInput = document.getElementById('add-student-name');
  const genderInput = document.getElementById('add-student-gender');
  const statusInput = document.getElementById('add-student-status');

  const grade = gradeInput ? gradeInput.value.trim() : '';
  const code = codeInput ? codeInput.value.trim() : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const gender = genderInput ? genderInput.value : 'ชาย';
  const status = statusInput ? statusInput.value : 'เรียนอยู่';

  if (!grade || !code || !name) {
    alert('กรุณากรอกข้อมูลระดับชั้น รหัสประจำตัว และชื่อ-นามสกุลนักเรียน');
    return;
  }

  const newStudent = {
    grade: grade,
    studentCode: code,
    name: name,
    gender: gender,
    status: status,
    custom: true
  };

  const customStudents = getCustomStudents();
  customStudents.push(newStudent);
  localStorage.setItem(CUSTOM_STUDENTS_KEY, JSON.stringify(customStudents));

  studentsData.unshift(newStudent);
  renderStudentsTable();

  const countEl = document.getElementById('dir-students-count');
  if (countEl) countEl.textContent = studentsData.length;

  if (codeInput) codeInput.value = '';
  if (nameInput) nameInput.value = '';
  showToast(`เพิ่มข้อมูลนักเรียน: ${name} สำเร็จแล้ว`, 'success');
}

/**
 * ลบข้อมูลนักเรียน
 */
function deleteStudent(studentCode, name) {
  if (confirm(`คุณต้องการลบข้อมูลนักเรียน ${name} (รหัส ${studentCode}) ใช่หรือไม่?`)) {
    let customStudents = getCustomStudents();
    customStudents = customStudents.filter(s => s.studentCode !== studentCode);
    localStorage.setItem(CUSTOM_STUDENTS_KEY, JSON.stringify(customStudents));

    studentsData = studentsData.filter(s => s.studentCode !== studentCode);
    renderStudentsTable();

    const countEl = document.getElementById('dir-students-count');
    if (countEl) countEl.textContent = studentsData.length;
    showToast(`ลบข้อมูลนักเรียน ${name} เรียบร้อยแล้ว`, 'info');
  }
}

/**
 * Render Students Table in Directory View (ตารางเต็มแถว 100%)
 */
function renderStudentsTable() {
  const tbody = document.getElementById('dir-students-tbody');
  if (!tbody) return;
  const filterGradeEl = document.getElementById('student-filter-grade');
  const filterGrade = filterGradeEl ? filterGradeEl.value : '';
  tbody.innerHTML = '';

  const filtered = filterGrade 
    ? studentsData.filter(s => s.grade === filterGrade)
    : studentsData;

  const countEl = document.getElementById('dir-students-count');
  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--slate-400);">ไม่พบข้อมูลนักเรียน</td></tr>`;
    return;
  }

  filtered.forEach((s, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;">${idx + 1}</td>
      <td style="text-align:center;"><strong>${s.grade}</strong></td>
      <td style="text-align:center;">${s.studentCode}</td>
      <td style="font-weight:600;">${s.name}</td>
      <td style="text-align:center;">${s.gender || '-'}</td>
      <td style="text-align:center;"><span class="status-badge" style="background:#dcfce7; color:#166534; border:none; padding:0.15rem 0.5rem; font-size:0.85rem;">${s.status || 'เรียนอยู่'}</span></td>
      <td style="text-align:center;">
        <button type="button" class="btn btn-outline-danger" style="padding:0.2rem 0.5rem; font-size:0.85rem;" onclick="deleteStudent('${s.studentCode}', '${s.name}')" title="ลบ">
          🗑️ ลบ
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Save Record - Form 1 (แบบนิเทศสังเกตชั้นเรียน)
 */
async function saveRecordForm1() {
  const teacherName = document.getElementById('f1-teacher-name').value.trim();
  if (!teacherName) {
    alert('กรุณาระบุชื่อผู้สอนก่อนบันทึกข้อมูล');
    document.getElementById('f1-teacher-name').focus();
    return;
  }

  let answeredCount = 0;
  let totalScore = 0;
  for (let i = 1; i <= 24; i++) {
    if (form1Scores[i]) {
      answeredCount++;
      totalScore += form1Scores[i];
    }
  }

  if (answeredCount === 0) {
    alert('กรุณาประเมินและติ๊กเลือกระดับคะแนนอย่างน้อย 1 รายการ');
    return;
  }

  let quality = 'ปรับปรุง';
  if (totalScore >= 81) quality = 'ดีมาก';
  else if (totalScore >= 63) quality = 'ดี';
  else if (totalScore >= 44) quality = 'พอใช้';

  const cfg = ROUNDS_CONFIG[currentRound];
  const isEdit = Boolean(editingRecordId);
  const cleanTeacherId = teacherName.replace(/\s+/g, '_');
  const recordId = isEdit ? editingRecordId : (`f1_r${currentRound}_${cleanTeacherId}`);

  // ดึงภาพลายเซ็นผู้สังเกต/ผู้ประเมิน ถ้ามีการแนบไว้
  const f1SigImg = document.getElementById('f1-sig-img');
  const f1SigData = (f1SigImg && f1SigImg.src && f1SigImg.src.startsWith('data:image/')) ? f1SigImg.src : '';

  const record = {
    id: recordId,
    round: currentRound,
    roundName: cfg.fullName,
    roundShort: `ครั้งที่ ${cfg.thaiNum} ${cfg.name}`,
    type: 'แบบสังเกตชั้นเรียน',
    formType: 'form1',
    timestamp: isEdit ? (getFormattedCurrentTimestamp() + ' (แก้ไข)') : getFormattedCurrentTimestamp(),
    teacherName: teacherName,
    grade: document.getElementById('f1-grade').value,
    subject: document.getElementById('f1-subject').value,
    subjectCode: document.getElementById('f1-subject-code').value,
    term: document.getElementById('f1-term').value,
    year: document.getElementById('f1-year').value,
    date: document.getElementById('f1-date').value,
    period: document.getElementById('f1-period').value,
    unit: document.getElementById('f1-unit').value,
    observerName: document.getElementById('f1-observer-name').value || cfg.name,
    signature: f1SigData,
    signatures: {
      observerSig: f1SigData
    },
    scores: { ...form1Scores },
    totalScore: totalScore,
    maxScore: 96,
    scoreDisplay: `${totalScore} / 96`,
    quality: quality,
    recommendation: document.getElementById('f1-recommendation').value
  };

  const sheetSynced = await saveRecordToDatabase(record);
  
  // ล้างลายเซ็นออกจากแบบฟอร์มทันที เพื่อให้การรีเฟรชหรือแบบฟอร์มใหม่ว่างเปล่าสมบูรณ์
  clearAllSignaturesFromForm(true);

  const savedIsEdit = isEdit;
  editingRecordId = null;
  hideEditModeUI();

  showToast('✅ บันทึกข้อมูลเรียบร้อย', 'success');

  // แสดงกล่องข้อความแจ้งเตือน "บันทึกข้อมูลเรียบร้อย"
  showCenterSaveSuccessModal({
    isEdit: savedIsEdit,
    title: 'บันทึกข้อมูลเรียบร้อย',
    subtitle: 'ผลการประเมินได้รับการบันทึกลงฐานข้อมูลเรียบร้อยแล้ว',
    roundName: cfg.fullName,
    formTypeTitle: 'แบบนิเทศสังเกตชั้นเรียน (24 ข้อ)',
    teacherName: teacherName,
    scoreText: `${totalScore} / 96 คะแนน (${quality})`,
    sheetSynced: Boolean(sheetSynced),
    onNext: () => {
      clearFormAfterSave('form1');
      switchForm('history');
    }
  });
}

/**
 * Save Record - Form 2 (แบบประเมินตนเอง นิเทศ)
 */
async function saveRecordForm2() {
  const teacherName = document.getElementById('f2-teacher-name').value.trim();
  if (!teacherName) {
    alert('กรุณาระบุชื่อครูผู้รับการนิเทศก่อนบันทึกข้อมูล');
    document.getElementById('f2-teacher-name').focus();
    return;
  }

  let answeredCount = 0;
  let totalScore = 0;
  for (let i = 1; i <= 14; i++) {
    if (form2Scores[i]) {
      answeredCount++;
      totalScore += form2Scores[i];
    }
  }

  if (answeredCount === 0) {
    alert('กรุณาประเมินและติ๊กเลือกระดับคะแนนอย่างน้อย 1 รายการ');
    return;
  }

  const average = (totalScore / 14).toFixed(2);
  const avgNum = parseFloat(average);
  let quality = 'ปรับปรุง';
  if (avgNum >= 4.26) quality = 'ดีมาก';
  else if (avgNum >= 3.51) quality = 'ดี';
  else if (avgNum >= 2.76) quality = 'พอใช้';

  const cfg = ROUNDS_CONFIG[currentRound];
  const isEdit = Boolean(editingRecordId);
  const cleanTeacherId = teacherName.replace(/\s+/g, '_');
  const recordId = isEdit ? editingRecordId : (`f2_r${currentRound}_${cleanTeacherId}`);

  // ดึงภาพลายเซ็นผู้รับการนิเทศ และผู้นิเทศ ถ้ามีการแนบไว้
  const f2TeacherSigImg = document.getElementById('f2-teacher-sig-img');
  const f2TeacherSigData = (f2TeacherSigImg && f2TeacherSigImg.src && f2TeacherSigImg.src.startsWith('data:image/')) ? f2TeacherSigImg.src : '';

  const f2SupSigImg = document.getElementById('f2-sup-sig-img');
  const f2SupSigData = (f2SupSigImg && f2SupSigImg.src && f2SupSigImg.src.startsWith('data:image/')) ? f2SupSigImg.src : '';

  const record = {
    id: recordId,
    round: currentRound,
    roundName: cfg.fullName,
    roundShort: `ครั้งที่ ${cfg.thaiNum} ${cfg.name}`,
    type: 'แบบประเมินตนเอง นิเทศ',
    formType: 'form2',
    timestamp: isEdit ? (getFormattedCurrentTimestamp() + ' (แก้ไข)') : getFormattedCurrentTimestamp(),
    teacherName: teacherName,
    grade: document.getElementById('f2-grade').value,
    room: document.getElementById('f2-room').value,
    term: document.getElementById('f2-term').value,
    year: document.getElementById('f2-year').value,
    date: document.getElementById('f2-date').value,
    time: document.getElementById('f2-time').value,
    supervisor: document.getElementById('f2-supervisor').value || cfg.name,
    teacherSignature: f2TeacherSigData,
    supervisorSignature: f2SupSigData,
    signatures: {
      teacherSig: f2TeacherSigData,
      supervisorSig: f2SupSigData
    },
    scores: { ...form2Scores },
    totalScore: totalScore,
    average: average,
    scoreDisplay: `${totalScore} (เฉลี่ย ${average})`,
    quality: quality,
    recommendation: document.getElementById('f2-recommendation').value
  };

  const sheetSynced = await saveRecordToDatabase(record);
  
  // ล้างลายเซ็นออกจากแบบฟอร์มทันที เพื่อให้การรีเฟรชหรือแบบฟอร์มใหม่ว่างเปล่าสมบูรณ์
  clearAllSignaturesFromForm(true);

  const savedIsEdit = isEdit;
  editingRecordId = null;
  hideEditModeUI();

  showToast('✅ บันทึกข้อมูลเรียบร้อย', 'success');

  // แสดงกล่องข้อความแจ้งเตือน "บันทึกข้อมูลเรียบร้อย"
  showCenterSaveSuccessModal({
    isEdit: savedIsEdit,
    title: 'บันทึกข้อมูลเรียบร้อย',
    subtitle: 'ผลการประเมินได้รับการบันทึกลงฐานข้อมูลเรียบร้อยแล้ว',
    roundName: cfg.fullName,
    formTypeTitle: 'แบบประเมินตนเอง นิเทศ (14 ข้อ)',
    teacherName: teacherName,
    scoreText: `${totalScore} / 70 คะแนน (เฉลี่ย ${average} - ${quality})`,
    sheetSynced: Boolean(sheetSynced),
    onNext: () => {
      clearFormAfterSave('form2');
      switchForm('history');
    }
  });
}

/**
 * บันทึกลง Local Cache (LocalStorage) สำรอง โดยป้องกันประวัติซ้ำซ้อน
 */
function saveToLocalHistory(record) {
  let history = [];
  try {
    const raw = localStorage.getItem(CONFIG.historyStorageKey);
    if (raw) history = JSON.parse(raw);
  } catch (e) {
    history = [];
  }
  // กรองของเดิมที่มี ID ซ้ำ หรือเป็นรายการการประเมินเดียวกันออก เพื่อไม่ให้มีประวัติเกินจริง
  history = (history || []).filter(item => item && !isSameEvaluationRecord(item, record));
  history.unshift(record);
  localStorage.setItem(CONFIG.historyStorageKey, JSON.stringify(deduplicateRecordList(history)));
}

/**
 * บันทึกข้อมูลผลการนิเทศลงฐานข้อมูลถาวร
 * 1. ปลด ID ออกจาก deleted list (หากเคยมี)
 * 2. บันทึกลง Persistent Local Storage
 * 3. บันทึกลง Server Database (/api/history -> database_history.json)
 * 4. ส่งข้อมูลไปยัง Google Apps Script (Google Sheets 1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E & Google Drive 1BF30rLUzeTA4CYNkbZq8DnyuWfiwumCH)
 */
async function saveRecordToDatabase(record) {
  // 1. ปลด ID จาก bansandab_deleted_ids ถ้ามี
  try {
    const delRaw = localStorage.getItem('bansandab_deleted_ids');
    if (delRaw) {
      let delList = JSON.parse(delRaw);
      if (Array.isArray(delList)) {
        delList = delList.filter(did => did !== record.id);
        localStorage.setItem('bansandab_deleted_ids', JSON.stringify(delList));
      }
    }
  } catch (e) { }

  // 2. บันทึกลง Local Cache ทันที
  saveToLocalHistory(record);

  // 3. บันทึกลง Server Database API (database_history.json บนเครื่อง/เซิร์ฟเวอร์)
  try {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(record)
    });
  } catch (err) {
    console.log('Server /api/history not reachable, kept in persistent local storage');
  }

  // 4. ส่งข้อมูลไปยัง Google Sheets Web App
  const sent = await sendToGoogleAppsScript(record);
  return sent;
}

/**
 * ซิงค์และดึงข้อมูลล่าสุดทั้งหมดจากฐานข้อมูลกลาง Google Sheets และประวัติการนิเทศ
 * สามารถกดเรียกใช้ได้จากปุ่ม "🔄 ดึงข้อมูลจากฐานข้อมูล" บน Top Action Bar
 */
async function syncAllDataNow(showToastNotice = true) {
  if (showToastNotice) {
    showToast('⏳ กำลังดึงข้อมูลล่าสุดจากฐานข้อมูล Google Sheets...', 'info');
  }

  try {
    // 1. ดึงข้อมูลครูและนักเรียนจากฐานข้อมูลกลาง
    await loadCentralData(false);

    // 2. ดึงข้อมูลประวัติการนิเทศจากฐานข้อมูล
    const dbRecords = await loadHistoryFromDatabase(false);

    // 3. ซิงค์ค่าในฟอร์มปัจจุบันหากมีการเลือกครูไว้
    const f1Select = document.getElementById('f1-teacher-select');
    if (f1Select && f1Select.value) {
      onTeacherSelectedForm1(f1Select.value);
    }
    const f2Select = document.getElementById('f2-teacher-select');
    if (f2Select && f2Select.value) {
      onTeacherSelectedForm2(f2Select.value);
    }

    if (showToastNotice) {
      const historyCount = dbRecords ? dbRecords.length : 0;
      showToast(`✅ ดึงข้อมูลสำเร็จ: ครู ${teachersData.length} ท่าน, นักเรียน ${studentsData.length} คน, ประวัติ ${historyCount} รายการ`, 'success');
    }
  } catch (err) {
    console.error('Error syncing all data:', err);
    if (showToastNotice) {
      showToast('เกิดข้อผิดพลาดในการดึงข้อมูล กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'error');
    }
  }
}

let isLoadingHistory = false;

/**
 * ดึงข้อมูลประวัติการนิเทศทั้งหมดจากฐานข้อมูล
 * ดึงจากฐานข้อมูลระบบ (/api/history), Google Sheet (1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E), และ Persistent Storage
 * ข้อมูลจะต้องคงอยู่ตลอดไป ยกเว้นผู้ใช้กดลบ
 */
async function loadHistoryFromDatabase(showToastNotice = false) {
  if (isLoadingHistory) {
    return;
  }
  isLoadingHistory = true;

  try {
    const totalLabel = document.getElementById('history-total-label');
    if (totalLabel && showToastNotice) {
      totalLabel.innerHTML = '⏳ <em>กำลังดึงข้อมูลจากฐานข้อมูล...</em>';
    }

    // ดึงรายการที่ผู้ใช้เคยเจาะจงกดลบไว้ เพื่อไม่ให้นำกลับมาแสดงอีก
    let deletedIds = [];
    try {
      const delRaw = localStorage.getItem('bansandab_deleted_ids');
      if (delRaw) {
        const parsed = JSON.parse(delRaw);
        if (Array.isArray(parsed)) deletedIds = parsed;
      }
    } catch (e) { }

    // รายการรหัสข้อมูลจำลองตัวอย่าง (Mock Data) ต้องถูกตัดทิ้ง ไม่นำมาแสดงผลโดยเด็ดขาด (แสดงเฉพาะข้อมูลจริงในฐานข้อมูลเท่านั้น)
    const FORBIDDEN_MOCK_IDS = ['f1_1749901001001', 'f2_1749901002002'];

    // เคลียร์ข้อมูลจำลองที่อาจหลงเหลือใน LocalStorage ทันที
    try {
      const rawLocal = localStorage.getItem(CONFIG.historyStorageKey);
      if (rawLocal) {
        const parsedLocal = JSON.parse(rawLocal);
        if (Array.isArray(parsedLocal)) {
          const cleanedLocal = parsedLocal.filter(item => item && !FORBIDDEN_MOCK_IDS.includes(item.id));
          if (cleanedLocal.length !== parsedLocal.length) {
            localStorage.setItem(CONFIG.historyStorageKey, JSON.stringify(cleanedLocal));
          }
        }
      }
    } catch (e) { }

    let allRawRecords = [];

    // 1. ดึงจากฐานข้อมูลระบบ Local Server Database (/api/history -> database_history.json)
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        let serverData = await res.json();
        if (serverData) {
          if (!Array.isArray(serverData)) serverData = [serverData];
          serverData.forEach(item => {
            if (item && item.id && !deletedIds.includes(item.id) && !FORBIDDEN_MOCK_IDS.includes(item.id)) {
              allRawRecords.push(item);
            }
          });
        }
      }
    } catch (e) {
      console.log('/api/history unavailable or offline, continuing to check storage and sheets');
    }

    // 2. ดึงจาก Google Sheet (ID: 1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E)
    try {
      const gsRecords = await fetchHistoryFromGoogleSheet();
      if (gsRecords && gsRecords.length > 0) {
        gsRecords.forEach(gr => {
          if (gr && gr.id && !deletedIds.includes(gr.id) && !FORBIDDEN_MOCK_IDS.includes(gr.id)) {
            allRawRecords.push(gr);
          }
        });
      }
    } catch (e) {
      console.warn('Google Sheet fetch error:', e);
    }

    // 3. ผสานกับ Local Storage (เพื่อให้ข้อมูลที่บันทึกจริงคงอยู่)
    try {
      const raw = localStorage.getItem(CONFIG.historyStorageKey);
      if (raw) {
        const localList = JSON.parse(raw);
        if (Array.isArray(localList)) {
          localList.forEach(lr => {
            if (lr && lr.id && !deletedIds.includes(lr.id) && !FORBIDDEN_MOCK_IDS.includes(lr.id)) {
              allRawRecords.push(lr);
            }
          });
        }
      }
    } catch (e) { }

    // 4. กรองและตัดรายการซ้ำซ้อนออกทั้งหมด ให้เหลือเฉพาะข้อมูลจริง 1 รายการต่อการประเมิน (ไม่สร้างข้อมูลเกินจริง)
    let dbRecords = deduplicateRecordList(allRawRecords);

    // 5. บันทึกสำเนาที่ตัดซ้ำแล้วลง Local Storage เพื่อให้คงอยู่เสมอ
    localStorage.setItem(CONFIG.historyStorageKey, JSON.stringify(dbRecords));

    // 6. แสดงผลลงในตารางประวัติการนิเทศ
    renderHistoryTable(dbRecords);

    if (showToastNotice) {
      if (dbRecords.length > 0) {
        showToast(`ดึงข้อมูลจากฐานข้อมูลสำเร็จ (พบ ${dbRecords.length} รายการ)`, 'success');
      } else {
        showToast('ยังไม่พบข้อมูลประวัติการนิเทศในฐานข้อมูล คุณสามารถเริ่มบันทึกการประเมินได้จากแบบฟอร์ม', 'info');
      }
    }

    return dbRecords;
  } finally {
    isLoadingHistory = false;
  }
}

/**
 * ดึงข้อมูลประวัติจาก Google Sheet (ID: 1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E)
 */
async function fetchHistoryFromGoogleSheet() {
  const records = [];
  const sheetId = CONFIG.supervisionSheetId;
  const webAppUrl = localStorage.getItem(CONFIG.webAppUrlKey) || CONFIG.defaultWebAppUrl;

  // ก. ถ้ามี Web App URL ลองดึงผ่าน action=getHistory ก่อน
  if (webAppUrl) {
    try {
      const waRes = await fetch(`${webAppUrl}?action=getHistory`);
      if (waRes.ok) {
        const waData = await waRes.json();
        if (Array.isArray(waData) && waData.length > 0) {
          return waData.map(item => ({
            ...item,
            timestamp: formatThaiTimestampDisplay(item.timestamp)
          }));
        }
      }
    } catch (e) { }
  }

  // ข. ดึงผ่าน Google Visualization API (GViz) จากแท็บ บันทึกแบบสังเกตชั้นเรียน และ บันทึกแบบประเมินตนเอง
  const sheetConfigs = [
    { name: 'บันทึกแบบสังเกตชั้นเรียน', type: 'form1' },
    { name: 'บันทึกแบบประเมินตนเอง', type: 'form2' }
  ];

  for (const sc of sheetConfigs) {
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sc.name)}`;
      const res = await fetch(gvizUrl);
      if (res.ok) {
        const text = await res.text();
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonStr);

        if (data && data.table && data.table.rows && data.table.rows.length > 0) {
          data.table.rows.forEach((r, idx) => {
            const parsed = parseGvizRow(r, sc.type, idx);
            if (parsed) records.push(parsed);
          });
        }
      }
    } catch (e) { }
  }

  return records;
}

/**
 * แปลงแถวข้อมูลจาก Google Sheet (gviz) มาเป็น Object รายการประวัติ
 */
function parseGvizRow(row, formType, idx) {
  function val(i) {
    if (!row || !row.c || !row.c[i]) return '';
    const cell = row.c[i];
    if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
    if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
    return '';
  }

  if (formType === 'form1') {
    const teacher = val(5);
    if (!teacher || teacher.includes('ชื่อผู้สอน')) return null;
    const scores = {};
    for (let s = 1; s <= 24; s++) {
      scores[s] = Number(val(11 + s)) || 0;
    }
    const totalScore = Number(val(36)) || 0;
    const rMatch = String(val(1) || '').match(/\d+/);
    const rNum = rMatch ? rMatch[0] : '1';
    const cleanTeacher = teacher.trim().replace(/\s+/g, '_');
    return {
      id: `f1_r${rNum}_${cleanTeacher}`,
      round: Number(rNum),
      timestamp: formatThaiTimestampDisplay(val(0)) || getFormattedCurrentTimestamp(),
      roundName: val(1) || `ครั้งที่ ${rNum} ตนเอง`,
      roundShort: val(1) || `ครั้งที่ ${rNum}`,
      type: 'แบบสังเกตชั้นเรียน',
      formType: 'form1',
      year: val(2) || '2569',
      term: val(3) || '1',
      date: val(4),
      teacherName: teacher,
      grade: val(6),
      subject: val(7),
      subjectCode: val(8),
      period: val(9),
      unit: val(10),
      observerName: val(11),
      scores: scores,
      totalScore: totalScore,
      percentage: val(37),
      scoreDisplay: `${totalScore} / 96`,
      quality: val(38) || 'พอใช้',
      recommendation: val(39),
      fileUrl: val(40)
    };
  } else {
    const teacher = val(6);
    if (!teacher || teacher.includes('ชื่อผู้รับการนิเทศ')) return null;
    const scores = {};
    for (let s = 1; s <= 14; s++) {
      scores[s] = Number(val(9 + s)) || 0;
    }
    const totalScore = Number(val(24)) || 0;
    const avg = val(25) || (totalScore / 14).toFixed(2);
    const rMatch = String(val(1) || '').match(/\d+/);
    const rNum = rMatch ? rMatch[0] : '1';
    const cleanTeacher = teacher.trim().replace(/\s+/g, '_');
    return {
      id: `f2_r${rNum}_${cleanTeacher}`,
      round: Number(rNum),
      timestamp: formatThaiTimestampDisplay(val(0)) || getFormattedCurrentTimestamp(),
      roundName: val(1) || `ครั้งที่ ${rNum} ตนเอง`,
      roundShort: val(1) || `ครั้งที่ ${rNum}`,
      type: 'แบบประเมินตนเอง นิเทศ',
      formType: 'form2',
      year: val(2) || '2569',
      term: val(3) || '1',
      date: val(4),
      time: val(5),
      teacherName: teacher,
      grade: val(7),
      room: val(8),
      supervisor: val(9),
      scores: scores,
      totalScore: totalScore,
      average: avg,
      scoreDisplay: `${totalScore} (เฉลี่ย ${avg})`,
      quality: val(26) || 'พอใช้',
      recommendation: val(27),
      fileUrl: val(28)
    };
  }
}

/**
 * Send to Google Apps Script Web App
 */
async function sendToGoogleAppsScript(record) {
  const webAppUrl = localStorage.getItem(CONFIG.webAppUrlKey) || CONFIG.defaultWebAppUrl;
  if (!webAppUrl) {
    console.log('No Google Apps Script Web App URL configured. Saved to local/server database.');
    showToast('⚠️ บันทึกในเครื่องแล้ว (ยังไม่ได้ส่งขึ้น Google Sheet เนื่องจากยังไม่ได้ตั้งค่า Web App URL)', 'info');
    return false;
  }

  try {
    showToast('กำลังส่งข้อมูลไปยัง Google Sheets และ Google Drive...', 'info');
    await fetch(webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record)
    });
    showToast('✅ ส่งข้อมูลไปยัง Google Sheet & Google Drive สำเร็จ', 'success');
    return true;
  } catch (err) {
    console.error('Error posting to Google Apps Script:', err);
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Web App Google Sheet', 'error');
    return false;
  }
}

/**
 * Render History Table (ประวัติการนิเทศชั้นเรียน)
 * ข้อมูลในตารางต้องอยู่ในบรรทัดเดียวกันในแต่ละรายการ
 * โดยแสดง: ลำดับ, วัน/เวลา, ผู้รับการประเมิน, ประเภทแบบนิเทศ, คะแนนรวม/เฉลี่ย, ระดับคุณภาพ, การจัดการ (ปุ่ม ดูผลลัพธ์, ลบ)
 */
function renderHistoryTable(dataList) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  const searchInput = document.getElementById('history-search');
  const search = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let history = dataList;
  if (!history || !Array.isArray(history)) {
    try {
      const raw = localStorage.getItem(CONFIG.historyStorageKey);
      history = raw ? JSON.parse(raw) : [];
    } catch (e) {
      history = [];
    }
  }
  history = (history || []).filter(h => h && h.id && !['f1_1749901001001', 'f2_1749901002002'].includes(h.id));

  const badge = document.getElementById('history-count-badge');
  if (badge) badge.textContent = history.length;

  const filtered = history.filter(h => {
    if (!search) return true;
    return (h.teacherName && h.teacherName.toLowerCase().includes(search)) ||
           (h.type && h.type.toLowerCase().includes(search)) ||
           (h.roundName && h.roundName.toLowerCase().includes(search)) ||
           (h.grade && h.grade.toLowerCase().includes(search)) ||
           (h.subject && h.subject.toLowerCase().includes(search));
  });

  const totalLabel = document.getElementById('history-total-label');
  if (totalLabel) {
    totalLabel.innerHTML = `แสดง <strong>${filtered.length}</strong> จากทั้งหมด <strong>${history.length}</strong> รายการ (ดึงจากฐานข้อมูล)`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--slate-400); font-size:1.15rem;">
      📂 ยังไม่มีรายการประวัติการนิเทศชั้นเรียนในฐานข้อมูล<br>
      <small style="color:var(--slate-500); font-weight:normal; display:inline-block; margin-top:0.35rem;">เมื่อบันทึกข้อมูลแบบประเมินแล้ว ข้อมูลจะถูกจัดเก็บในฐานข้อมูลอย่างถาวรและดึงมาแสดงที่นี่</small>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach((item, idx) => {
    let qualityBadgeClass = 'badge-good';
    if (item.quality === 'ดีมาก') qualityBadgeClass = 'badge-excellent';
    if (item.quality === 'พอใช้') qualityBadgeClass = 'badge-fair';
    if (item.quality === 'ปรับปรุง') qualityBadgeClass = 'badge-improve';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center; font-weight:700;">${idx + 1}</td>
      <td><small style="color:var(--slate-500);">${item.timestamp}</small></td>
      <td style="font-weight:700;">${item.teacherName}</td>
      <td><strong>${item.type}</strong> <small style="color:var(--primary-dark); font-weight:600;">(${item.roundShort || 'ครั้งที่ ' + (item.round || 1)})</small></td>
      <td style="text-align:center; font-weight:800; color:var(--primary-darker);">${item.scoreDisplay}</td>
      <td style="text-align:center;"><span class="stat-badge-quality ${qualityBadgeClass}" style="font-size:0.95rem; padding:0.2rem 0.65rem;">${item.quality}</span></td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn btn-warning btn-edit" style="padding:0.25rem 0.65rem; font-size:0.9rem; margin-right:4px;" onclick="editHistoryRecord('${item.id}')" title="แก้ไขข้อมูลการนิเทศนี้">
          ✏️ แก้ไข
        </button>
        <button type="button" class="btn btn-secondary" style="padding:0.25rem 0.65rem; font-size:0.9rem; margin-right:4px;" onclick="loadRecordToView('${item.id}')" title="ดูผลลัพธ์และพิมพ์">
          👁️ ดูผลลัพธ์
        </button>
        <button type="button" class="btn btn-outline-danger" style="padding:0.25rem 0.55rem; font-size:0.9rem;" onclick="deleteHistoryRecord('${item.id}')" title="ลบรายการนี้ออกจากฐานข้อมูล">
          🗑️ ลบ
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * ลบรายการประวัติการนิเทศออกจากฐานข้อมูล (ลบเฉพาะเมื่อผู้ใช้กดปุ่มลบ)
 */
async function deleteHistoryRecord(id) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(CONFIG.historyStorageKey) || '[]');
  } catch (e) { }

  const target = history.find(item => item.id === id);
  const teacherText = target ? `ของ "${target.teacherName}" (${target.roundName || target.type})` : '';

  if (!confirm(`คุณต้องการลบรายการประวัติการนิเทศ ${teacherText} ออกจากฐานข้อมูลใช่หรือไม่?\n\n(หากกดยืนยัน ข้อมูลจะถูกลบออกจากฐานข้อมูลอย่างถาวร)`)) {
    return;
  }

  // 1. จดจำ ID ที่ถูกลบไว้ใน persistent storage เพื่อไม่ให้นำกลับมาแสดงอีก
  try {
    const delRaw = localStorage.getItem('bansandab_deleted_ids');
    const delList = delRaw ? JSON.parse(delRaw) : [];
    if (Array.isArray(delList) && !delList.includes(id)) {
      delList.push(id);
      localStorage.setItem('bansandab_deleted_ids', JSON.stringify(delList));
    }
  } catch (e) { }

  // 2. ลบออกจาก Local Persistent Storage
  history = history.filter(item => item.id !== id);
  localStorage.setItem(CONFIG.historyStorageKey, JSON.stringify(history));

  // 3. ลบออกจาก Local Server Database (/api/history)
  try {
    await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) { }

  // 4. ส่งคำสั่งลบไปยัง Google Sheets ถ้าเชื่อมต่อ Web App
  const webAppUrl = localStorage.getItem(CONFIG.webAppUrlKey) || CONFIG.defaultWebAppUrl;
  if (webAppUrl && target) {
    try {
      await fetch(webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id: id,
          teacherName: target.teacherName,
          date: target.date,
          formType: target.formType
        }),
        mode: 'no-cors'
      });
    } catch (e) { }
  }

  // 5. อัปเดตตารางแสดงผลทันที
  renderHistoryTable(history);
  showToast('ลบรายการออกจากฐานข้อมูลเรียบร้อยแล้ว', 'info');
}

/**
 * เข้าสู่โหมดแก้ไขข้อมูลเดิมจากประวัติการนิเทศ
 * @param {string} id - รหัสรายการบันทึก
 */
function editHistoryRecord(id) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(CONFIG.historyStorageKey) || '[]');
  } catch (e) { }

  const record = history.find(r => r.id === id);
  if (!record) {
    showToast('ไม่พบข้อมูลรายการที่ต้องการแก้ไข', 'error');
    return;
  }

  editingRecordId = record.id;

  const targetRound = record.round || 1;
  const targetForm = record.formType === 'form2' ? 'form2' : 'form1';

  clearAllSignaturesFromForm(true);
  selectRoundAndForm(targetRound, targetForm);

  if (targetForm === 'form1') {
    populateForm1Data(record);
  } else {
    populateForm2Data(record);
  }

  updateEditModeUI(record);
  showToast(`✏️ เข้าสู่โหมดแก้ไขข้อมูลของ "${record.teacherName}" (${record.roundName || 'ครั้งที่ ' + targetRound})`, 'warning');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * กรอกข้อมูลเดิมลงในฟอร์ม 1 (แบบนิเทศสังเกตชั้นเรียน)
 */
function populateForm1Data(record) {
  if (!record) return;

  const f1Teacher = document.getElementById('f1-teacher-name');
  if (f1Teacher) f1Teacher.value = record.teacherName || '';

  const f1Select = document.getElementById('f1-teacher-select');
  if (f1Select) f1Select.value = record.teacherName || '';

  const f1Grade = document.getElementById('f1-grade');
  if (f1Grade) {
    f1Grade.value = record.grade || '';
    if (typeof syncGradePrintVal === 'function') syncGradePrintVal(record.grade || '');
  }

  const f1Subj = document.getElementById('f1-subject');
  if (f1Subj) f1Subj.value = record.subject || '';

  const f1Code = document.getElementById('f1-subject-code');
  if (f1Code) f1Code.value = record.subjectCode || '';

  const f1Term = document.getElementById('f1-term');
  if (f1Term) f1Term.value = record.term || '1';

  const f1Year = document.getElementById('f1-year');
  if (f1Year) f1Year.value = record.year || '2569';

  const f1Date = document.getElementById('f1-date');
  if (f1Date) f1Date.value = record.date || '';

  const f1Period = document.getElementById('f1-period');
  if (f1Period) f1Period.value = record.period || '';

  const f1Unit = document.getElementById('f1-unit');
  if (f1Unit) f1Unit.value = record.unit || '';

  const f1Obs = document.getElementById('f1-observer-name');
  if (f1Obs) f1Obs.value = record.observerName || '';

  const f1SigInput = document.getElementById('f1-sig-name');
  if (f1SigInput) f1SigInput.value = record.observerName || '';

  const f1Rec = document.getElementById('f1-recommendation');
  if (f1Rec) f1Rec.value = record.recommendation || '';

  const radioSelf = document.getElementById('f1_radio_self');
  const radioOther = document.getElementById('f1_radio_other');
  if (radioSelf && radioOther) {
    if (record.round === 1 || record.observerName === record.teacherName || record.observerName === 'ตนเอง') {
      radioSelf.checked = true;
    } else {
      radioOther.checked = true;
    }
  }

  for (let i = 1; i <= 24; i++) {
    delete form1Scores[i];
  }
  if (record.scores) {
    Object.keys(record.scores).forEach(key => {
      form1Scores[key] = record.scores[key];
    });
  }

  for (let i = 1; i <= 24; i++) {
    for (let s = 1; s <= 4; s++) {
      const cell = document.getElementById(`f1-cell-${i}-${s}`);
      if (cell) {
        if (form1Scores[i] === s) cell.classList.add('selected');
        else cell.classList.remove('selected');
      }
    }
  }

  // แสดงภาพลายเซ็นเฉพาะของรายการที่บันทึกแล้ว (ถ้ามี) หรือล้างออกถ้าไม่มี
  const f1SigImgData = (record.signatures && record.signatures.observerSig) || record.signature || '';
  if (f1SigImgData) {
    applySignatureImage('f1', f1SigImgData);
  } else {
    removeSignature('f1', true);
  }

  calculateForm1();
  syncAllPrintValues();
}

/**
 * กรอกข้อมูลเดิมลงในฟอร์ม 2 (แบบประเมินตนเอง นิเทศ)
 */
function populateForm2Data(record) {
  if (!record) return;

  const f2Teacher = document.getElementById('f2-teacher-name');
  if (f2Teacher) f2Teacher.value = record.teacherName || '';

  const f2Select = document.getElementById('f2-teacher-select');
  if (f2Select) f2Select.value = record.teacherName || '';

  const f2SigTeacher = document.getElementById('f2-sig-teacher');
  if (f2SigTeacher) f2SigTeacher.value = record.teacherName || '';

  const f2Grade = document.getElementById('f2-grade');
  if (f2Grade) {
    f2Grade.value = record.grade || '';
    if (typeof syncGradePrintValForm2 === 'function') syncGradePrintValForm2(record.grade || '');
  }

  const f2Room = document.getElementById('f2-room');
  if (f2Room) f2Room.value = record.room || '';

  const f2Term = document.getElementById('f2-term');
  if (f2Term) f2Term.value = record.term || '1';

  const f2Year = document.getElementById('f2-year');
  if (f2Year) f2Year.value = record.year || '2569';

  const f2Date = document.getElementById('f2-date');
  if (f2Date) f2Date.value = record.date || '';

  const f2Time = document.getElementById('f2-time');
  if (f2Time) f2Time.value = record.time || '';

  const f2Sup = document.getElementById('f2-supervisor');
  if (f2Sup) f2Sup.value = record.supervisor || '';

  const f2Rec = document.getElementById('f2-recommendation');
  if (f2Rec) f2Rec.value = record.recommendation || '';

  for (let i = 1; i <= 14; i++) {
    delete form2Scores[i];
  }
  if (record.scores) {
    Object.keys(record.scores).forEach(key => {
      form2Scores[key] = record.scores[key];
    });
  }

  for (let i = 1; i <= 14; i++) {
    for (let s = 1; s <= 5; s++) {
      const cell = document.getElementById(`f2-cell-${i}-${s}`);
      if (cell) {
        if (form2Scores[i] === s) cell.classList.add('selected');
        else cell.classList.remove('selected');
      }
    }
  }

  // แสดงภาพลายเซ็นผู้รับการนิเทศเฉพาะของรายการที่บันทึกแล้ว
  const f2TeacherSig = (record.signatures && record.signatures.teacherSig) || record.teacherSignature || '';
  if (f2TeacherSig) {
    applySignatureImage('f2-teacher', f2TeacherSig);
  } else {
    removeSignature('f2-teacher', true);
  }

  // แสดงภาพลายเซ็นผู้นิเทศเฉพาะของรายการที่บันทึกแล้ว
  const f2SupSig = (record.signatures && record.signatures.supervisorSig) || record.supervisorSignature || '';
  if (f2SupSig) {
    applySignatureImage('f2-sup', f2SupSig);
  } else {
    removeSignature('f2-sup', true);
  }

  calculateForm2();
  syncAllPrintValues();
}

/**
 * อัปเดต UI ให้อยู่ในโหมดแก้ไขข้อมูล
 */
function updateEditModeUI(record) {
  const btnSave = document.getElementById('btn-save-main');
  if (btnSave) {
    btnSave.innerHTML = '💾 บันทึกการแก้ไข';
    btnSave.classList.add('btn-warning');
  }

  const btnCancel = document.getElementById('btn-cancel-edit');
  if (btnCancel) {
    btnCancel.style.display = 'inline-flex';
  }

  const banner = document.getElementById('edit-mode-banner');
  const textEl = document.getElementById('edit-mode-text');
  if (banner) {
    banner.style.display = 'flex';
  }
  if (textEl && record) {
    const roundText = record.roundName || `ครั้งที่ ${record.round || 1}`;
    textEl.innerHTML = `<strong>กำลังอยู่ในโหมดแก้ไขข้อมูล:</strong> คุณครู ${record.teacherName || '-'} (${record.type || 'แบบประเมิน'} - ${roundText}) &nbsp;<small style="opacity:0.85;">(กด "บันทึกการแก้ไข" เพื่อบันทึกทับข้อมูลเดิม)</small>`;
  }
}

/**
 * ปิดการแสดงผลโหมดแก้ไขข้อมูล
 */
function hideEditModeUI() {
  const btnSave = document.getElementById('btn-save-main');
  if (btnSave) {
    btnSave.innerHTML = '💾 บันทึกข้อมูล';
    btnSave.classList.remove('btn-warning');
  }

  const btnCancel = document.getElementById('btn-cancel-edit');
  if (btnCancel) {
    btnCancel.style.display = 'none';
  }

  const banner = document.getElementById('edit-mode-banner');
  if (banner) {
    banner.style.display = 'none';
  }
}

/**
 * ยกเลิกการแก้ไขข้อมูลเดิม และรีเซ็ตกลับเป็นปกติ
 */
function cancelEditRecord() {
  if (editingRecordId) {
    if (confirm('คุณต้องการยกเลิกการแก้ไขข้อมูลนี้ใช่หรือไม่? การเปลี่ยนแปลงที่ยังไม่ได้บันทึกจะไม่ถูกบันทึก')) {
      editingRecordId = null;
      hideEditModeUI();
      clearAllSignaturesFromForm(true);
      window.location.reload();
    }
  } else {
    hideEditModeUI();
    clearAllSignaturesFromForm(true);
  }
}

/**
 * Load a saved record back into view for printing/reviewing
 */
function loadRecordToView(id) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(CONFIG.historyStorageKey) || '[]');
  } catch (e) { }

  const record = history.find(r => r.id === id);
  if (!record) return;

  // รีเซ็ตโหมดแก้ไขเมื่อเปิดดูเพื่อพิมพ์/ตรวจสอบ
  editingRecordId = null;
  hideEditModeUI();

  // Set Round and Form
  const targetRound = record.round || 1;
  const targetForm = record.formType === 'form2' ? 'form2' : 'form1';
  clearAllSignaturesFromForm(true);
  selectRoundAndForm(targetRound, targetForm);

  if (targetForm === 'form1') {
    populateForm1Data(record);
    showToast(`เปิดดูบันทึก (${record.roundName || 'ครั้งที่ ' + targetRound}) ของ ${record.teacherName}`, 'info');
  } else {
    populateForm2Data(record);
    showToast(`เปิดดูแบบประเมินตนเอง (${record.roundName || 'ครั้งที่ ' + targetRound}) ของ ${record.teacherName}`, 'info');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Clear All History (ปลอดภัยด้วยการยืนยันข้อความ)
 */
async function clearAllRecords() {
  const ans = prompt('⚠️ คำเตือน: ข้อมูลในฐานข้อมูลจะคงอยู่เสมอ ยกเว้นท่านต้องการลบทั้งหมดจริงๆ\nพิมพ์คำว่า "ยืนยัน" เพื่อลบประวัติทั้งหมดออกจากฐานข้อมูล:');
  if (ans === 'ยืนยัน') {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(CONFIG.historyStorageKey) || '[]');
      const delList = history.map(h => h.id).filter(Boolean);
      const existingDel = JSON.parse(localStorage.getItem('bansandab_deleted_ids') || '[]');
      const combined = Array.from(new Set([...existingDel, ...delList]));
      localStorage.setItem('bansandab_deleted_ids', JSON.stringify(combined));
    } catch (e) { }

    localStorage.removeItem(CONFIG.historyStorageKey);
    try {
      await fetch('/api/history', { method: 'DELETE' });
    } catch (e) { }
    renderHistoryTable([]);
    showToast('ลบประวัติการบันทึกทั้งหมดเรียบร้อยแล้ว', 'info');
  }
}

/**
 * Export Records to CSV
 */
function exportRecordsToCSV() {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(CONFIG.historyStorageKey) || '[]');
  } catch (e) { }

  if (history.length === 0) {
    alert('ไม่มีข้อมูลประวัติการนิเทศให้ส่งออก');
    return;
  }

  let csvContent = '\uFEFF';
  csvContent += 'วันเวลาที่บันทึก,รอบการประเมิน,ประเภทแบบนิเทศ,ชื่อครู,ระดับชั้น,วิชา/ห้อง,คะแนนรวม,ระดับคุณภาพ,ผู้นิเทศ/ผู้สังเกต,ข้อเสนอแนะ\n';

  history.forEach(item => {
    const row = [
      `"${item.timestamp || ''}"`,
      `"${item.roundName || ''}"`,
      `"${item.type || ''}"`,
      `"${item.teacherName || ''}"`,
      `"${item.grade || ''}"`,
      `"${item.subject || item.room || ''}"`,
      `"${item.scoreDisplay || ''}"`,
      `"${item.quality || ''}"`,
      `"${item.observerName || item.supervisor || ''}"`,
      `"${(item.recommendation || '').replace(/"/g, '""')}"`
    ];
    csvContent += row.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `บันทึกการนิเทศ_โรงเรียนบ้านสันดาบ_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export as Word (.doc) with pure TH SarabunPSK styling
 */
function exportDoc(formType) {
  const paperElement = document.getElementById(formType === 'form1' ? 'printable-form1' : 'printable-form2');
  if (!paperElement) return;

  const contentHtml = paperElement.innerHTML;
  const cfg = ROUNDS_CONFIG[currentRound];

  const htmlWrapper = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>เอกสารการนิเทศ โรงเรียนบ้านสันดาบ (${cfg.fullName})</title>
      <style>
        body {
          font-family: 'TH SarabunPSK', 'TH Sarabun New', sans-serif;
          font-size: 16pt;
          line-height: 1.25;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14pt;
        }
        th, td {
          border: 1px solid black;
          padding: 4px 6px;
        }
        .official-header { text-align: center; margin-bottom: 15px; }
        .official-header h2 { font-size: 18pt; margin: 0; }
        .official-header h3 { font-size: 16pt; margin: 0; }
        .school-logo-center { text-align: center; margin-bottom: 6px; }
        .school-logo-img { max-height: 80px; max-width: 120px; display: inline-block; margin: 0 auto; }
        .round-tag-official { font-weight: bold; font-size: 15pt; }
        .part-title { font-weight: bold; margin-top: 15px; margin-bottom: 5px; }
        .info-rows-container { margin-bottom: 10px; }
        .info-row { margin-bottom: 5px; }
        .info-subject-group { display: block; margin-bottom: 5px; }
        .info-subrow-subject, .info-subrow-grade { display: inline-block; }
        .info-col { display: inline-block; margin-right: 12px; }
        .info-label { font-weight: bold; }
        .teacher-dropbox, .grade-dropbox { display: none !important; }
        .print-value-display { display: inline !important; font-weight: bold; }
        input[type="text"], input[type="date"], input[type="time"] { border: none; font-family: 'TH SarabunPSK', 'TH Sarabun New', sans-serif; font-size: 16pt; }
        .check-box-indicator { font-weight: bold; text-align: center; }
        .score-cell.selected .check-box-indicator { color: black; }
        .signature-grid { margin-top: 30px; }
        .sig-line-row { margin: 15px 0 5px; font-size: 16pt; }
        .sig-dots-line { font-family: monospace; letter-spacing: 2px; }
        .signature-display-img { max-height: 55px; max-width: 200px; display: inline-block; vertical-align: middle; }
        .no-print, .btn-upload-signature, .btn-remove-sig, .sig-upload-bar, button { display: none !important; }
      </style>
    </head>
    <body>
      ${contentHtml}
    </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + htmlWrapper], {
    type: 'application/msword;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const teacher = document.getElementById(formType === 'form1' ? 'f1-teacher-name' : 'f2-teacher-name').value || 'ครู';
  const docName = formType === 'form1' ? 'แบบนิเทศสังเกตชั้นเรียน' : 'แบบประเมินตนเอง_นิเทศ';
  a.download = `${docName}_ครั้งที่${cfg.thaiNum}_${teacher}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`ส่งออกเอกสาร Word (${cfg.fullName}) สำเร็จ`, 'success');
}

/**
 * อัปเดตสถานะการตั้งค่า Google Apps Script Web App ทั้งหน้าเว็บ
 */
function updateSettingsUI() {
  const savedUrl = localStorage.getItem(CONFIG.webAppUrlKey) || CONFIG.defaultWebAppUrl || '';
  const input = document.getElementById('appscript-url-input');
  if (input && document.activeElement !== input) {
    input.value = savedUrl;
  }

  const isConnected = Boolean(savedUrl && savedUrl.startsWith('https://script.google.com/macros/s/'));

  // Sidebar badge
  const sideBadge = document.getElementById('settings-status-badge');
  if (sideBadge) {
    if (isConnected) {
      sideBadge.textContent = 'เชื่อมแล้ว ✅';
      sideBadge.style.background = '#10b981';
      sideBadge.style.color = '#ffffff';
    } else {
      sideBadge.textContent = 'ยังไม่เชื่อม';
      sideBadge.style.background = '#f43f5e';
      sideBadge.style.color = '#ffffff';
    }
  }

  // Top action bar pill
  const topPill = document.getElementById('top-sheet-status-pill');
  const topText = document.getElementById('top-sheet-status-text');
  if (topPill && topText) {
    if (isConnected) {
      topPill.className = 'top-status-pill connected';
      topText.textContent = 'Google Sheets: เชื่อมต่อแล้ว ✅';
      topPill.title = 'เชื่อมต่อ Google Apps Script Web App แล้ว (คลิกเพื่อดูการตั้งค่า)';
    } else {
      topPill.className = 'top-status-pill unconfigured';
      topText.textContent = 'Google Sheets: ยังไม่เชื่อมต่อ ⚠️';
      topPill.title = 'ยังไม่ได้ใส่ Web App URL คลิกที่นี่เพื่อตั้งค่าและเชื่อมต่อ Google Sheets';
    }
  }

  // Settings view status card
  const settingsIndicator = document.getElementById('settings-status-indicator');
  const settingsText = document.getElementById('settings-status-text');
  if (settingsIndicator && settingsText) {
    if (isConnected) {
      settingsIndicator.className = 'connection-status-pill connected';
      settingsText.textContent = 'เชื่อมต่อ Web App เรียบร้อยแล้ว ✅';
    } else {
      settingsIndicator.className = 'connection-status-pill disconnected';
      settingsText.textContent = 'ยังไม่ได้เชื่อมต่อ Web App ⚠️';
    }
  }

  // Count existing records
  const syncCountEl = document.getElementById('settings-sync-count');
  if (syncCountEl) {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(CONFIG.historyStorageKey) || '[]');
    } catch (e) { }
    syncCountEl.textContent = history.length;
  }
}

/**
 * บันทึกการตั้งค่า Web App URL
 */
function saveAppSettings() {
  const input = document.getElementById('appscript-url-input');
  if (!input) return;
  const url = input.value.trim();

  if (!url) {
    localStorage.removeItem(CONFIG.webAppUrlKey);
    updateSettingsUI();
    showToast('ล้างการตั้งค่า Web App URL เรียบร้อย', 'info');
    return;
  }

  if (!url.startsWith('https://script.google.com/macros/s/')) {
    alert('URL ของ Google Apps Script ต้องขึ้นต้นด้วย:\nhttps://script.google.com/macros/s/\n\nกรุณาตรวจสอบการคัดลอกจากหน้า New deployment อีกครั้ง');
    return;
  }

  localStorage.setItem(CONFIG.webAppUrlKey, url);
  updateSettingsUI();
  showToast('💾 บันทึกการตั้งค่า Web App URL สำเร็จ!', 'success');
}

/**
 * ล้างการตั้งค่า Web App URL
 */
function clearAppSettings() {
  if (confirm('ต้องการล้างค่า Web App URL ใช่หรือไม่?')) {
    localStorage.removeItem(CONFIG.webAppUrlKey);
    const input = document.getElementById('appscript-url-input');
    if (input) input.value = '';
    const lastTested = document.getElementById('settings-last-tested');
    if (lastTested) lastTested.textContent = 'ยังไม่ได้ทดสอบ';
    updateSettingsUI();
    showToast('ล้างการตั้งค่าเรียบร้อยแล้ว', 'info');
  }
}

/**
 * ทดสอบการเชื่อมต่อ Google Apps Script Web App
 */
async function testGoogleWebAppConnection() {
  const input = document.getElementById('appscript-url-input');
  const url = input ? input.value.trim() : (localStorage.getItem(CONFIG.webAppUrlKey) || CONFIG.defaultWebAppUrl || '');
  const lastTested = document.getElementById('settings-last-tested');

  if (!url) {
    alert('กรุณากรอก Web App URL ก่อนกดทดสอบ');
    if (input) input.focus();
    return;
  }

  showToast('⏳ กำลังทดสอบการเชื่อมต่อกับ Google Apps Script...', 'info');
  if (lastTested) lastTested.innerHTML = '⏳ <em>กำลังทดสอบ...</em>';

  try {
    const testUrl = url + (url.includes('?') ? '&' : '?') + 'action=test&_t=' + Date.now();
    const resp = await fetch(testUrl, { method: 'GET' });
    const data = await resp.json();
    if (data && data.status === 'success') {
      if (lastTested) lastTested.innerHTML = '<span style="color:#059669; font-weight:700;">✅ เชื่อมต่อสำเร็จ เมื่อ ' + new Date().toLocaleTimeString('th-TH') + '</span>';
      localStorage.setItem(CONFIG.webAppUrlKey, url);
      updateSettingsUI();
      showToast('🎉 เชื่อมต่อ Google Apps Script สำเร็จ และสร้างตารางใน Google Sheet เรียบร้อยแล้ว!', 'success');
    } else {
      if (lastTested) lastTested.innerHTML = '<span style="color:#d97706; font-weight:700;">⚠️ ได้รับการตอบกลับ: ' + (data.message || '-') + '</span>';
      showToast('ได้รับการตอบกลับ: ' + (data.message || 'สำเร็จ'), 'info');
    }
  } catch (err) {
    console.warn('Direct GET test had CORS or network error, testing no-cors ping:', err);
    try {
      await fetch(url, { method: 'GET', mode: 'no-cors' });
      if (lastTested) lastTested.innerHTML = '<span style="color:#059669; font-weight:700;">✅ เชื่อมต่อ URL สำเร็จ (เมื่อ ' + new Date().toLocaleTimeString('th-TH') + ')</span>';
      localStorage.setItem(CONFIG.webAppUrlKey, url);
      updateSettingsUI();
      showToast('✅ เชื่อมต่อ Google Apps Script Web App ได้แล้ว', 'success');
    } catch (pingErr) {
      if (lastTested) lastTested.innerHTML = '<span style="color:#e11d48; font-weight:700;">❌ ไม่สามารถเชื่อมต่อได้: ' + err.message + '</span>';
      showToast('ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบว่าเลือก Who has access เป็น Anyone หรือไม่', 'error');
    }
  }
}

/**
 * ซิงค์ประวัติการนิเทศทั้งหมดที่มีอยู่ในระบบขึ้น Google Sheet ทันที
 */
async function syncAllHistoryToGoogleSheet() {
  const webAppUrl = localStorage.getItem(CONFIG.webAppUrlKey) || CONFIG.defaultWebAppUrl;
  if (!webAppUrl) {
    alert('กรุณาใส่และบันทึก Web App URL ก่อนจึงจะสามารถซิงค์ข้อมูลขึ้น Google Sheet ได้');
    return;
  }

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(CONFIG.historyStorageKey) || '[]');
  } catch (e) { }

  if (history.length === 0) {
    try {
      const resp = await fetch('/api/history');
      if (resp.ok) {
        history = await resp.json();
      }
    } catch (e) { }
  }

  if (!history || history.length === 0) {
    alert('ขณะนี้ยังไม่มีรายการประวัติการนิเทศในระบบให้ซิงค์');
    return;
  }

  const btn = document.getElementById('btn-sync-all-to-sheet');
  const progressEl = document.getElementById('settings-sync-progress');
  if (btn) btn.disabled = true;
  if (progressEl) {
    progressEl.style.display = 'block';
    progressEl.textContent = `⏳ กำลังเริ่มซิงค์ข้อมูลทั้งหมด ${history.length} รายการขึ้น Google Sheet...`;
  }

  showToast(`⏳ กำลังเริ่มส่งข้อมูล ${history.length} รายการขึ้น Google Sheet...`, 'info');

  let successCount = 0;
  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (progressEl) {
      progressEl.textContent = `⏳ กำลังส่งรายการที่ ${i + 1} จาก ${history.length} รายการ (${item.teacherName || 'ครู'})...`;
    }
    try {
      await fetch(webAppUrl, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item)
      });
      successCount++;
    } catch (err) {
      console.error('Error syncing item:', item, err);
    }
    await new Promise(r => setTimeout(r, 600));
  }

  if (btn) btn.disabled = false;
  if (progressEl) {
    progressEl.innerHTML = `<span style="color:#059669;">🎉 ส่งข้อมูลเรียบร้อยแล้ว ${successCount} รายการ! กรุณาเปิด Google Sheet เพื่อดูตารางข้อมูล</span>`;
  }
  showToast(`🎉 ส่งข้อมูลขึ้น Google Sheet ครบ ${successCount} รายการเรียบร้อยแล้ว!`, 'success');
}

/**
 * คัดลอกโค้ด Code.gs ทั้งหมดลงคลิปบอร์ด
 */
async function copyCodeGsToClipboard() {
  try {
    let codeText = '';
    try {
      const resp = await fetch('Code.gs');
      if (resp.ok) codeText = await resp.text();
    } catch (e) { }

    if (!codeText) {
      alert('กรุณาเปิดไฟล์ Code.gs ในโฟลเดอร์ระบบเพื่อคัดลอกโค้ด');
      return;
    }

    await navigator.clipboard.writeText(codeText);
    showToast('📋 คัดลอกโค้ด Code.gs ทั้งหมดเรียบร้อยแล้ว! นำไปวางในหน้า Apps Script ได้ทันที', 'success');
  } catch (err) {
    showToast('คัดลอกไม่สำเร็จ กรุณาเปิดไฟล์ Code.gs ในโฟลเดอร์', 'error');
  }
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = '🌸';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Utility: Convert Arabic numbers to Thai Numerals
 */
function toThaiNumeral(num) {
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return String(num).split('').map(char => {
    const d = parseInt(char, 10);
    return isNaN(d) ? char : thaiDigits[d];
  }).join('');
}

function toArabicNumeral(str) {
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  let res = String(str);
  thaiDigits.forEach((td, idx) => {
    res = res.split(td).join(String(idx));
  });
  return res;
}

// Numeral system mode: 'arabic' (default as chosen by user) or 'thai'
let currentNumeralMode = 'arabic';

function formatNumber(num) {
  if (currentNumeralMode === 'arabic') {
    return String(num);
  }
  return toThaiNumeral(num);
}

/**
 * สลับรูปแบบตัวเลข (Thai numerals / Hindu-Arabic numerals)
 * @param {'thai' | 'arabic'} mode 
 */
function setNumeralMode(mode, silent = false) {
  currentNumeralMode = mode;
  
  const btnThai = document.getElementById('btn-num-thai');
  const btnArabic = document.getElementById('btn-num-arabic');
  if (btnThai && btnArabic) {
    if (mode === 'thai') {
      btnThai.classList.add('active');
      btnArabic.classList.remove('active');
    } else {
      btnArabic.classList.add('active');
      btnThai.classList.remove('active');
    }
  }

  // ปรับตัวเลขภาคเรียน / ปีการศึกษา
  const f1Term = document.getElementById('f1-term');
  const f1Year = document.getElementById('f1-year');
  const f2Term = document.getElementById('f2-term');
  const f2Year = document.getElementById('f2-year');
  if (mode === 'thai') {
    if (f1Term) f1Term.value = '๑';
    if (f1Year) f1Year.value = '๒๕๖๙';
    if (f2Term) f2Term.value = '๑';
    if (f2Year) f2Year.value = '๒๕๖๙';
  } else {
    if (f1Term) f1Term.value = '1';
    if (f1Year) f1Year.value = '2569';
    if (f2Term) f2Term.value = '1';
    if (f2Year) f2Year.value = '2569';
  }

  // อัปเดตตารางทั้ง 2 แบบฟอร์ม
  renderForm1Table();
  renderForm2Table();
  calculateForm1();
  calculateForm2();

  if (!silent) {
    showToast(`ตั้งค่ารูปแบบตัวเลข: ${mode === 'thai' ? 'ตัวเลขไทย (๑, ๒, ๓)' : 'ตัวเลขฮินดูอารบิก (1, 2, 3)'}`, 'info');
  }
}

/**
 * เปิดหน้าต่างเลือกไฟล์ภาพลายเซ็น
 */
function triggerSignatureInput(target) {
  let fileInput;
  if (target === 'f1') fileInput = document.getElementById('f1-sig-file-input');
  else if (target === 'f2-teacher') fileInput = document.getElementById('f2-teacher-sig-file');
  else if (target === 'f2-sup') fileInput = document.getElementById('f2-sup-sig-file');
  if (fileInput) fileInput.click();
}

/**
 * จัดการการแนบภาพลายเซ็น (Electronic Signature Image Upload)
 * ย่อขนาดภาพให้เหมาะสม (สูงสุด 400x150 px) เพื่อความคมชัดและประหยัดพื้นที่จัดเก็บในฐานข้อมูล
 */
function handleSignatureUpload(event, target) {
  const file = event.target.files ? event.target.files[0] : null;
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (PNG, JPG, JPEG)');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxW = 400;
      const maxH = 150;
      let w = img.width;
      let h = img.height;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const optimizedDataUrl = canvas.toDataURL('image/png');
      applySignatureImage(target, optimizedDataUrl);
      showToast('แนบภาพลายเซ็นลงในเอกสารเรียบร้อยแล้ว', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * แสดงภาพลายเซ็นในตำแหน่งลงชื่อ และซ่อนเส้นจุดไข่ปลาอย่างสมบูรณ์ (แนบลายเซ็น ต้องไม่มี .)
 */
function applySignatureImage(target, dataUrl) {
  let imgEl, previewBox, dotsEl, slotEl;
  if (target === 'f1') {
    imgEl = document.getElementById('f1-sig-img');
    previewBox = document.getElementById('f1-sig-preview');
    dotsEl = document.getElementById('f1-sig-dots');
    slotEl = document.getElementById('f1-sig-target-slot');
  } else if (target === 'f2-teacher') {
    imgEl = document.getElementById('f2-teacher-sig-img');
    previewBox = document.getElementById('f2-teacher-sig-preview');
    dotsEl = document.getElementById('f2-teacher-sig-dots');
    slotEl = document.getElementById('f2-teacher-sig-target-slot');
  } else if (target === 'f2-sup') {
    imgEl = document.getElementById('f2-sup-sig-img');
    previewBox = document.getElementById('f2-sup-sig-preview');
    dotsEl = document.getElementById('f2-sup-sig-dots');
    slotEl = document.getElementById('f2-sup-sig-target-slot');
  }

  if (imgEl && previewBox) {
    imgEl.src = dataUrl;
    previewBox.style.display = 'inline-flex';
    if (dotsEl) {
      dotsEl.style.display = 'none';
      dotsEl.classList.add('hide-sig-dots');
    }
    if (slotEl) {
      slotEl.classList.add('has-signature');
    }
  }
}

/**
 * ลบลายเซ็นออก และคืนค่าเส้นจุดไข่ปลา
 * @param {string} target - 'f1', 'f2-teacher', 'f2-sup'
 * @param {boolean} silent - หากเป็น true จะไม่แสดง Toast (ใช้สำหรับการรีเซ็ตระบบ)
 */
function removeSignature(target, silent = false) {
  let imgEl, previewBox, dotsEl, slotEl, fileInput;
  if (target === 'f1') {
    imgEl = document.getElementById('f1-sig-img');
    previewBox = document.getElementById('f1-sig-preview');
    dotsEl = document.getElementById('f1-sig-dots');
    slotEl = document.getElementById('f1-sig-target-slot');
    fileInput = document.getElementById('f1-sig-file-input');
  } else if (target === 'f2-teacher') {
    imgEl = document.getElementById('f2-teacher-sig-img');
    previewBox = document.getElementById('f2-teacher-sig-preview');
    dotsEl = document.getElementById('f2-teacher-sig-dots');
    slotEl = document.getElementById('f2-teacher-sig-target-slot');
    fileInput = document.getElementById('f2-teacher-sig-file');
  } else if (target === 'f2-sup') {
    imgEl = document.getElementById('f2-sup-sig-img');
    previewBox = document.getElementById('f2-sup-sig-preview');
    dotsEl = document.getElementById('f2-sup-sig-dots');
    slotEl = document.getElementById('f2-sup-sig-target-slot');
    fileInput = document.getElementById('f2-sup-sig-file');
  }

  if (imgEl) imgEl.src = '';
  if (previewBox) previewBox.style.display = 'none';
  if (dotsEl) {
    dotsEl.style.display = 'inline';
    dotsEl.classList.remove('hide-sig-dots');
  }
  if (slotEl) {
    slotEl.classList.remove('has-signature');
  }
  if (fileInput) fileInput.value = '';
  try {
    localStorage.removeItem(`bansandab_sig_${target}`);
  } catch (err) { }
  if (!silent) {
    showToast('ลบภาพลายเซ็นออกแล้ว', 'info');
  }
}

/**
 * ล้างลายเซ็นทั้งหมดออกจากแบบฟอร์ม เพื่อให้แบบฟอร์มใหม่ว่างเปล่าเสมอ
 */
function clearAllSignaturesFromForm(silent = true) {
  ['f1', 'f2-teacher', 'f2-sup'].forEach(target => {
    removeSignature(target, silent);
  });
  try {
    localStorage.removeItem('bansandab_sig_f1');
    localStorage.removeItem('bansandab_sig_f2-teacher');
    localStorage.removeItem('bansandab_sig_f2-sup');
  } catch (err) { }
}
