// Netlify Function: /api/public-data
// Secure proxy for public website content (Packages, Requirements, News, Gallery, Videos)
// Strictly forbids access to sensitive sheets like Passports (جوازات) or Chatbot rules (الشات بوت)

const ALLOWED_SHEETS = new Set([
  'الباقات',
  'المتطلبات',
  'الأخبار',
  'الصور',
  'الفيديو'
]);

// 60-second in-memory cache to reduce Google Sheets API hits
const cache = new Map();
const CACHE_TTL = 60 * 1000;

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const sheetName = (params.sheet || '').trim();

    if (!sheetName || !ALLOWED_SHEETS.has(sheetName)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'الجدول المطلوب غير مصرح به للوصول العام.'
        })
      };
    }

    const SHEET_ID = process.env.SHEET_ID;
    if (!SHEET_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'SHEET_ID غير مهيأ على الخادم.' })
      };
    }

    // Check cache
    const cached = cache.get(sheetName);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, sheet: sheetName, data: cached.data, cached: true })
      };
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}&_t=${now}`;
    const res = await fetch(sheetUrl);

    if (!res.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ success: false, error: 'تعذر جلب البيانات من Google Sheets.' })
      };
    }

    const text = await res.text();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'استجابة غير صالحة من Google Sheets.' })
      };
    }

    const json = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
    if (json.status !== 'ok') {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: json.errors?.[0]?.message || 'Query failed' })
      };
    }

    let cols = (json.table.cols || []).map(c => (c && c.label ? String(c.label).trim() : ''));
    let rawRows = json.table.rows || [];

    if (!cols.some(l => l.length > 0) && rawRows.length > 0) {
      const headerRow = rawRows[0];
      if (headerRow && headerRow.c) {
        cols = headerRow.c.map(cell => (cell && cell.v != null ? String(cell.v).trim() : ''));
      }
      rawRows = rawRows.slice(1);
    }

    const rows = rawRows.map(row => {
      const obj = {};
      if (row && row.c) {
        row.c.forEach((cell, i) => {
          const key = cols[i];
          if (key) {
            obj[key] = (cell && cell.v != null) ? String(cell.v) : '';
          }
        });
      }
      return obj;
    });

    // Save to cache
    cache.set(sheetName, { timestamp: now, data: rows });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, sheet: sheetName, data: rows })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};

export default handler;