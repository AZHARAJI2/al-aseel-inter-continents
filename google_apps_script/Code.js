/**
 * مجموعة الأصيل بين القارات - محرك المساعد الذكي وإدارة جداول Google Sheets (Secured, Deduplicated & Resilient)
 * Al-Aseel Intercontinental Group - Smart Google Sheets API & AI Bridge
 */

// قراءة المفتاح السري من Script Properties مع دعم المفتاح الافتراضي لضمان استقرار العمل
const SCRIPT_SECRET = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
const DEFAULT_SECRET = 'alaseel_secret_2026';

// قائمة بالأعمدة المعتمدة لكل ورقة
const SHEET_SCHEMAS = {
  'الباقات': ['اسم الباقة', 'الوجهة', 'السعر', 'المدة', 'الوصف', 'يشمل', 'رابط الصورة', 'نشط؟'],
  'الأخبار': ['العنوان', 'النص', 'رابط الصورة', 'تاريخ النشر', 'نشط؟'],
  'الصور': ['رابط الصورة', 'الوصف'],
  'الفيديو': ['رابط اليوتيوب', 'العنوان', 'نشط؟'],
  'المتطلبات': ['نوع الخدمة', 'اسم التبويب', 'السعر', 'الوصف', 'المتطلبات', 'ملاحظات', 'نشط؟'],
  'جوازات': ['رقم الجواز', 'اسم العميل', 'الحالة', 'آخر تحديث'],
  'الشات بوت': ['القسم', 'الموضوع / الخدمة', 'التفاصيل والتعليمات والأسعار', 'نشط؟']
};

/**
 * دالة استقبال الطلبات البرمجية (POST)
 */
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let postData = {};

    // 1. استخراج البيانات من معاملات الرابط (URL parameters)
    if (e && e.parameter) {
      if (e.parameter.payload) {
        try {
          const parsed = JSON.parse(e.parameter.payload);
          if (parsed.action && (parsed.secret || parsed.authKey)) {
            postData = parsed;
          } else {
            postData = {
              action: e.parameter.action || 'EXECUTE_ACTION',
              secret: e.parameter.secret || e.parameter.authKey,
              payload: parsed
            };
          }
        } catch (pErr) {
          postData.payload = e.parameter.payload;
        }
      }

      if (!postData.action && e.parameter.action) {
        postData.action = e.parameter.action;
        postData.secret = e.parameter.secret || e.parameter.authKey;
        if (e.parameter.sheetName) postData.sheetName = e.parameter.sheetName;
        if (e.parameter.rowIndex) postData.rowIndex = e.parameter.rowIndex;
      }
    }

    // 2. استخراج البيانات من جسم الطلب (JSON Body)
    if ((!postData.action || !postData.secret) && e && e.postData && e.postData.contents) {
      try {
        const fromBody = JSON.parse(e.postData.contents);
        postData = Object.assign({}, postData, fromBody);
      } catch (err) {}
    }

    const authKey = postData.secret || postData.authKey || (e && e.parameter && (e.parameter.secret || e.parameter.authKey));

    // التحقق المرن والآمن من المفتاح السري
    if (SCRIPT_SECRET && SCRIPT_SECRET.trim().length > 0) {
      const cleanKey = (authKey || '').toString().trim();
      if (cleanKey !== SCRIPT_SECRET.trim() && cleanKey !== DEFAULT_SECRET) {
        return responseJSON({
          success: false,
          error: 'غير مصرح - مفتاح الحماية غير متطابق. يرجى التأكد من تطابق ADMIN_SECRET.'
        }, 401);
      }
    }

    const action = postData.action || 'EXECUTE_ACTION';

    switch (action) {
      case 'GET_DATA':
        return handleGetData(ss, postData);

      case 'EXECUTE_ACTION':
        let payload = postData.payload;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch (pErr) {}
        }
        if (!payload && (postData.targetSheet || postData.data)) {
          payload = postData;
        }
        return handleExecuteAction(ss, payload);

      case 'ADD_ROW':
        return handleAddRow(ss, postData.sheetName, postData.rowData);

      case 'UPDATE_ROW':
        return handleUpdateRow(ss, postData.sheetName, postData.rowIndex, postData.rowData);

      case 'DELETE_ROW':
        return handleDeleteRow(ss, postData.sheetName, postData.rowIndex);

      default:
        return responseJSON({ success: false, error: 'نوع العملية غير معروف: ' + action });
    }

  } catch (err) {
    return responseJSON({ success: false, error: 'خطأ في معالجة الطلب: ' + err.toString() }, 500);
  }
}

