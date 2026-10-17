/**
 * ระบบนิเทศภายใน โรงเรียนบ้านสันดาบ สพป.สมุทรสาคร
 * Google Apps Script Backend (Code.gs)
 * รองรับการประเมิน 4 ครั้ง (1. ตนเอง, 2. เพื่อนครู, 3. หัวหน้างาน, 4. ผู้อำนวยการ)
 * 
 * กำหนดค่าการเชื่อมต่อ:
 * 1. ฐานข้อมูลกลาง (ครูและนักเรียน): 1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA
 * 2. ฐานข้อมูลระบบนิเทศชั้นเรียน: 1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E
 * 3. Google Drive Folder จัดเก็บไฟล์: 1BF30rLUzeTA4CYNkbZq8DnyuWfiwumCH
 */

var CENTRAL_SHEET_ID = '1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA';
var SUPERVISION_SHEET_ID = '1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E';
var DRIVE_FOLDER_ID = '1BF30rLUzeTA4CYNkbZq8DnyuWfiwumCH';

/**
 * Handle HTTP GET Requests
 */
function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : '';

  if (action === 'test' || action === 'init') {
    setupSupervisionSheets();
    return createJsonResponse({
      status: 'success',
      message: 'เชื่อมต่อ Google Apps Script สำเร็จ และสร้างแท็บตารางใน Google Sheet ให้เรียบร้อยแล้ว!'
    });
  } else if (action === 'getTeachers') {
    return createJsonResponse(getTeachersData());
  } else if (action === 'getStudents') {
    return createJsonResponse(getStudentsData());
  } else if (action === 'getHistory') {
    return createJsonResponse(getHistoryData());
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ระบบนิเทศภายใน โรงเรียนบ้านสันดาบ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5');
}

/**
 * Handle HTTP POST Requests (บันทึกข้อมูลจากแบบฟอร์มลง Google Sheets และสร้างไฟล์ใน Drive)
 */
