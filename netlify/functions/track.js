// Netlify Function: /api/track
// Smart & Secure Passport Tracking Proxy

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

function isRateLimited(ip) {
  const now = Date.now();
  const userRecord = rateLimitMap.get(ip) || { count: 0, startTime: now };

  if (now - userRecord.startTime > RATE_LIMIT_WINDOW) {
    userRecord.count = 1;
    userRecord.startTime = now;
    rateLimitMap.set(ip, userRecord);
    return false;
  }

  userRecord.count += 1;
  rateLimitMap.set(ip, userRecord);
  return userRecord.count > MAX_REQUESTS_PER_WINDOW;
}

// Convert Arabic digits to Western digits and clean separators
function normalizePassport(str) {
  if (str == null) return '';
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  let clean = String(str).trim();
  for (let i = 0; i < 10; i++) {
    clean = clean.split(arabicDigits[i]).join(String(i));
  }
  return clean.replace(/[\s\-_/\\.,:;#]/g, '').toLowerCase();
}

function normalizeHeader(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s\-_]/g, '');
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const clientIp = event.headers?.['x-forwarded-for'] || event.headers?.['client-ip'] || 'unknown';

  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        found: false,
        error: 'تم تجاوز الحد المسموح من الاستعلامات. يرجى الانتظار دقيقة والمحاولة ثانية.'
      })
    };
  }

  try {
    let rawPassport = '';
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      rawPassport = params.passport || '';
    } else if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      rawPassport = body.passport || '';
    }

    const searchTarget = normalizePassport(rawPassport);
    const searchTargetNoZeros = searchTarget.replace(/^0+/, '');

    if (!searchTarget || searchTarget.length < 2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          found: false,
          error: 'الرجاء إدخال رقم جواز صحيح.'
        })
      };
    }

    const SHEET_ID = process.env.SHEET_ID || '';
    const APPS_SCRIPT_WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL || '';

    // 1. First Attempt: Apps Script Secure Tracking if configured
    if (APPS_SCRIPT_WEB_APP_URL) {
      try {
        const gasUrl = `${APPS_SCRIPT_WEB_APP_URL}?passport=${encodeURIComponent(rawPassport)}&_t=${Date.now()}`;
        const res = await fetch(gasUrl);
        if (res.ok) {
          const data = await res.json();
          if (data && data.found) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                found: true,
                passport: data.passport || rawPassport,
                name: data.name || '',
                status: data.status || 'قيد المعالجة',
                lastUpdate: data.lastUpdate || ''
              })
            };
          }
        }
      } catch (gasErr) {
        console.warn('Apps Script tracking fallback to sheet query:', gasErr.message);
      }
    }

    // 2. Direct Server-side Google Sheet Query with Smart Multi-Format Matching
    if (!SHEET_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          found: false,
          error: 'معرّف قاعدة البيانات (SHEET_ID) غير مضبوط في متغيرات البيئة.'
        })
      };
    }

    const sheetName = 'جوازات';
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    const sheetRes = await fetch(sheetUrl);

    if (!sheetRes.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          found: false,
          error: 'تعذر الاتصال بقاعدة البيانات. تأكد من إعدادات المشاركة أو صحة SHEET_ID.'
        })
      };
    }

    const text = await sheetRes.text();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ found: false, error: 'استجابة غير صالحة من قاعدة البيانات.' })
      };
    }

    const json = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
    let cols = (json.table.cols || []).map(c => (c && c.label ? String(c.label).trim() : ''));
    let rawRows = json.table.rows || [];

    // Header row resolution if labels are empty
    if (!cols.some(l => l.length > 0) && rawRows.length > 0) {
      const headerRow = rawRows[0];
      if (headerRow && headerRow.c) {
        cols = headerRow.c.map(cell => (cell && (cell.f || cell.v) != null ? String(cell.f || cell.v).trim() : ''));
      }
      rawRows = rawRows.slice(1);
    }

    // Identify column indices intelligently
    let passportColIdx = -1;
    let nameColIdx = -1;
    let statusColIdx = -1;
    let updateColIdx = -1;

    cols.forEach((col, idx) => {
      const norm = normalizeHeader(col);
      if (norm.includes('جواز') || norm.includes('passport') || norm.includes('وثيقه') || norm.includes('معامله') || norm.includes('هويه')) {
        passportColIdx = idx;
      } else if (norm.includes('عميل') || norm.includes('اسم') || norm.includes('مواطن') || norm.includes('name') || norm.includes('client')) {
        nameColIdx = idx;
      } else if (norm.includes('حاله') || norm.includes('status') || norm.includes('وضع')) {
        statusColIdx = idx;
      } else if (norm.includes('تحديث') || norm.includes('تاريخ') || norm.includes('date') || norm.includes('update')) {
        updateColIdx = idx;
      }
    });

    // Default fallbacks if column headers are non-standard
    if (passportColIdx === -1) passportColIdx = 0;
    if (nameColIdx === -1) nameColIdx = 1;
    if (statusColIdx === -1) statusColIdx = 2;
    if (updateColIdx === -1) updateColIdx = 3;

    // Search through rows
    for (const r of rawRows) {
      if (!r || !r.c) continue;

      let isMatch = false;
      let matchedPassportDisplay = '';

      // Check specific passport column (both formatted value .f and raw value .v)
      const pCell = r.c[passportColIdx];
      if (pCell) {
        const valF = pCell.f != null ? normalizePassport(pCell.f) : '';
        const valV = pCell.v != null ? normalizePassport(pCell.v) : '';

        if (valF === searchTarget || valV === searchTarget ||
            (searchTargetNoZeros && (valF.replace(/^0+/, '') === searchTargetNoZeros || valV.replace(/^0+/, '') === searchTargetNoZeros))) {
          isMatch = true;
          matchedPassportDisplay = pCell.f || String(pCell.v || rawPassport);
        }
      }

      // Deep search across all row cells if not matched yet
      if (!isMatch) {
        for (let j = 0; j < r.c.length; j++) {
          const cell = r.c[j];
          if (!cell) continue;
          const cellF = cell.f != null ? normalizePassport(cell.f) : '';
          const cellV = cell.v != null ? normalizePassport(cell.v) : '';

          if (cellF === searchTarget || cellV === searchTarget ||
              (searchTargetNoZeros && (cellF.replace(/^0+/, '') === searchTargetNoZeros || cellV.replace(/^0+/, '') === searchTargetNoZeros))) {
            isMatch = true;
            matchedPassportDisplay = cell.f || String(cell.v || rawPassport);
            break;
          }
        }
      }

      if (isMatch) {
        const getCellStr = (colIdx) => {
          if (colIdx === -1 || !r.c[colIdx]) return '';
          return (r.c[colIdx].f != null ? r.c[colIdx].f : (r.c[colIdx].v != null ? String(r.c[colIdx].v) : '')).trim();
        };

        const clientName = getCellStr(nameColIdx);
        const currentStatus = getCellStr(statusColIdx) || 'قيد المعالجة والمتابعة';
        const lastUpdate = getCellStr(updateColIdx);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            found: true,
            passport: matchedPassportDisplay || rawPassport,
            name: clientName,
            status: currentStatus,
            lastUpdate: lastUpdate
          })
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        found: false,
        message: 'لم يتم العثور على معاملة برقم الجواز المدخل. يرجى التأكد من الرقم أو التواصل مع الفرع.'
      })
    };

  } catch (err) {
    console.error('Track error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ found: false, error: 'حدث خطأ أثناء البحث: ' + err.message })
    };
  }
};

export default handler;