/**
 * دالة استقبال الطلبات البرمجية (GET)
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. استعلام التتبع الآمن
    if (e && e.parameter && e.parameter.passport) {
      return handlePassportLookup(ss, e.parameter.passport);
    }

    // 2. إذا كان الطلب استعلام بيانات
    if (e && e.parameter && (e.parameter.action === 'GET_DATA' || e.parameter.sheetName)) {
      return handleGetData(ss, e.parameter);
    }

    // 3. حظر تنفيذ التعديل أو الحذف عبر GET
    if (e && e.parameter && (e.parameter.action === 'EXECUTE_ACTION' || e.parameter.action === 'DELETE_ROW')) {
      return responseJSON({
        success: false,
        error: 'خطأ: عمليات التعديل والحذف تتطلب إرسال POST مصادق عليه.'
      }, 405);
    }

    return responseJSON({
      status: 'online',
      message: 'Al-Aseel Google Sheets Engine is running securely.',
      supportedSheets: Object.keys(SHEET_SCHEMAS)
    });
  } catch (err) {
    return responseJSON({ success: false, error: 'خطأ: ' + err.toString() }, 500);
  }
}

/**
 * البحث الذكي عن ورقة العمل المناسبة بالاسم أو المرادفات
 */
function findSheetSmart(ss, targetName) {
  if (!targetName) return null;
  
  // 1. مطابقة مباشرة
  let sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;

  // 2. مطابقة بعد التنظيف
  const normTarget = normalizeKey(targetName);
  const allSheets = ss.getSheets();

  for (const s of allSheets) {
    if (normalizeKey(s.getName()) === normTarget) {
      return s;
    }
  }

  // 3. مطابقة بالمرادفات
  const aliases = {
    'الباقات': ['باقات', 'عروض', 'رحلات', 'packages', 'فيز', 'فيزا', 'تأشيرات'],
    'المتطلبات': ['متطلبات', 'خدمات', 'شروط', 'وثائق', 'requirements'],
    'جوازات': ['جواز', 'معاملات', 'تتبع', 'passports', 'passport'],
    'الاخبار': ['اخبار', 'أخبار', 'news'],
    'الصور': ['صور', 'معرض', 'gallery', 'photos'],
    'الفيديو': ['فيديو', 'يوتيوب', 'videos'],
    'الشات_بوت': ['شات_بوت', 'شات', 'بوت', 'chatbot']
  };

  for (const [canonical, aliasList] of Object.entries(aliases)) {
    if (normTarget === normalizeKey(canonical) || aliasList.includes(normTarget)) {
      for (const s of allSheets) {
        const sNorm = normalizeKey(s.getName());
        if (sNorm === normalizeKey(canonical) || aliasList.some(a => sNorm === normalizeKey(a))) {
          return s;
        }
      }
    }
  }

  return null;
}

/**
 * البحث الآمن عن رقم جواز محدد
 */
