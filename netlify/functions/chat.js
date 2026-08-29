const SHEET_ID = process.env.SHEET_ID || '';
const SHEET_NAME = 'الشات بوت';

// In-memory knowledge cache
let cachedKnowledge = null;
let lastKnowledgeFetch = 0;
const KNOWLEDGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Rate Limiting Map
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // 15 chat messages per minute per IP

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

  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now - v.startTime > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
    }
  }

  return userRecord.count > MAX_REQUESTS_PER_WINDOW;
}

async function fetchGoogleSheetKnowledge() {
  const now = Date.now();
  if (cachedKnowledge && (now - lastKnowledgeFetch < KNOWLEDGE_CACHE_TTL)) {
    return cachedKnowledge;
  }

  if (!SHEET_ID) {
    return '';
  }

  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(SHEET_NAME)}&_t=${now}`;
    const res = await fetch(url);
    if (!res.ok) return '';

    const text = await res.text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return '';

    const json = JSON.parse(text.substring(start, end + 1));
    if (json.status !== 'ok') return '';

    const cols = (json.table.cols || []).map(c => c.label || '').filter(Boolean);
    const rawRows = json.table.rows || [];

    const rows = rawRows.map(r => {
      const rowObj = {};
      cols.forEach((col, idx) => {
        rowObj[col] = (r.c?.[idx]?.v != null) ? String(r.c[idx].v) : '';
      });
      return rowObj;
    });

    const activeRows = rows.filter(r => {
      const active = String(r['نشط؟'] || '').trim().toLowerCase();
      return active === 'نعم' || active === 'yes' || active === 'true' || active === '1';
    });

    let knowledgeText = '## قاعدة المعلومات والخدمات المحدثة من النظام:\n';
    activeRows.forEach(r => {
      const section = r['القسم'] || '';
      const topic = r['الموضوع / الخدمة'] || '';
      const details = r['التفاصيل والتعليمات والأسعار'] || '';
      if (topic || details) {
        knowledgeText += `- [${section}] ${topic}: ${details}\n`;
      }
    });

    cachedKnowledge = knowledgeText;
    lastKnowledgeFetch = now;
    return cachedKnowledge;

  } catch (err) {
    console.warn('Failed to fetch knowledge from Google Sheets:', err.message);
    return cachedKnowledge || '';
  }
}

function buildSystemPrompt(knowledge) {
  return `أنت مساعد ذكي، رسمي، وودود لمكتب "الأصيل بين القارات" للسفريات والسياحة وخدمات الأيدي العاملة بالجمهورية اليمنية (ترخيص رقم 46).

## القواعد الصارمة:
1. تحدث باللغة العربية الفصحى المبسطة بأسلوب ودود، واضح، ومحترم ومختصر.
2. اعتمد فقط على المعلومات والأسعار المذكورة أدناه. لا تخترع أي أسعار أو خدمات من عندك نهائياً.
3. إذا سأل العميل عن خدمة أو سعر غير مذكور في البيانات، قل له بلباقة: "يرجى التواصل مع خدمة العملاء عبر الأرقام الموضحة لمعرفة التفاصيل والأسعار الدقيقة".
4. إذا سأل العميل عن إلغاء أو استرجاع تذكرة، وجهه للتواصل مع خدمة العملاء لأن السياسة تعتمد على شركة الطيران.
5. اعرض أرقام التواصل وروابط الواتساب المناسبة عند الحاجة.
6. 🔒 خصوصية الجوازات والمعاملات: إذا استفسر العميل عن حالة جواز سفر أو معاملة خاصة، وجهه لاستخدام قسم "تتبع المعاملة" المخصص في الموقع أو التطبيق عبر إدخال رقم جوازه، ولا تطلب أو تشارك بيانات خاصة في الشات حفاظاً على سرية وخصوصية العملاء.

${knowledge}`;
}

export const handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const clientIp = event.headers?.['x-forwarded-for'] || event.headers?.['client-ip'] || 'unknown';

  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'تم تجاوز الحد المسموح من الرسائل. يرجى الانتظار دقيقة والمحاولة ثانية.' })
    };
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GEMINI_API_KEY غير مهيأ على الخادم.' })
    };
  }

  try {
    let reqBody = {};
    try {
      reqBody = JSON.parse(event.body || '{}');
    } catch (_) {
      reqBody = {};
    }

    let contents = [];

    if (Array.isArray(reqBody.contents) && reqBody.contents.length > 0) {
      contents = reqBody.contents;
    } else if (Array.isArray(reqBody.messages) && reqBody.messages.length > 0) {
      contents = reqBody.messages.map(m => ({
        role: (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user',
        parts: [{ text: m.text || m.content || '' }]
      }));
    } else if (typeof reqBody.message === 'string' && reqBody.message.trim()) {
      contents = [{ role: 'user', parts: [{ text: reqBody.message.trim() }] }];
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'حقل الرسالة مفقود.' })
      };
    }

    // Input sanitization & Length check (Max 1000 characters for last message)
    const lastPart = contents[contents.length - 1]?.parts?.[0]?.text || '';
    if (typeof lastPart === 'string' && lastPart.length > 1000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'الرسالة طويلة جداً. الحد الأقصى 1000 حرف.' })
      };
    }

    const knowledge = await fetchGoogleSheetKnowledge();
    const systemPrompt = buildSystemPrompt(knowledge);

    const geminiPayload = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.6,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      }
    };

    const candidateModels = [
      process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      'gemini-2.5-flash',
      'gemini-3.6-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];

    let lastError = null;
    let successfulData = null;

    for (const model of candidateModels) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload)
        });

        const data = await response.json();

        if (response.ok) {
          successfulData = data;
          break;
        }

        if (response.status === 404 || (data.error?.message && data.error.message.includes('not found'))) {
          lastError = data.error?.message || `Model ${model} not found`;
          continue;
        }

        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: data.error?.message || 'Gemini API Error', details: data })
        };
      } catch (fetchErr) {
        lastError = fetchErr.message;
      }
    }

    if (!successfulData) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: lastError || 'تعذر معالجة الطلب عبر نماذج الذكاء الاصطناعي.' })
      };
    }

    const replyText = successfulData.candidates?.[0]?.content?.parts?.[0]?.text || 'عذراً، لم أتمكن من فهم سؤالك بشكل واضح. يرجى إعادة الصياغة أو التواصل مع خدمة العملاء.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply: replyText,
        candidates: successfulData.candidates
      })
    };

  } catch (error) {
    console.error('Netlify Chat Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'حدث خطأ داخلي في الخادم.', details: error.message })
    };
  }
};

export default handler;