function doPost(e) {
  try {
    var rawData = e.postData ? e.postData.contents : '';
    var record = JSON.parse(rawData);

    // Initialise / Verify Sheets
    setupSupervisionSheets();

    // จัดการคำสั่งลบข้อมูลออกจากฐานข้อมูล Google Sheets
    if (record.action === 'delete') {
      return createJsonResponse(deleteRecordFromSheets(record));
    }

    var ss = SpreadsheetApp.openById(SUPERVISION_SHEET_ID);

    var fileUrl = '';

    // Generate Document in Google Drive Folder (Folder ID: 1BF30rLUzeTA4CYNkbZq8DnyuWfiwumCH)
    try {
      fileUrl = createDocumentInDrive(record);
    } catch (docErr) {
      Logger.log('Error creating Drive document: ' + docErr.toString());
    }

    if (record.formType === 'form1') {
      // บันทึกแบบนิเทศสังเกตชั้นเรียน
      var sheet1 = ss.getSheetByName('บันทึกแบบสังเกตชั้นเรียน');
      var timestampVal = record.timestamp || Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
      var row = [
        timestampVal,
        record.roundName || ('ครั้งที่ ' + (record.round || 1)),
        record.year || '2569',
        record.term || '1',
        record.date || '',
        record.teacherName || '',
        record.grade || '',
        record.subject || '',
        record.subjectCode || '',
        record.period || '',
        record.unit || '',
        record.observerName || ''
      ];

      // ใส่คะแนน 24 ข้อ
      for (var i = 1; i <= 24; i++) {
        row.push(record.scores && record.scores[i] ? record.scores[i] : '');
      }

      var maxScore = 96;
      var percentage = ((record.totalScore / maxScore) * 100).toFixed(2);

      row.push(record.totalScore || 0);
      row.push(percentage + '%');
      row.push(record.quality || '');
      row.push(record.recommendation || '');
      row.push(fileUrl || '');

      // ป้องกันการบันทึกแถวซ้ำซ้อนใน Google Sheet
      var targetRound = String(record.roundName || ('ครั้งที่ ' + (record.round || 1)));
      var targetRNum = (targetRound.match(/\d+/) || ['1'])[0];
      var targetTeacher = String(record.teacherName || '').trim();
      var data1 = sheet1.getDataRange().getValues();
      var updateRowIdx1 = -1;
      for (var r1 = 1; r1 < data1.length; r1++) {
        var r1Teacher = String(data1[r1][5] || '').trim();
        var r1Round = String(data1[r1][1] || '').trim();
        var r1RNum = (r1Round.match(/\d+/) || ['1'])[0];
        if (r1Teacher === targetTeacher && r1RNum === targetRNum) {
          updateRowIdx1 = r1 + 1;
          break;
        }
      }

      if (updateRowIdx1 > 0) {
        sheet1.getRange(updateRowIdx1, 1, 1, row.length).setValues([row]);
      } else {
        sheet1.appendRow(row);
      }

    } else if (record.formType === 'form2') {
      // บันทึกแบบประเมินตนเอง นิเทศ
      var sheet2 = ss.getSheetByName('บันทึกแบบประเมินตนเอง');
      var timestampVal2 = record.timestamp || Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
      var row2 = [
        timestampVal2,
        record.roundName || ('ครั้งที่ ' + (record.round || 1)),
        record.year || '2569',
        record.term || '1',
        record.date || '',
        record.time || '',
        record.teacherName || '',
        record.grade || '',
        record.room || '',
        record.supervisor || ''
      ];

      // ใส่คะแนน 14 ข้อ
      for (var j = 1; j <= 14; j++) {
        row2.push(record.scores && record.scores[j] ? record.scores[j] : '');
      }

      row2.push(record.totalScore || 0);
      row2.push(record.average || '0.00');
      row2.push(record.quality || '');
      row2.push(record.recommendation || '');
      row2.push(fileUrl || '');

      // ป้องกันการบันทึกแถวซ้ำซ้อนใน Google Sheet
      var targetRound2 = String(record.roundName || ('ครั้งที่ ' + (record.round || 1)));
      var targetRNum2 = (targetRound2.match(/\d+/) || ['1'])[0];
      var targetTeacher2 = String(record.teacherName || '').trim();
      var data2 = sheet2.getDataRange().getValues();
      var updateRowIdx2 = -1;
      for (var r2 = 1; r2 < data2.length; r2++) {
        var r2Teacher = String(data2[r2][6] || '').trim();
        var r2Round = String(data2[r2][1] || '').trim();
        var r2RNum = (r2Round.match(/\d+/) || ['1'])[0];
        if (r2Teacher === targetTeacher2 && r2RNum === targetRNum2) {
          updateRowIdx2 = r2 + 1;
          break;
        }
      }

      if (updateRowIdx2 > 0) {
        sheet2.getRange(updateRowIdx2, 1, 1, row2.length).setValues([row2]);
      } else {
        sheet2.appendRow(row2);
      }
    }

    return createJsonResponse({
      status: 'success',
      message: 'บันทึกข้อมูลเรียบร้อยแล้ว',
      fileUrl: fileUrl
    });

  } catch (error) {
    Logger.log('doPost error: ' + error.toString());
    return createJsonResponse({
      status: 'error',
      message: error.toString()
    });
  }
}

/**
 * ดึงข้อมูลครูจากฐานข้อมูลกลาง (Sheet ID: 1jqxY-MFf26KpYpYR2J6Lq0FBOp7HS-fe58sSWAOBnsA, Tab: Teachers)
 */
function getTeachersData() {
  var ss = SpreadsheetApp.openById(CENTRAL_SHEET_ID);
  var sheet = ss.getSheetByName('Teachers');
  if (!sheet) {
    sheet = ss.getSheets()[0];
  }

  var data = sheet.getDataRange().getValues();
  var teachers = [];

  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var role = data[i][1];
    if (name) {
      teachers.push({
        name: String(name).trim(),
        role: String(role || '').trim(),
        grade: String(role || '').startsWith('อ.') || String(role || '').startsWith('ป.') ? String(role).trim() : ''
      });
    }
  }

  return teachers;
}

/**
 * ดึงข้อมูลนักเรียนจากฐานข้อมูลกลาง (Tab แรก)
 */
function getStudentsData() {
  var ss = SpreadsheetApp.openById(CENTRAL_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var students = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][4]) {
      students.push({
        year: data[i][0],
        grade: data[i][1],
        nationalId: data[i][2],
        studentCode: data[i][3],
        name: data[i][4],
        gender: data[i][5],
        birthday: data[i][6],
        status: data[i][7]
      });
    }
  }

  return students;
}

