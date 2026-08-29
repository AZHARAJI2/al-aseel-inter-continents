// Netlify Function: /api/admin-agent
// Serverless AI Agent for Al-Aseel Dashboard
// Securely processes Arabic admin instructions with Gemini AI and resilient fallbacks.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'alaseel_admin_2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
const DEFAULT_WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'alaseel_secret_2026';

const SYSTEM_PROMPT = `
أنت مساعد ذكي مخصص للوحة تحكم إدارة شركة "الأصيل بين القارات" للسفريات والسياحة والحج والعمرة والفيز وتخليص المعاملات.
مهمتك تحويل طلبات وعروض المشرف المكتوبة باللغة العربية الطبيعية إلى كائن JSON مهيكل لجدول Google Sheets.

قواعد تصنيف أوراق العمل (Target Sheets):
1. الباقات: مخصصة لكافة عروض وباقات السياحة، وباقات الفيزا والتأشيرات المسعرة (حتى لو تضمن نص العرض متطلبات أو شروط، طالما أنه عرض/خدمة مسعرة فيجب أن يذهب إلى "الباقات" حصراً!).
   - الأعمدة: [اسم الباقة, الوجهة, السعر, المدة, الوصف, يشمل, رابط الصورة, نشط؟]
2. المتطلبات: مخصصة فقط لصفحة الشروط والوثائق العامة للخدمات عندما لا يكون النص عرضاً مسعراً.
   - الأعمدة: [نوع الخدمة, اسم التبويب, السعر, الوصف, المتطلبات, ملاحظات, نشط؟]
3. جوازات: مخصصة لمعاملات تتبع الجوازات للعملاء برقم الجواز.
   - الأعمدة: [رقم الجواز, اسم العميل, الحالة, آخر تحديث]
4. الأخبار: لأخبار وإعلانات وافتتاحات الشركة.
   - الأعمدة: [العنوان, النص, رابط الصورة, تاريخ النشر, نشط؟]
5. الصور / الفيديو: لمعرض الوسائط.
6. الشات بوت: لأسئلة وأجوبة بوت المحادثة.

يجب أن يكون ردك بصيغة JSON فقط بهذا الشكل:
{
  "targetSheet": "اسم_الورقة",
  "operation": "INSERT" أو "UPDATE" أو "DELETE",
  "explanation": "شرح موجز جداً لما تم فهمه وتجهيزه",
  "matchColumn": "اسم العمود المراد المطابقة به في حالة التعديل أو الحذف أو التحقق من التكرار",
  "matchValue": "القيمة المطلوب مطابقتها",
  "data": {
    "اسم_العمود_1": "القيمة_المستخرجة",
    "اسم_العمود_2": "القيمة_المستخرجة"
  }
}
`;

function parseAiJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let result = null;

  let cleaned = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    result = JSON.parse(cleaned);
  } catch (e) {}

  if (!result) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        result = JSON.parse(candidate);
      } catch (e2) {}
    }
  }

  return result;
}

