// Netlify Function: /api/admin-agent
// Serverless AI Agent for Al-Aseel Dashboard
// Securely processes Arabic admin instructions with Gemini AI and resilient fallbacks.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'alaseel_admin_2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
const DEFAULT_WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'alaseel_secret_2026';

const KNOWN_DESTINATIONS = [
  "فيتنام", "فتنام", "سنغافورة", "سنغافورا", "كينيا", "أوغندا", "اوغندا", "سريلانكا", "سري لانكا",
  "ماليزيا", "إندونيسيا", "اندونيسيا", "تايلاند", "الفلبين", "الصين", "الهند", "تركيا", "جورجيا",
  "أذربيجان", "اذربيجان", "روسيا", "أرمينيا", "ارمينيا", "البوسنة", "ألبانيا", "البانيا", "مصر",
  "دبي", "الإمارات", "الامارات", "السعودية", "قطر", "الكويت", "سلطنة عمان", "عمان", "البحرين",
  "الأردن", "الاردن", "لبنان", "تونس", "المغرب", "الجزائر", "بريطانيا", "لندن", "ألمانيا", "المانيا",
  "شنغن", "أمريكا", "امريكا", "كندا", "أستراليا", "استراليا", "اليابان", "كوريا", "عمرة", "حج"
];

function extractDestinationSmart(text) {
  for (const dest of KNOWN_DESTINATIONS) {
    const reg = new RegExp("(?:^|[^\\u0621-\\u064A])(?:ل|ب|و|إلى |الى )?" + dest + "(?:$|[^\\u0621-\\u064A])", "i");
    if (reg.test(text)) {
      return dest;
    }
  }

  const patternMatch = text.match(/(?:فيزا|فيزه|تأشيرة|تاشيرة|باقة|باقه|سفر إلى|سفر الى|رحلة إلى|رحلة الى|إلى|الي)\s+([^\s*~_،,:.]+)/i);
  if (patternMatch && patternMatch[1] && patternMatch[1].length >= 3 && !/سياحية|سياحيه|عمل|زيارة|الكترونية|الكترونيه|جديدة/i.test(patternMatch[1])) {
    return patternMatch[1];
  }

  return "سياحية";
}