/**
 * สร้างหัวตารางใน Google Sheet 2 อัตโนมัติ (ครั้งแรก)
 */
function setupSupervisionSheets() {
  var ss = SpreadsheetApp.openById(SUPERVISION_SHEET_ID);

  // Tab 1: แบบสังเกตชั้นเรียน
  var sheet1 = ss.getSheetByName('บันทึกแบบสังเกตชั้นเรียน');
  if (!sheet1) {
    sheet1 = ss.insertSheet('บันทึกแบบสังเกตชั้นเรียน');
    var headers1 = [
      'วันเวลาที่บันทึก', 'รอบการประเมิน', 'ปีการศึกษา', 'ภาคเรียน', 'วันที่สังเกต', 'ชื่อผู้สอน',
      'ระดับชั้น', 'วิชา', 'รหัสวิชา', 'คาบเรียน', 'ชื่อหน่วยการเรียนรู้', 'ผู้สังเกต'
    ];
    for (var i = 1; i <= 24; i++) {
      headers1.push('ข้อ ' + i);
    }
    headers1.push('คะแนนรวม (เต็ม 96)');
    headers1.push('ร้อยละ');
    headers1.push('ระดับคุณภาพ');
    headers1.push('ข้อเสนอแนะ');
    headers1.push('ลิงก์ไฟล์เอกสาร Drive');

    sheet1.appendRow(headers1);
    var range1 = sheet1.getRange(1, 1, 1, headers1.length);
    range1.setBackground('#be185d').setFontColor('#ffffff').setFontWeight('bold'); // Pink theme header
    sheet1.setFrozenRows(1);
  }

  // Tab 2: แบบประเมินตนเอง
  var sheet2 = ss.getSheetByName('บันทึกแบบประเมินตนเอง');
  if (!sheet2) {
    sheet2 = ss.insertSheet('บันทึกแบบประเมินตนเอง');
    var headers2 = [
      'วันเวลาที่บันทึก', 'รอบการประเมิน', 'ปีการศึกษา', 'ภาคเรียน', 'วันที่ประเมิน', 'เวลา',
      'ชื่อผู้รับการนิเทศ', 'ระดับชั้น', 'ห้องเรียน/ห้องปฏิบัติการ', 'ผู้นิเทศ'
    ];
    for (var j = 1; j <= 14; j++) {
      headers2.push('ข้อ ' + j);
    }
    headers2.push('คะแนนรวม (เต็ม 70)');
    headers2.push('คะแนนเฉลี่ย');
    headers2.push('ระดับคุณภาพ');
    headers2.push('ข้อเสนอแนะ');
    headers2.push('ลิงก์ไฟล์เอกสาร Drive');

    sheet2.appendRow(headers2);
    var range2 = sheet2.getRange(1, 1, 1, headers2.length);
    range2.setBackground('#db2777').setFontColor('#ffffff').setFontWeight('bold'); // Pink theme header
    sheet2.setFrozenRows(1);
  }
}

/**
 * สร้างไฟล์เอกสารในโฟลเดอร์ Google Drive (Folder ID: 1BF30rLUzeTA4CYNkbZq8DnyuWfiwumCH)
 */