function handlePassportLookup(ss, rawPassport) {
  if (!rawPassport) {
    return responseJSON({ found: false, error: 'الرجاء إدخال رقم الجواز' });
  }

  const sheet = findSheetSmart(ss, 'جوازات');
  if (!sheet) {
    return responseJSON({ found: false, error: 'جدول الجوازات غير موجود في ملف الشيت' });
  }

  const rows = getSheetRows(sheet);
  const normalizePass = function(s) {
    if (s == null) return '';
    const arDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    let str = String(s).trim();
    for (let i = 0; i < 10; i++) str = str.split(arDigits[i]).join(String(i));
    return str.replace(/[\s\-_/\\.,:;#]/g, '').toLowerCase();
  };

  const target = normalizePass(rawPassport);
  const targetNoZeros = target.replace(/^0+/, '');

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let isMatch = false;
    let foundPassport = '';

    for (const [key, val] of Object.entries(r)) {
      if (key === '_rowIndex') continue;
      const cleanVal = normalizePass(val);
      if (cleanVal && (cleanVal === target || (targetNoZeros && cleanVal.replace(/^0+/, '') === targetNoZeros))) {
        isMatch = true;
        foundPassport = val;
        break;
      }
    }

    if (isMatch) {
      let clientName = '';
      let status = 'قيد المعالجة';
      let lastUpdate = '';

      for (const [key, val] of Object.entries(r)) {
        if (key === '_rowIndex') continue;
        const normKey = normalizeKey(key);
        if (normKey.includes('عميل') || normKey.includes('اسم') || normKey.includes('مواطن') || normKey.includes('name')) {
          clientName = val;
        } else if (normKey.includes('حاله') || normKey.includes('status')) {
          status = val;
        } else if (normKey.includes('تحديث') || normKey.includes('تاريخ') || normKey.includes('update')) {
          lastUpdate = val;
        }
      }

      return responseJSON({
        found: true,
        passport: foundPassport || rawPassport,
        name: clientName,
        status: status || 'قيد المعالجة',
        lastUpdate: lastUpdate
      });
    }
  }

  return responseJSON({
    found: false,
    message: 'لم يتم العثور على معاملة بهذا الرقم. تأكد من صحة رقم الجواز أو تواصل مع الفرع.'
  });
}

/**
 * جلب بيانات ورقة معينة
 */
function handleGetData(ss, params) {
  const targetSheetName = params.sheetName;
  if (targetSheetName) {
    const sheet = findSheetSmart(ss, targetSheetName);
    if (!sheet) return responseJSON({ success: false, error: 'الورقة غير موجودة: ' + targetSheetName });
    const data = getSheetRows(sheet);
    return responseJSON({ success: true, sheetName: sheet.getName(), data: data });
  }

  const allData = {};
  for (const sheetName of Object.keys(SHEET_SCHEMAS)) {
    const sheet = findSheetSmart(ss, sheetName);
    if (sheet) {
      allData[sheetName] = getSheetRows(sheet);
    } else {
      allData[sheetName] = [];
    }
  }

  return responseJSON({ success: true, allData: allData });
}

/**
 * تنفيذ الأمر المهيكل الصادر من الذكاء الاصطناعي مع منع التكرار والحذف المرن
 */
function handleExecuteAction(ss, payload) {
  if (!payload || !payload.targetSheet) {
    return responseJSON({ success: false, error: 'بيانات الأمر غير مكتملة (حقل targetSheet مفقود).' });
  }

  const sheetName = payload.targetSheet;
  let sheet = findSheetSmart(ss, sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = SHEET_SCHEMAS[sheetName] || Object.keys(payload.data || {});
    if (headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0a192f').setFontColor('#ffffff');
    }
  }

  const opType = (payload.operation || payload.action || 'INSERT').toUpperCase();
  let headers = getSheetHeaders(sheet);
  if (headers.length === 0) {
    headers = SHEET_SCHEMAS[sheetName] || [];
    if (headers.length > 0) {
      sheet.appendRow(headers);
    }
  }

  let dataObj = {};
  
  if (payload.data && typeof payload.data === 'object' && Object.keys(payload.data).length > 0) {
    dataObj = payload.data;
  } else if (payload.data && typeof payload.data === 'string') {
    try { dataObj = JSON.parse(payload.data); } catch(e) {}
  } else if (payload.rowData && typeof payload.rowData === 'object') {
    dataObj = payload.rowData;
  } else if (payload.fields && typeof payload.fields === 'object') {
    dataObj = payload.fields;
  }
  
  if (Object.keys(dataObj).length === 0 && opType !== 'DELETE') {
    const metaKeys = ['targetSheet', 'operation', 'action', 'explanation', 'matchColumn', 'matchValue', 'data', 'rowData', 'fields', 'secret', 'authKey'];
    for (const [key, val] of Object.entries(payload)) {
      if (!metaKeys.includes(key) && val !== undefined && val !== null && val !== '') {
        dataObj[key] = val;
      }
    }
  }

  let executionMessage = '';
  let updatedRowIndex = -1;

  // 1. عملية التعديل (UPDATE)
  if (opType === 'UPDATE') {
    const matchCol = payload.matchColumn || '';
    const matchVal = (payload.matchValue || '').toString().trim().toLowerCase();

    const lastRow = sheet.getLastRow();
    let foundRowIndex = -1;

    if (lastRow >= 2 && matchVal) {
      const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      
      let colIndex = -1;
      const normMatchCol = normalizeKey(matchCol);
      for (let j = 0; j < headers.length; j++) {
        if (normalizeKey(headers[j]) === normMatchCol) {
          colIndex = j;
          break;
        }
      }

      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        if (colIndex !== -1) {
          const cellVal = (row[colIndex] || '').toString().trim().toLowerCase();
          if (cellVal.includes(matchVal) || matchVal.includes(cellVal)) {
            foundRowIndex = i + 2;
            break;
          }
        } else {
          for (let j = 0; j < row.length; j++) {
            const cellVal = (row[j] || '').toString().trim().toLowerCase();
            if (cellVal && (cellVal.includes(matchVal) || matchVal.includes(cellVal))) {
              foundRowIndex = i + 2;
              break;
            }
          }
          if (foundRowIndex !== -1) break;
        }
      }
    }

    if (foundRowIndex === -1 && lastRow >= 2) {
      foundRowIndex = lastRow;
    }

    if (foundRowIndex !== -1) {
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        const val = getValueFromDataObj(dataObj, header);
        if (val !== undefined && val !== '') {
          sheet.getRange(foundRowIndex, j + 1).setValue(val);
        }
      }
      updatedRowIndex = foundRowIndex;
      executionMessage = 'تم تعديل الصف رقم ' + foundRowIndex + ' في صفحة [' + sheet.getName() + '] بنجاح.';
    } else {
      return responseJSON({ success: false, error: 'لم يتم العثور على الصف المطلوب تعديله في صفحة [' + sheet.getName() + ']' });
    }
  }

  // 2. عملية الإضافة (INSERT) مع منع التكرار الذكي (Deduplication Check)
  else if (opType === 'INSERT') {
    const lastRow = sheet.getLastRow();
    let existingRowIndex = -1;

    let matchHeader = '';
    let matchVal = '';

    const primaryKeyCandidates = [
      'اسم الباقة', 'الوجهة',
      'رقم الجواز',
      'العنوان',
      'اسم التبويب', 'نوع الخدمة',
      'الموضوع / الخدمة', 'القسم'
    ];

    for (const cand of primaryKeyCandidates) {
      const v = getValueFromDataObj(dataObj, cand);
      if (v && v.toString().trim()) {
        matchHeader = cand;
        matchVal = v.toString().trim();
        break;
      }
    }

    if (matchVal && lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      let colIndex = -1;
      const normMatchHeader = normalizeKey(matchHeader);

      for (let j = 0; j < headers.length; j++) {
        if (normalizeKey(headers[j]) === normMatchHeader) {
          colIndex = j;
          break;
        }
      }

      const normMatchVal = normalizeKey(matchVal);

      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        if (colIndex !== -1) {
          const cellVal = normalizeKey(row[colIndex]);
          if (cellVal && (cellVal === normMatchVal || cellVal.includes(normMatchVal) || normMatchVal.includes(cellVal))) {
            existingRowIndex = i + 2;
            break;
          }
        } else {
          for (let j = 0; j < row.length; j++) {
            const cellVal = normalizeKey(row[j]);
            if (cellVal && (cellVal === normMatchVal || cellVal.includes(normMatchVal) || normMatchVal.includes(cellVal))) {
              existingRowIndex = i + 2;
              break;
            }
          }
          if (existingRowIndex !== -1) break;
        }
      }
    }

    if (existingRowIndex !== -1) {
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        const val = getValueFromDataObj(dataObj, header);
        if (val !== undefined && val !== '') {
          sheet.getRange(existingRowIndex, j + 1).setValue(val);
        }
        if (normalizeKey(header) === normalizeKey('آخر تحديث')) {
          sheet.getRange(existingRowIndex, j + 1).setValue(formatArabicDateTime(new Date()));
        }
      }
      updatedRowIndex = existingRowIndex;
      executionMessage = 'تم العثور على [' + matchVal + '] مسبقاً في صفحة [' + sheet.getName() + '] وتم تحديث بياناته بنجاح لمنع التكرار.';
    } else {
      const newRow = [];
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        let val = getValueFromDataObj(dataObj, header);
        
        if (!val && normalizeKey(header) === normalizeKey('نشط؟')) {
          val = 'نعم';
        }
        if (!val && (normalizeKey(header) === normalizeKey('تاريخ النشر') || normalizeKey(header) === normalizeKey('آخر تحديث'))) {
          val = formatArabicDateTime(new Date());
        }
        newRow.push(val);
      }

      sheet.appendRow(newRow);
      updatedRowIndex = sheet.getLastRow();
      executionMessage = 'تمت إضافة [' + (matchVal || 'عنصر جديد') + '] بنجاح إلى صفحة [' + sheet.getName() + '].';
    }
  }

  // 3. عملية الحذف الشاملة والمرنة (DELETE)
  else if (opType === 'DELETE') {
    const rawMatch = (payload.matchValue || '').toString().trim();
    const explanation = (payload.explanation || '').toString().trim();
    const userPrompt = (payload.userPrompt || payload.originalPrompt || payload.prompt || '').toString().trim();
    const combinedText = userPrompt + ' ' + rawMatch + ' ' + explanation;
    const lastRow = sheet.getLastRow();
    let deletedCount = 0;

    // أ) التحقق من أرقام الصفوف الصريحة (مثل: الصف رقم 4 و 5 أو الصف 5 أو سطر 2 و 3)
    const rowMatches = combinedText.match(/(?:صف|صفوف|الصفوف|الصف|سطر|أسطر|اسطر|رقم|أرقام|ارقام)\s*(?:رقم|ارقام|أرقام)?\s*([0-9٠-٩\s,،وand\-]+)/i) ||
                       combinedText.match(/([0-9٠-٩]+)\s*(?:من|في)?\s*(?:صفحة|جدول|تبويب|ورقة)?\s*(?:المتطلبات|الباقات|جوازات|الأخبار)/i);

    let explicitRows = [];
    if (rowMatches && (rowMatches[1] || rowMatches[0])) {
      const targetStr = rowMatches[1] || rowMatches[0];
      const arToEn = function(s) {
        const arDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
        let str = String(s);
        for (let k = 0; k < 10; k++) str = str.split(arDigits[k]).join(String(k));
        return str;
      };
      const cleanDigits = arToEn(targetStr).match(/\d+/g);
      if (cleanDigits && cleanDigits.length > 0) {
        explicitRows = cleanDigits.map(n => parseInt(n, 10)).filter(n => n >= 2 && n <= lastRow);
      }
    }

    if (explicitRows.length > 0) {
      // الحذف بالترتيب التنازلي للحفاظ على صحة أرقام الصفوف
      const sortedUniqueRows = Array.from(new Set(explicitRows)).sort((a, b) => b - a);
      for (const rNum of sortedUniqueRows) {
        if (rNum <= sheet.getLastRow()) {
          sheet.deleteRow(rNum);
          deletedCount++;
        }
      }
      if (deletedCount > 0) {
        executionMessage = 'تم حذف الصفوف رقم (' + sortedUniqueRows.reverse().join(', ') + ') من صفحة [' + sheet.getName() + '] بنجاح.';
      }
    }

    // ب) التحقق من حذف آخر صفوف (مثل: آخر صف أو آخر صفين)
    if (deletedCount === 0 && lastRow >= 2) {
      const lastRowsRegex = /(?:اخر|أخر|آخر)\s*(\d+)?\s*(?:صفوف|صف|اسطر|سطر|صفوفاً|أسطر)?/i;
      const isLastRows = lastRowsRegex.test(combinedText) || combinedText.includes('كل الصفوف');

      if (isLastRows) {
        let countToDelete = 1;
        const matchNum = combinedText.match(/(?:اخر|أخر|آخر)\s*(\d+)/i) || combinedText.match(/(\d+)\s*(?:صفوف|صف|اسطر|سطر)/i);
        if (matchNum && matchNum[1]) {
          countToDelete = parseInt(matchNum[1], 10);
        } else if (combinedText.includes('صفين') || combinedText.includes('سطرين')) {
          countToDelete = 2;
        }

        while (countToDelete > 0 && sheet.getLastRow() >= 2) {
          sheet.deleteRow(sheet.getLastRow());
          deletedCount++;
          countToDelete--;
        }

        if (deletedCount > 0) {
          executionMessage = 'تم حذف آخر ' + deletedCount + ' صف من صفحة [' + sheet.getName() + '] بنجاح.';
        }
      }
    }

    // ج) التحقق من حذف أول صف
    if (deletedCount === 0 && lastRow >= 2) {
      const isFirstRow = /(?:أول|اول|الاول|الأول)\s*(?:صف|سطر|بيانات)?/i.test(combinedText);
      if (isFirstRow) {
        sheet.deleteRow(2);
        deletedCount = 1;
        executionMessage = 'تم حذف أول صف بيانات من صفحة [' + sheet.getName() + '] بنجاح.';
      }
    }

    // د) البحث بالنص والمطابقة في كافة الخلايا
    if (deletedCount === 0 && lastRow >= 2) {
      // تنظيف النص المراد حذفه من كلمات الأمر العامة
      const cleanSearch = rawMatch
        .replace(/^(?:احذف|حذف|ازل|إزالة|امسح|مسح)\s*/i, '')
        .replace(/^(?:من\s*(?:تبويب|جدول|صفحة|ورقة)?\s*[^\s]+\s*)?/i, '')
        .replace(/(?:من\s*(?:تبويب|جدول|صفحة|ورقة)?\s*[^\s]+)/i, '')
        .trim();

      const normMatchVal = normalizeKey(cleanSearch || rawMatch);

      if (normMatchVal && normMatchVal !== normalizeKey('الباقات') && normMatchVal !== normalizeKey('المتطلبات') && normMatchVal !== normalizeKey('حذف')) {
        for (let i = lastRow; i >= 2; i--) {
          const rowVals = sheet.getRange(i, 1, 1, headers.length).getValues()[0];
          let rowMatches = false;

          for (let j = 0; j < rowVals.length; j++) {
            const cellVal = (rowVals[j] || '').toString().trim();
            const normCellVal = normalizeKey(cellVal);
            if (normCellVal && (normCellVal === normMatchVal || normCellVal.includes(normMatchVal) || normMatchVal.includes(cellVal))) {
              rowMatches = true;
              break;
            }
          }

          if (rowMatches) {
            sheet.deleteRow(i);
            deletedCount++;
          }
        }

        if (deletedCount > 0) {
          executionMessage = 'تم حذف ' + deletedCount + ' سطر يطابق "' + (cleanSearch || rawMatch) + '" من صفحة [' + sheet.getName() + '] بنجاح.';
        }
      }
    }

    if (deletedCount === 0) {
      return responseJSON({ success: false, error: 'لم يتم العثور على أي صف يطابق: "' + (rawMatch || 'الطلب') + '" في صفحة [' + sheet.getName() + ']' });
    }
  }

  return responseJSON({
    success: true,
    operation: opType,
    sheetName: sheet.getName(),
    rowIndex: updatedRowIndex,
    message: executionMessage,
    data: dataObj
  });
}

