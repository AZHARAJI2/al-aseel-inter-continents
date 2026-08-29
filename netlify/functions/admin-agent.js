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
1. جوازات: مخصصة لحالات ومعاملات الجوازات وتتبع العملاء برقم الجواز وإضافة أو تعديل حالة جواز (مثال: "اضف جواز باسم راجي والرقم 455555 والحالة جاهز" أو "حدث حالة جواز 08912345").
   - الأعمدة: [رقم الجواز, اسم العميل, الحالة, آخر تحديث]
2. الأخبار: لأخبار وإعلانات وبيانات الشركة والافتتاحات (مثال: "نشر خبر بعنوان: ...").
   - الأعمدة: [العنوان, النص, رابط الصورة, تاريخ النشر, نشط؟]
3. المتطلبات: مخصصة حصرياً للشروط والأوراق والمستندات والوثائق المطلوبة للحصول على الخدمات (مثال: "أضف شروط تأشيرة العمل...").
   - الأعمدة: [نوع الخدمة, اسم التبويب, السعر, الوصف, المتطلبات, ملاحظات, نشط؟]
4. الباقات: مخصصة لكافة العروض والباقات السياحية، وباقات الفيزا والتأشيرات المسعرة وعروض الرحلات (مثال: "فيزا كينيا 195$", "فيزا فيتنام 120$", "باقة ماليزيا 850$").
   - الأعمدة: [اسم الباقة, الوجهة, السعر, المدة, الوصف, يشمل, رابط الصورة, نشط؟]
5. الصور: [رابط الصورة, الوصف]
6. الفيديو: [رابط اليوتيوب, العنوان, نشط؟]
7. الشات بوت: [القسم, الموضوع / الخدمة, التفاصيل والتعليمات والأسعار, نشط؟]