function createDocumentInDrive(record) {
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var roundText = record.roundName || ('ครั้งที่' + (record.round || 1));
  var docTitle = (record.type || 'การนิเทศ') + '_' + roundText + '_' + (record.teacherName || 'ครู') + '_' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd_HHmm');
  var doc = DocumentApp.create(docTitle);
  var body = doc.getBody();

  body.setMarginTop(36);
  body.setMarginBottom(36);
  body.setMarginLeft(40);
  body.setMarginRight(40);

  var title = body.appendParagraph(record.type || 'แบบนิเทศภายในสถานศึกษา');
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.setFontFamily('Sarabun').setFontSize(18).setBold(true);

  var roundP = body.appendParagraph(roundText);
  roundP.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontFamily('Sarabun').setFontSize(14).setBold(true);

  var school = body.appendParagraph('โรงเรียนบ้านสันดาบ สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร\nปีการศึกษา ' + (record.year || '2569') + ' ภาคเรียนที่ ' + (record.term || '1'));
  school.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontFamily('Sarabun').setFontSize(13);

  body.appendHorizontalRule();

  body.appendParagraph('ข้อมูลทั่วไป:').setFontFamily('Sarabun').setFontSize(14).setBold(true);
  body.appendParagraph('ชื่อครูผู้รับการนิเทศ / ผู้สอน: ' + (record.teacherName || '-') + '   ระดับชั้น: ' + (record.grade || '-')).setFontFamily('Sarabun').setFontSize(12);
  if (record.subject) {
    body.appendParagraph('วิชา: ' + record.subject + '   รหัสวิชา: ' + (record.subjectCode || '-') + '   หน่วยการเรียนรู้: ' + (record.unit || '-')).setFontFamily('Sarabun').setFontSize(12);
  }
  body.appendParagraph('วันที่ดำเนินการ: ' + (record.date || '-') + '   ผู้ประเมิน/ผู้นิเทศ: ' + (record.observerName || record.supervisor || '-')).setFontFamily('Sarabun').setFontSize(12);

  body.appendParagraph('\nสรุปผลการประเมิน:').setFontFamily('Sarabun').setFontSize(14).setBold(true);
  body.appendParagraph('คะแนนรวม: ' + (record.scoreDisplay || record.totalScore) + '   ระดับคุณภาพ: ' + (record.quality || '-')).setFontFamily('Sarabun').setFontSize(12).setBold(true);

  if (record.recommendation) {
    body.appendParagraph('\nข้อเสนอแนะ:').setFontFamily('Sarabun').setFontSize(14).setBold(true);
    body.appendParagraph(record.recommendation).setFontFamily('Sarabun').setFontSize(12);
  }

  doc.saveAndClose();

  var file = DriveApp.getFileById(doc.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  return file.getUrl();
}

/**
 * Utility: Create JSON Response
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ดึงข้อมูลประวัติการนิเทศทั้งหมดจาก Google Sheets (ฐานข้อมูลระบบนิเทศ: 1qhnHQLdlMFcbR6EMeDqkP2usOqA_yjfqKYgPFg5BK4E)
 */
function getHistoryData() {
  setupSupervisionSheets();
  var ss = SpreadsheetApp.openById(SUPERVISION_SHEET_ID);
  var history = [];

  // 1. อ่านจากแท็บ 'บันทึกแบบสังเกตชั้นเรียน'
  var sheet1 = ss.getSheetByName('บันทึกแบบสังเกตชั้นเรียน');
  if (sheet1 && sheet1.getLastRow() > 1) {
    var data1 = sheet1.getDataRange().getValues();
    for (var i = 1; i < data1.length; i++) {
      var row = data1[i];
      if (row[5]) { // ชื่อผู้สอน
        var scores1 = {};
        for (var s = 1; s <= 24; s++) {
          scores1[s] = Number(row[11 + s]) || 0;
        }
        var timestampStr = row[0] ? Utilities.formatDate(new Date(row[0]), 'GMT+7', 'dd/MM/yyyy HH:mm:ss') : '';
        var rMatch1 = String(row[1] || '1').match(/\d+/);
        var rNum1 = rMatch1 ? rMatch1[0] : '1';
        var cleanT1 = String(row[5] || '').trim().replace(/\s+/g, '_');
        var recId1 = 'f1_r' + rNum1 + '_' + cleanT1;
        history.push({
          id: recId1,
          round: Number(rNum1),
          timestamp: timestampStr,
          roundName: String(row[1] || ('ครั้งที่ ' + rNum1 + ' ตนเอง')),
          roundShort: String(row[1] || ('ครั้งที่ ' + rNum1)),
          type: 'แบบสังเกตชั้นเรียน',
          formType: 'form1',
          year: String(row[2] || '2569'),
          term: String(row[3] || '1'),
          date: row[4] ? String(row[4]) : '',
          teacherName: String(row[5] || ''),
          grade: String(row[6] || ''),
          subject: String(row[7] || ''),
          subjectCode: String(row[8] || ''),
          period: String(row[9] || ''),
          unit: String(row[10] || ''),
          observerName: String(row[11] || ''),
          scores: scores1,
          totalScore: Number(row[36]) || 0,
          percentage: String(row[37] || ''),
          scoreDisplay: (Number(row[36]) || 0) + ' / 96',
          quality: String(row[38] || 'พอใช้'),
          recommendation: String(row[39] || ''),
          fileUrl: String(row[40] || '')
        });
      }
    }
  }

  // 2. อ่านจากแท็บ 'บันทึกแบบประเมินตนเอง'
  var sheet2 = ss.getSheetByName('บันทึกแบบประเมินตนเอง');
  if (sheet2 && sheet2.getLastRow() > 1) {
    var data2 = sheet2.getDataRange().getValues();
    for (var j = 1; j < data2.length; j++) {
      var row2 = data2[j];
      if (row2[6]) { // ชื่อผู้รับการนิเทศ
        var scores2 = {};
        for (var s2 = 1; s2 <= 14; s2++) {
          scores2[s2] = Number(row2[9 + s2]) || 0;
        }
        var timestampStr2 = row2[0] ? Utilities.formatDate(new Date(row2[0]), 'GMT+7', 'dd/MM/yyyy HH:mm:ss') : '';
        var rMatch2 = String(row2[1] || '1').match(/\d+/);
        var rNum2 = rMatch2 ? rMatch2[0] : '1';
        var cleanT2 = String(row2[6] || '').trim().replace(/\s+/g, '_');
        var recId2 = 'f2_r' + rNum2 + '_' + cleanT2;
        history.push({
          id: recId2,
          round: Number(rNum2),
          timestamp: timestampStr2,
          roundName: String(row2[1] || ('ครั้งที่ ' + rNum2 + ' ตนเอง')),
          roundShort: String(row2[1] || ('ครั้งที่ ' + rNum2)),
          type: 'แบบประเมินตนเอง นิเทศ',
          formType: 'form2',
          year: String(row2[2] || '2569'),
          term: String(row2[3] || '1'),
          date: row2[4] ? String(row2[4]) : '',
          time: row2[5] ? String(row2[5]) : '',
          teacherName: String(row2[6] || ''),
          grade: String(row2[7] || ''),
          room: String(row2[8] || ''),
          supervisor: String(row2[9] || ''),
          scores: scores2,
          totalScore: Number(row2[24]) || 0,
          average: String(row2[25] || '0.00'),
          scoreDisplay: (Number(row2[24]) || 0) + ' (เฉลี่ย ' + (row2[25] || '0.00') + ')',
          quality: String(row2[26] || 'พอใช้'),
          recommendation: String(row2[27] || ''),
          fileUrl: String(row2[28] || '')
        });
      }
    }
  }

  // เรียงลำดับจากล่าสุดไปเก่าสุด
  history.sort(function(a, b) {
    return (b.id || '').localeCompare(a.id || '');
  });

  return history;
}

/**
 * ลบรายการออกจาก Google Sheets ตามคำสั่งของผู้ใช้ (ยกเว้นกดลบ)
 */
function deleteRecordFromSheets(record) {
  var ss = SpreadsheetApp.openById(SUPERVISION_SHEET_ID);
  var targetTeacher = String(record.teacherName || '').trim();
  var formType = record.formType;
  var targetRNum = (String(record.roundName || record.round || '1').match(/\d+/) || ['1'])[0];

  var sheet = formType === 'form2' ? ss.getSheetByName('บันทึกแบบประเมินตนเอง') : ss.getSheetByName('บันทึกแบบสังเกตชั้นเรียน');
  if (!sheet) return { status: 'error', message: 'Sheet not found' };

  var data = sheet.getDataRange().getValues();
  var teacherColIdx = formType === 'form2' ? 6 : 5;
  var roundColIdx = 1;

  for (var i = data.length - 1; i >= 1; i--) {
    var rowTeacher = String(data[i][teacherColIdx] || '').trim();
    var rowRound = String(data[i][roundColIdx] || '').trim();
    var rowRNum = (rowRound.match(/\d+/) || ['1'])[0];
    if (rowTeacher === targetTeacher && rowRNum === targetRNum) {
      sheet.deleteRow(i + 1);
      return { status: 'success', message: 'Deleted row ' + (i + 1) };
    }
  }

  return { status: 'not_found', message: 'Record not found in sheet' };
}