function handleAddRow(ss, sheetName, rowData) {
  return handleExecuteAction(ss, { targetSheet: sheetName, operation: 'INSERT', data: rowData });
}

function handleUpdateRow(ss, sheetName, rowIndex, rowData) {
  const sheet = findSheetSmart(ss, sheetName);
  if (!sheet) return responseJSON({ success: false, error: 'الورقة غير موجودة' });
  const headers = getSheetHeaders(sheet);
  const rIdx = parseInt(rowIndex, 10);
  if (isNaN(rIdx) || rIdx < 2 || rIdx > sheet.getLastRow()) {
    return responseJSON({ success: false, error: 'رقم الصف غير صحيح' });
  }

  for (let j = 0; j < headers.length; j++) {
    const val = getValueFromDataObj(rowData, headers[j]);
    if (val !== undefined && val !== '') {
      sheet.getRange(rIdx, j + 1).setValue(val);
    }
  }
  return responseJSON({ success: true, message: 'تم تعديل الصف رقم ' + rIdx + ' بنجاح' });
}

function handleDeleteRow(ss, sheetName, rowIndex) {
  const sheet = findSheetSmart(ss, sheetName);
  if (!sheet) return responseJSON({ success: false, error: 'الورقة غير موجودة' });
  const rIdx = parseInt(rowIndex, 10);
  if (isNaN(rIdx) || rIdx < 2 || rIdx > sheet.getLastRow()) {
    return responseJSON({ success: false, error: 'رقم الصف غير صحيح' });
  }
  sheet.deleteRow(rIdx);
  return responseJSON({ success: true, message: 'تم حذف الصف رقم ' + rIdx + ' بنجاح' });
}