ملاحظات هامة:
- في عمليات الحذف (DELETE): حدد الصفحة المستهدفة وضع نص الأمر في matchValue و explanation ولا تضع بيانات حقول وهمية.
- استخرج اسم العميل ورقم الجواز والحالة بشكل دقيق عند إضافة الجوازات.

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

  // 1. DELETE
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

  // 2. Classify Sheet
  let targetSheet = 'الباقات';

  const isNews = /^(?:أضف |اضف |نشر |انشر )?(?:خبر|اخبار|أخبار|اعلان|إعلان|بيان)/i.test(text) || /(?:خبر عاجل|خبر صحفي|افتتاح فرع)/i.test(text);
  const isReq = /^(?:أضف |اضف )?(?:شروط|متطلب|متطلبات|وثائق|أوراق|اوراق|مستندات)/i.test(text);
  const isPassport = /(?:جواز|جوازات|معاملة|معامله|صاحب الجواز|تتبع)\s*(?:باسم|رقم|صاحب|جاهز|مرفوض|قيد|إصدار|اصدار|[0-9٠-٩]{4,})/i.test(text) ||
                     /^(?:أضف |اضف |حدث |تحديث )?جواز\b/i.test(text);
  const isChatbot = /^(?:أضف |اضف )?(?:شات|بوت|معرفة الشات|سؤال للشات)/i.test(text);
  const isVideo = /^(?:أضف |اضف )?(?:فيديو|يوتيوب)/i.test(text);
  const isImage = /^(?:أضف |اضف )?(?:صورة|صور|معرض الصور)/i.test(text);

  if (isNews) {
    targetSheet = 'الأخبار';
  } else if (isReq) {
    targetSheet = 'المتطلبات';
  } else if (isPassport && !/(\$|دولار|ر\.س|ريال|السعر للوكيل)/i.test(text)) {
    targetSheet = 'جوازات';
  } else if (isChatbot) {
    targetSheet = 'الشات بوت';
  } else if (isVideo) {
    targetSheet = 'الفيديو';
  } else if (isImage) {
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

  if (targetSheet === 'جوازات') {
    // 1. Passport Number
    const passMatch = text.match(/(?:رقم الجواز|رقم|جواز|الجواز)\s*[:*]*\s*([A-Za-z0-9٠-٩]{4,15})/i) ||
                      text.match(/([0-9٠-٩]{5,15})/);
    if (passMatch) {
      data['رقم الجواز'] = passMatch[1] || passMatch[0];
    } else {
      data['رقم الجواز'] = '000000';
    }

    // 2. Client Name
    const nameMatch = text.match(/(?:باسم|اسم العميل|الاسم|للعميل|للمواطن|صاحب الجواز|للمسافر)\s*[:*]*\s*([^\s,،:*]+(?:\s+[^\s,،:*]+){0,3})/i);
    if (nameMatch && nameMatch[1]) {
      let cleanName = nameMatch[1]
        .replace(/(?:والرقم|ورقم|والحالة|وحالته|والحاله|حالة|رقم|قيد|جاهز|مكتمل|تم|مرفوض).*$/i, '')
        .trim();
      data['اسم العميل'] = cleanName || 'عميل';
    } else {
      data['اسم العميل'] = 'عميل';
    }

    // 3. Status
    if (/تم|جاهز|اصدار|إصدار|مكتمل|تسليم/i.test(text)) {
      data['الحالة'] = 'تم إصدار التأشيرة بنجاح وجاهز للتسليم';
    } else if (/مرفوض|رفض/i.test(text)) {
      data['الحالة'] = 'تم الرفض من السفارة';
    } else if (/قيد|اجراء|إجراء|متابعة|معالجة/i.test(text)) {
      data['الحالة'] = 'قيد الإجراء بالسفارة والمتابعة';
    } else {
      data['الحالة'] = 'قيد المعالجة والمتابعة';
    }
  } else if (targetSheet === 'الأخبار') {
    const titleMatch = text.match(/(?:بعنوان|عنوانه|عنوان الخبر|العنوان)\s*[:*]*\s*([^\n*]+)/i);
    if (titleMatch && titleMatch[1]) {
      data['العنوان'] = titleMatch[1].trim();
    } else {
      let cleanTitle = text
        .replace(/^(?:أضف |اضف |نشر |انشر )?(?:خبر|اخبار|أخبار|اعلان|إعلان)\s*(?:جديد)?\s*(?:بعنوان|:)?/i, '')
        .trim();
      data['العنوان'] = cleanTitle.length > 40 ? cleanTitle.substring(0, 40) + '...' : cleanTitle;
    }
    data['النص'] = text;
    data['نشط؟'] = 'نعم';
  } else if (targetSheet === 'المتطلبات') {
    data['نوع الخدمة'] = /فيزا|تأشير/i.test(text) ? 'تأشيرات' : (/سياح/i.test(text) ? 'سياحة' : (/عمرة|حج/i.test(text) ? 'عمرة وحج' : 'تأشيرات'));
    const tabMatch = text.match(/(?:شروط|متطلبات|وثائق|أوراق|اوراق)\s*([^\n:*]+)/i);
    if (tabMatch && tabMatch[1]) {
      data['اسم التبويب'] = tabMatch[1].replace(/[:*].*$/, '').trim();
    } else {
      data['اسم التبويب'] = 'شروط ' + data['نوع الخدمة'];
    }
    data['الوصف'] = text;
    data['المتطلبات'] = text;
    data['نشط؟'] = 'نعم';
  } else {
    // الباقات
    const isVisa = /فيزا|فيزه|تأشير|تاشير/i.test(text);
    const destination = extractDestinationSmart(text);
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
  }

  return {
    targetSheet,
    operation,
    matchColumn: targetSheet === 'جوازات' ? 'رقم الجواز' : (targetSheet === 'الأخبار' ? 'العنوان' : (targetSheet === 'المتطلبات' ? 'اسم التبويب' : 'اسم الباقة')),
    matchValue: data['رقم الجواز'] || data['اسم الباقة'] || data['العنوان'] || data['اسم التبويب'] || '',
    userPrompt: text,
    explanation: `تم استيعاب الأمر وتوجيهه لقسم [${targetSheet}]`,
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