function fallbackParseArabicPrompt(prompt) {
  const text = (prompt || '').trim();
  let operation = 'INSERT';
  if (/عدل|تعديل|حدث|تحديث|غير|تغيير/i.test(text)) {
    operation = 'UPDATE';
  } else if (/احذف|حذف|ازل|إزالة|مسح|امسح/i.test(text)) {
    operation = 'DELETE';
  }

  let targetSheet = 'الباقات';

  // 1. جوازات:
  if (/(?:جواز|معامل|صاحب الجواز|تتبع)\s*(?:رقم|[A-Za-z0-9٠-٩]{5,})/i.test(text) && !/باق|سياح|سعر|دولار|كينيا|تركيا|دبي/i.test(text)) {
    targetSheet = 'جوازات';
  }
  // 2. الأخبار:
  else if (/خبر|اخبار|أخبار|اعلان|إعلان|افتتاح فرع/i.test(text) && !/باق|فيزا|تأشير/i.test(text)) {
    targetSheet = 'الأخبار';
  }
  // 3. الشات بوت:
  else if (/شات|بوت|اسئل|أسئل|معرفة الشات/i.test(text)) {
    targetSheet = 'الشات بوت';
  }
  // 4. الفيديو / الصور:
  else if (/فيديو|يوتيوب/i.test(text)) {
    targetSheet = 'الفيديو';
  } else if (/صور|معرض الصور/i.test(text) && !/فيزا|باقة/i.test(text)) {
    targetSheet = 'الصور';
  }
  // 5. المتطلبات: فقط إذا كانت شروط عامة بدون سعر أو باقة أو فيزا
  else if (/شروط|متطلب|الاوراق المطلوبة|الوثائق المطلوبة/i.test(text) && !/فيزا|تأشير|باقة|باقه|سعر|\$|دولار/i.test(text)) {
    targetSheet = 'المتطلبات';
  }
  // 6. الباقات: (أي فيزا، تأشيرة، باقة سياحية، عمرة، حج، عرض مسعر)
  else {
    targetSheet = 'الباقات';
  }

  const data = {};

  const passMatch = text.match(/(?:جواز|رقم)\s*([A-Za-z0-9٠-٩]{4,15})/i) || text.match(/([0-9٠-٩]{6,12})/);
  if (passMatch) {
    data['رقم الجواز'] = passMatch[1];
  }

  // استخراج السعر
  const priceMatch = text.match(/(?:السعر للوكيل|السعر|سعر|بمبلغ|مبلغ|تكلفة)\s*[:：]?\s*([0-9٠-٩]+(?:\s*(?:دولار|\$|ر\.س|ريال|سعودي))?)/i) || 
                     text.match(/([0-9٠-٩]+\s*(?:دولار|\$|ر\.س|ريال))/i);
  if (priceMatch) {
    data['السعر'] = priceMatch[1].trim();
  }

  // استخراج المدة
  const durationMatch = text.match(/(?:صلاحية الفيزا|مدة الفيزا|المدة|فترة)\s*[:：]?\s*([0-9٠-٩]+\s*(?:ايام|أيام|يوم|شهر|أشهر|اشهر|اسابيع|أسبوع|سنوات|سنة))/i) ||
                        text.match(/([0-9٠-٩]+\s*(?:ايام|أيام|يوم|شهر|أشهر|اشهر|اسابيع|أسبوع))/i);
  if (durationMatch) {
    data['المدة'] = durationMatch[1].trim();
  }

  // استخراج رابط الصورة إن وجد
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    data['رابط الصورة'] = urlMatch[1];
  }

  if (targetSheet === 'الباقات') {
    const isVisa = /فيزا|تأشير|تاشير/i.test(text);
    const destMatch = text.match(/(?:ل|إلى|الي|في)\s*([^\s,،*]+)/i);
    const knownDest = text.match(/(كينيا|تركيا|مصر|دبي|ماليزيا|جورجيا|أذربيجان|عمرة|حج|إندونيسيا|تايلاند|الأردن|السعودية|قطر|عمان|الكويت|البحرين|الهند|الصين|ألمانيا|بريطانيا)/i);
    const destination = (knownDest ? knownDest[1] : (destMatch ? destMatch[1] : (isVisa ? 'تأشيرة' : 'سياحية')));
    
    data['الوجهة'] = destination;

    // استخراج اسم الباقة بشكل لائق
    const titleMatch = text.match(/[*_~]*\s*(فيزا\s+[^\n*]+|تأشيرة\s+[^\n*]+|باقة\s+[^\n*]+)/i);
    if (titleMatch) {
      data['اسم الباقة'] = titleMatch[1].replace(/[*_~]/g, '').trim();
    } else {
      data['اسم الباقة'] = isVisa ? `تأشيرة ${destination} ${data['المدة'] || ''}`.trim() : `باقة ${destination} ${data['المدة'] || ''}`.trim();
    }

    // استخراج ما تشمله الباقة
    const includesMatch = text.match(/(?:فترة الانجاز|المميزات|يشمل)\s*[:：]?\s*([^\n*]+)/i);
    if (includesMatch) {
      data['يشمل'] = includesMatch[1].replace(/[*_~]/g, '').trim();
    } else {
      data['يشمل'] = isVisa ? 'رسوم التأشيرة والتأمين الصحي ومعالجة الطلب' : 'شامل كافة الخدمات الفندقية والجولات';
    }

    data['الوصف'] = text;
    data['نشط؟'] = 'نعم';
  } else if (targetSheet === 'جوازات') {
    if (/تم|جاهز|اصدار|إصدار|مكتمل/i.test(text)) {
      data['الحالة'] = 'تم إصدار التأشيرة بنجاح وجاهز للتسليم';
    } else if (/مرفوض|رفض/i.test(text)) {
      data['الحالة'] = 'تم الرفض من السفارة';
    } else {
      data['الحالة'] = 'قيد الإجراء بالسفارة والمتابعة';
    }
  } else if (targetSheet === 'الأخبار') {
    data['العنوان'] = text.replace(/^(?:أضف|نشر|اضف|نشر خبراً|خبر جديد)\s*(?:بعنوان|:)?/i, '').trim();
    data['النص'] = text;
    data['نشط؟'] = 'نعم';
  } else if (targetSheet === 'المتطلبات') {
    data['نوع الخدمة'] = 'تأشيرات';
    data['اسم التبويب'] = text.substring(0, 50);
    data['الوصف'] = text;
    data['نشط؟'] = 'نعم';
  }

  return {
    targetSheet,
    operation,
    matchColumn: targetSheet === 'جوازات' ? 'رقم الجواز' : 'اسم الباقة',
    matchValue: data['رقم الجواز'] || data['اسم الباقة'] || '',
    explanation: `تم استيعاب العرض وتنظيمه في قسم [${targetSheet}]`,
    data
  };
}

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { password, prompt, webAppUrl, directAction } = body;

    // 1. التحقق من كلمة المرور
    if (!password || password !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'كلمة المرور غير صحيحة' }),
      };
    }

    const targetWebAppUrl = webAppUrl || DEFAULT_WEB_APP_URL;

    // 2. إذا كان الطلب استعلام مباشر
    if (directAction) {
      if (!targetWebAppUrl) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'رابط Google Apps Script Web App غير مضبوط في الإعدادات.',
          }),
        };
      }

      const gasRes = await fetch(targetWebAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          secret: ADMIN_SECRET,
          action: directAction.action || 'GET_DATA',
          sheetName: directAction.sheetName,
          rowIndex: directAction.rowIndex,
          rowData: directAction.rowData,
        }),
      });

      const gasData = await gasRes.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(gasData),
      };
    }

    // 3. معالجة الأمر الذكي
    if (!prompt || typeof prompt !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'يلزم كتابة أمر أو استفسار' }),
      };
    }

    const apiKey = GEMINI_API_KEY || body.geminiApiKey;
    let parsedAction = null;

    if (apiKey) {
      const geminiPayload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: SYSTEM_PROMPT },
              { text: `طلب المشرف:\n"${prompt}"` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      };

      const candidateModels = [
        process.env.GEMINI_MODEL,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
      ].filter(Boolean);

      for (const model of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
          });

          if (res.ok) {
            const geminiData = await res.json();
            const rawAiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            parsedAction = parseAiJson(rawAiText);
            if (parsedAction && parsedAction.targetSheet) break;
          }
        } catch (err) {
          console.warn(`Model ${model} failed, trying next fallback:`, err.message);
        }
      }
    }

    if (!parsedAction || !parsedAction.targetSheet) {
      parsedAction = fallbackParseArabicPrompt(prompt);
    }

    // 4. تنفيذ التعديل على Google Sheets
    let executionResult = null;
    if (targetWebAppUrl) {
      try {
        const payloadToSend = {
          secret: ADMIN_SECRET,
          action: 'EXECUTE_ACTION',
          payload: parsedAction
        };

        const postUrl = targetWebAppUrl + (targetWebAppUrl.includes('?') ? '&' : '?') + 'secret=' + encodeURIComponent(ADMIN_SECRET) + '&action=EXECUTE_ACTION';

        const gasRes = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payloadToSend),
          redirect: 'follow'
        });

        const gasText = await gasRes.text();
        try {
          executionResult = JSON.parse(gasText);
        } catch (_) {
          executionResult = {
            success: false,
            error: 'استجابة غير صالحة من Google Apps Script: ' + gasText.substring(0, 200)
          };
        }
      } catch (gasErr) {
        executionResult = {
          success: false,
          error: `تعذر الاتصال بـ Google Apps Script: ${gasErr.message}`
        };
      }
    } else {
      executionResult = {
        success: true,
        isSimulated: true,
        message: 'تم تنظيم البيانات بنجاح (وضع المعاينة). لإتمام الحفظ التلقائي في Google Sheets، يرجى وضع رابط Web App في الإعدادات ⚙️.'
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        aiPlan: parsedAction,
        executionResult: executionResult,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message || 'خطأ غير متوقع' }),
    };
  }
};

export default handler;