function getSheetHeaders(sheet) {
  if (sheet.getLastRow() < 1) return [];
  const range = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1));
  return range.getValues()[0].map(h => (h || '').toString().trim());
}

function getValueFromDataObj(dataObj, headerName) {
  if (!dataObj || typeof dataObj !== 'object') return '';
  if (!headerName) return '';

  if (dataObj[headerName] !== undefined && dataObj[headerName] !== null) {
    return dataObj[headerName].toString();
  }

  const trimmed = headerName.trim();
  if (dataObj[trimmed] !== undefined && dataObj[trimmed] !== null) {
    return dataObj[trimmed].toString();
  }

  const normH = normalizeKey(headerName);
  for (const [k, v] of Object.entries(dataObj)) {
    if (normalizeKey(k) === normH && v !== undefined && v !== null) {
      return v.toString();
    }
  }

  const aliases = {
    'اسمالباقه': ['الباقه', 'الاسم', 'title', 'packagename', 'name', 'اسم', 'نوعالتاشيره', 'التاشيره', 'الفيزا', 'نوعالفيزا'],
    'الوجهه': ['البلد', 'الدوله', 'destination', 'country', 'المكان'],
    'السعر': ['التكلفه', 'الرسوم', 'المبلغ', 'price', 'cost'],
    'المده': ['الوقت', 'الايام', 'الفتره', 'duration', 'days'],
    'الوصف': ['التفاصيل', 'الشرح', 'المعلومات', 'description', 'details'],
    'يشمل': ['المميزات', 'المشمول', 'الخدمات', 'includes', 'included'],
    'رابطالصوره': ['الصوره', 'صوره', 'image', 'photo', 'imageurl', 'url'],
    'العنوان': ['عنوانالخبر', 'الموضوع', 'title', 'headline'],
    'النص': ['المحتوى', 'نصالخبر', 'text', 'content', 'body', 'الخبر'],
    'تاريخالنشر': ['التاريخ', 'تاريخ', 'date', 'publishedat'],
    'رابطاليوتيوب': ['رابطالفيديو', 'الفيديو', 'video', 'videourl', 'youtube'],
    'نوعالخدمه': ['القسم', 'الخدمه', 'servicetype', 'type'],
    'اسمالتبويب': ['التبويب', 'نوعالتاشيره', 'التاشيره', 'tabname', 'service'],
    'المتطلبات': ['الشروط', 'الاوراقالمطلوبه', 'الوثائق', 'requirements', 'conditions'],
    'ملاحظات': ['تنبيهات', 'ملاحظه', 'notes', 'notice'],
    'رقمالجواز': ['الجواز', 'رقموثيقهالسفر', 'passport', 'passportno'],
    'اسمالعميل': ['اسمالمواطن', 'الاسم', 'صاحبالجواز', 'clientname', 'fullname'],
    'الحاله': ['حالهالمعامله', 'status'],
    'اخرتحديث': ['اخرتعديل', 'تاريخالتحديث', 'lastupdate', 'updatedat'],
    'نشط': ['مفعل', 'active', 'status', 'isactive']
  };

  const aliasList = aliases[normH] || [];
  for (const alias of aliasList) {
    for (const [k, v] of Object.entries(dataObj)) {
      if (normalizeKey(k) === alias && v !== undefined && v !== null) {
        return v.toString();
      }
    }
  }

  return '';
}

function normalizeKey(str) {
  if (!str) return '';
  return str.toString()
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s\-_/\\?؟:،,.]/g, '');
}

function getSheetRows(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const headers = getSheetHeaders(sheet);
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const values = dataRange.getValues();

  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const rowObj = { _rowIndex: i + 2 };
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header) {
        rowObj[header] = values[i][j] !== undefined ? values[i][j].toString() : '';
      }
    }
    rows.push(rowObj);
  }
  return rows;
}

function formatArabicDateTime(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function responseJSON(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}