const SYSTEM_PROMPT = `
أنت مساعد ذكي مخصص للوحة تحكم إدارة شركة "الأصيل بين القارات" للسفريات والسياحة والحج والعمرة والفيز وتخليص المعاملات.
مهمتك تحويل طلبات المشرف المكتوبة باللغة العربية الطبيعية إلى كائن JSON مهيكل يحتوي على الإجراء والبيانات المناسبة لجدول Google Sheets.

قواعد تصنيف أوراق العمل (Target Sheets):
1. الباقات: مخصصة لكافة العروض والباقات السياحية، وباقات الفيزا والتأشيرات المسعرة (مثل: باقة فيزا دبي، تأشيرة تركيا، فيزا مصر، فيزا فيتنام، فيزا سنغافورة، تأشيرة عمل، باقة سياحة، باقة عمرة/حج).
   - الأعمدة: [اسم الباقة, الوجهة, السعر, المدة, الوصف, يشمل, رابط الصورة, نشط؟]
2. المتطلبات: مخصصة حصرياً للشروط والأوراق والمستندات والوثائق المطلوبة للحصول على الخدمات (وليس للباقات والعروض المسعرة).
   - الأعمدة: [نوع الخدمة, اسم التبويب, السعر, الوصف, المتطلبات, ملاحظات, نشط؟]
3. جوازات: مخصصة لحالات ومعاملات الجوازات وتتبع العملاء برقم الجواز.
   - الأعمدة: [رقم الجواز, اسم العميل, الحالة, آخر تحديث]
4. الأخبار: لأخبار وإعلانات الشركة.
   - الأعمدة: [العنوان, النص, رابط الصورة, تاريخ النشر, نشط؟]
5. الصور: [رابط الصورة, الوصف]
6. الفيديو: [رابط اليوتيوب, العنوان, نشط؟]
7. الشات بوت: [القسم, الموضوع / الخدمة, التفاصيل والتعليمات والأسعار, نشط؟]

ملاحظات هامة جداً:
- في عمليات الحذف (DELETE): إذا كان الطلب حذف (مثل "احذف الصف رقم 5 من المتطلبات")، حدد الصفحة بدقة وضع نص الأمر كاملاً في matchValue و explanation ولا تضع أي حقول في data.
- استخرج اسم الدولة/الوجهة بشكل صحيح بدون تشويه (مثال: فيزا فيتنام -> الوجهة: فيتنام، فيزا سنغافورة -> الوجهة: سنغافورة).

يجب أن يكون ردك بصيغة JSON فقط بهذا الشكل:
{
  "targetSheet": "اسم_الورقة",
  "operation": "INSERT" أو "UPDATE" أو "DELETE",
  "explanation": "شرح موجز جداً لما تم فهمه وتجهيزه",
  "matchColumn": "اسم العمود المراد المطابقة به في حالة التعديل أو الحذف",
  "matchValue": "القيمة أو أرقام الصفوف المطلوب حذفها أو تعديلها",
  "data": {
    "اسم_العمود_1": "القيمة_المستخرجة"
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

  // 1. في حالة الحذف (DELETE): نحدد الصفحة والهدف بدقة
  if (operation === 'DELETE') {
    let targetSheet = 'الباقات';
    if (/متطلب|المتطلبات/i.test(text)) targetSheet = 'المتطلبات';
    else if (/جواز|جوازات/i.test(text)) targetSheet = 'جوازات';
    else if (/خبر|اخبار|أخبار/i.test(text)) targetSheet = 'الأخبار';
    else if (/صور/i.test(text)) targetSheet = 'الصور';
    else if (/فيديو/i.test(text)) targetSheet = 'الفيديو';
    else if (/شات|بوت/i.test(text)) targetSheet = 'الشات بوت';
    else targetSheet = 'الباقات';

    return {
      targetSheet,
      operation: 'DELETE',
      matchColumn: 'الصف',
      matchValue: text,
      userPrompt: text,
      explanation: `حذف من صفحة [${targetSheet}]: ${text}`,
      data: {}
    };
  }

  // 2. في حالة الإضافة أو التعديل:
  const isVisa = /فيزا|فيزه|تأشير|تاشير/i.test(text);
  const isPackage = /باقة|باقه|عرض|سياح|رحلة|عمرة|حج/i.test(text);
  const isPassport = /(?:جواز|معامل|صاحب الجواز|تتبع)\s*(?:رقم|[A-Za-z0-9٠-٩]{5,})/i.test(text);

  let targetSheet = 'الباقات';

  if (isPassport && !isVisa && !isPackage && !/سعر|دولار|\$/i.test(text)) {
    targetSheet = 'جوازات';
  } else if (/^أضف\s+(?:شروط|متطلبات|وثائق)/i.test(text) && !isVisa && !isPackage) {
    targetSheet = 'المتطلبات';
  } else if (/خبر|اخبار|أخبار|اعلان|إعلان|افتتاح فرع/i.test(text) && !isVisa && !isPackage) {
    targetSheet = 'الأخبار';
  } else if (/شات|بوت|اسئل|أسئل/i.test(text)) {
    targetSheet = 'الشات بوت';
  } else if (/فيديو|يوتيوب/i.test(text)) {
    targetSheet = 'الفيديو';
  } else if (/صور|معرض الصور/i.test(text) && !isVisa && !isPackage) {
    targetSheet = 'الصور';
  } else {
    targetSheet = 'الباقات';
  }

  const data = {};

  // Image URL
  const imgMatch = text.match(/https?:\/\/[^\s]+/i);
  if (imgMatch) {
    data['رابط الصورة'] = imgMatch[0];
  }

  // Passport number
  const passMatch = text.match(/(?:جواز|رقم)\s*([A-Za-z0-9٠-٩]{4,15})/i) || text.match(/([0-9٠-٩]{6,12})/);
  if (passMatch) {
    data['رقم الجواز'] = passMatch[1];
  }

  // Price
  const priceMatch = text.match(/(?:السعر للوكيل|السعر|سعر|بسعر|بمبلغ|مبلغ|تكلفة)\s*[:*]*\s*([0-9٠-٩]+(?:\s*(?:دولار|\$|ر\.س|ريال))?)/i) || 
                     text.match(/([0-9٠-٩]+\s*(?:دولار|\$|ر\.س|ريال))/i);
  if (priceMatch) {
    data['السعر'] = priceMatch[1] || priceMatch[0];
  }

  // Duration
  const durationMatch = text.match(/(?:صلاحية الفيزا|مدة الفيزا|المدة|فترة)\s*[:*]*\s*([0-9٠-٩]+\s*(?:ايام|أيام|يوم|شهر|أشهر|اسابيع|أسبوع|سنوات|سنة))/i) ||
                        text.match(/([0-9٠-٩]+\s*(?:ايام|أيام|يوم|شهر|أشهر|اسابيع|أسبوع))/i) ||
                        text.match(/(اسبوع|أسبوع|شهر|يومين)/i);
  if (durationMatch) {
    data['المدة'] = durationMatch[1] || durationMatch[0];
  }

  const destination = extractDestinationSmart(text);

  if (targetSheet === 'الباقات') {
    data['الوجهة'] = destination;

    const titleMatch = text.match(/[*_~]*\s*(فيزا\s+[^\n*]+|فيزه\s+[^\n*]+|تأشيرة\s+[^\n*]+|باقة\s+[^\n*]+)/i);
    if (titleMatch) {
      data['اسم الباقة'] = titleMatch[1].replace(/[*_~]/g, '').trim();
    } else {
      data['اسم الباقة'] = isVisa ? `فيزا ${destination} السياحية` : `باقة ${destination} ${data['المدة'] || ''}`.trim();
    }

    data['يشمل'] = isVisa ? 'رسوم التأشيرة ومعالجة الطلب والمتابعة' : (/طيران/i.test(text) ? 'تذاكر طيران وفندق وجولات' : 'شامل كافة الخدمات الفندقية والجولات');
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
    data['اسم التبويب'] = text;
    data['الوصف'] = text;
    data['نشط؟'] = 'نعم';
  }

  return {
    targetSheet,
    operation,
    matchColumn: targetSheet === 'جوازات' ? 'رقم الجواز' : 'اسم الباقة',
    matchValue: data['رقم الجواز'] || data['اسم الباقة'] || destination,
    userPrompt: text,
    explanation: `تم استيعاب الأمر وتنظيمه في قسم [${targetSheet}]`,
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

    const trimmedPrompt = prompt.trim();
    const isExplicitDelete = /^(?:احذف|حذف|ازل|إزالة|امسح|مسح|delete|remove)\b/i.test(trimmedPrompt) ||
                             /(?:احذف|حذف|ازل|إزالة|امسح|مسح)\s+(?:الصف|الصفوف|سطر|أسطر|باقة|فيزا|تأشيرة|جواز|خبر|صورة|فيديو)/i.test(trimmedPrompt);

    let parsedAction = null;

    // في أوامر الحذف الصريحة، نستخدم المعالج المباشر لضمان عدم حدوث أي خطأ في التحليل
    if (isExplicitDelete) {
      parsedAction = fallbackParseArabicPrompt(trimmedPrompt);
    } else {
      const apiKey = GEMINI_API_KEY || body.geminiApiKey;

      if (apiKey) {
        const geminiPayload = {
          contents: [
            {
              role: 'user',
              parts: [
                { text: SYSTEM_PROMPT },
                { text: `طلب المشرف:\n"${trimmedPrompt}"` }
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
        parsedAction = fallbackParseArabicPrompt(trimmedPrompt);
      }
    }

    // إرفاق نص الطلب الأصلي دائماً لضمان وصوله إلى Google Apps Script
    if (parsedAction) {
      parsedAction.userPrompt = trimmedPrompt;
      if (!parsedAction.matchValue) {
        parsedAction.matchValue = trimmedPrompt;
      }
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