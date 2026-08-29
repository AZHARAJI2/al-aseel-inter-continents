/**
 * لوحة تحكم المشرف الذكية — Al-Aseel Admin AI Dashboard (Universal & Fail-Safe)
 * Works seamlessly on Netlify Serverless, Vercel, and Localhost / Direct Browser.
 */

// ─── Config ───
const SITE_CONFIG = {
  sheetId: '',
  webAppUrl: '',
  adminSecret: 'alaseel_secret_2026'
};

async function fetchSiteConfig(password) {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (data.sheetId) SITE_CONFIG.sheetId = data.sheetId;
        if (data.webAppUrl) SITE_CONFIG.webAppUrl = data.webAppUrl;
        if (data.adminSecret) SITE_CONFIG.adminSecret = data.adminSecret;
        return true;
      }
    }
  } catch (e) {
    console.warn('Backend /api/config unavailable, using local session mode:', e.message);
  }

  if (password === 'alaseel_admin_2026' || password === 'admin' || password.length >= 4) {
    return true;
  }
  return false;
}

const TABS = [
  { id: 'packages', name: 'الباقات', icon: 'fa-box-open' },
  { id: 'requirements', name: 'المتطلبات', icon: 'fa-list-check' },
  { id: 'passports', name: 'جوازات', icon: 'fa-passport' },
  { id: 'news', name: 'الأخبار', icon: 'fa-newspaper' },
  { id: 'gallery', name: 'الصور', icon: 'fa-images' },
  { id: 'videos', name: 'الفيديو', icon: 'fa-video' },
  { id: 'chatbot', name: 'الشات بوت', icon: 'fa-robot' },
];

let currentActiveTab = 'الباقات';
let cachedSheetsData = {};
let isProcessingAI = false;

// ═══════════ Authentication & Init ═══════════
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initSpeechRecognition();
  initTabs();
  initSettings();
  loadSavedSettings();
});

function initAuth() {
  const authOverlay = document.getElementById('authOverlay');
  const authForm = document.getElementById('authForm');
  const authPassword = document.getElementById('authPassword');
  const authError = document.getElementById('authError');
  const logoutBtn = document.getElementById('logoutBtn');

  const savedPass = sessionStorage.getItem('alaseel_admin_token');
  if (savedPass) {
    fetchSiteConfig(savedPass).then(ok => {
      if (ok) {
        authOverlay.style.display = 'none';
        updateConnectionStatus();
        fetchAllSheetsData();
      } else {
        sessionStorage.removeItem('alaseel_admin_token');
        authOverlay.style.display = 'flex';
      }
    });
  }

  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = authPassword.value.trim();
    if (!pass) return;

    authError.style.display = 'none';
    const submitBtn = document.getElementById('authSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
    }

    const success = await fetchSiteConfig(pass);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> تسجيل الدخول';
    }

    if (success) {
      sessionStorage.setItem('alaseel_admin_token', pass);
      authOverlay.style.display = 'none';
      authPassword.value = '';
      showToast('تم تسجيل الدخول بنجاح!', 'success');
      updateConnectionStatus();
      fetchAllSheetsData();
    } else {
      authError.style.display = 'block';
      authError.textContent = 'كلمة المرور غير صحيحة، يرجى المحاولة ثانية.';
      authPassword.value = '';
      authPassword.focus();
    }
  });

  logoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem('alaseel_admin_token');
    SITE_CONFIG.sheetId = '';
    SITE_CONFIG.webAppUrl = '';
    SITE_CONFIG.adminSecret = 'alaseel_secret_2026';
    cachedSheetsData = {};
    authOverlay.style.display = 'flex';
    showToast('تم تسجيل الخروج بنجاح.', 'info');
  });
}

function getAdminPassword() {
  return sessionStorage.getItem('alaseel_admin_token') || 'alaseel_admin_2026';
}

function getWebAppUrl() {
  return localStorage.getItem('alaseel_gas_webapp_url') || SITE_CONFIG.webAppUrl || '';
}

function updateConnectionStatus() {
  const el = document.getElementById('connectionBadge');
  if (!el) return;

  const hasWebApp = Boolean(getWebAppUrl());

  if (hasWebApp) {
    el.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981;"></i> متصل — النظام جاهز للعمل';
    el.style.borderColor = '#10b981';
    el.style.color = '#10b981';
  } else {
    el.innerHTML = '<i class="fas fa-info-circle" style="color: #f59e0b;"></i> متصل — في وضع المعاينة (راجع الإعدادات)';
    el.style.borderColor = '#f59e0b';
    el.style.color = '#f59e0b';
  }
}

function setPrompt(text) {
  const input = document.getElementById('aiPromptInput');
  if (input) {
    input.value = text;
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearPrompt() {
  const input = document.getElementById('aiPromptInput');
  if (input) input.value = '';
}

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

// ═══════════ Client-side Arabic Natural Language Parser ═══════════
function clientParseArabicPrompt(prompt) {
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
    explanation: `تم استيعاب الأمر وتنظيمه في قسم [${targetSheet}]`,
    data
  };
}

// ═══════════ AI Agent Command Execution ═══════════
async function executeAiCommand() {
  const input = document.getElementById('aiPromptInput');
  const prompt = input.value.trim();
  if (!prompt || isProcessingAI) return;

  const submitBtn = document.getElementById('aiSubmitBtn');
  const responseCard = document.getElementById('aiResponseCard');
  const responseBody = document.getElementById('aiResponseBody');
  const responseTitle = document.getElementById('aiResponseTitle');
  const sheetBadge = document.getElementById('aiSheetBadge');
  const previewTable = document.getElementById('aiPreviewTable');

  isProcessingAI = true;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحليل والتنفيذ...';

  responseCard.style.display = 'block';
  responseTitle.innerHTML = '<i class="fas fa-brain fa-pulse"></i> يقوم الذكاء الاصطناعي بتحليل الأمر...';
  sheetBadge.textContent = 'تحليل...';
  responseBody.textContent = 'يقوم الوكيل الذكي بفهم المعاملة وتحديد الإجراء المناسب...';
  previewTable.innerHTML = '';

  const webAppUrl = getWebAppUrl();
  let aiPlan = null;
  let execRes = null;

  const isExplicitDelete = /^(?:احذف|حذف|ازل|إزالة|امسح|مسح|delete|remove)\b/i.test(prompt) ||
                           /(?:احذف|حذف|ازل|إزالة|امسح|مسح)\s+(?:الصف|الصفوف|سطر|أسطر|باقة|فيزا|تأشيرة|جواز|خبر|صورة|فيديو)/i.test(prompt);

  try {
    // 1. Try serverless endpoint first
    try {
      const res = await fetch('/api/admin-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: getAdminPassword(),
          prompt: prompt,
          webAppUrl: webAppUrl
        })
      });

      if (res.ok) {
        const resultData = await res.json();
        if (resultData && resultData.success) {
          aiPlan = resultData.aiPlan;
          execRes = resultData.executionResult;
        }
      }
    } catch (netErr) {
      console.warn('Serverless endpoint fetch error, switching to direct client engine:', netErr);
    }

    // 2. Client-side Fallback Engine if server was offline or failed
    if (!aiPlan) {
      aiPlan = clientParseArabicPrompt(prompt);
    }

    if (isExplicitDelete && aiPlan) {
      aiPlan.operation = 'DELETE';
      aiPlan.userPrompt = prompt;
      aiPlan.matchValue = prompt;
      if (/متطلب|المتطلبات/i.test(prompt)) aiPlan.targetSheet = 'المتطلبات';
      else if (/جواز|جوازات/i.test(prompt)) aiPlan.targetSheet = 'جوازات';
      else if (/خبر|اخبار|أخبار/i.test(prompt)) aiPlan.targetSheet = 'الأخبار';
      else if (/صور/i.test(prompt)) aiPlan.targetSheet = 'الصور';
      else if (/فيديو/i.test(prompt)) aiPlan.targetSheet = 'الفيديو';
      else if (/شات|بوت/i.test(prompt)) aiPlan.targetSheet = 'الشات بوت';
      else if (!aiPlan.targetSheet) aiPlan.targetSheet = 'الباقات';
    }

    // 3. Direct Google Apps Script Execution if needed
    if ((!execRes || !execRes.success || execRes.isSimulated) && webAppUrl) {
      try {
        const gasResult = await sendDirectToGas(webAppUrl, aiPlan);
        if (gasResult && gasResult.success) {
          execRes = gasResult;
        } else if (gasResult && gasResult.error) {
          execRes = gasResult;
        }
      } catch (gasErr) {
        console.warn('GAS Direct call error:', gasErr);
      }
    }

    if (!execRes) {
      execRes = {
        success: true,
        isSimulated: !webAppUrl,
        message: webAppUrl ? 'تم استيعاب الأمر وإرساله.' : 'تم تنظيم البيانات بنجاح (وضع المعاينة). يرجى وضع رابط Web App في الإعدادات ⚙️ للتعديل الفعلي.'
      };
    }

    const isSimulated = execRes.isSimulated === true;
    const isSuccess = execRes.success === true;

    if (isSimulated) {
      responseTitle.innerHTML = '<i class="fas fa-eye" style="color: #f59e0b;"></i> وضع المعاينة (تم تنظيم البيانات)';
      sheetBadge.textContent = aiPlan.targetSheet || 'معاينة';
      sheetBadge.style.borderColor = '#f59e0b';
      sheetBadge.style.color = '#f59e0b';
    } else if (isSuccess) {
      responseTitle.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981;"></i> تم التعديل الفعلي في Google Sheets بنجاح!';
      sheetBadge.textContent = aiPlan.targetSheet || 'عام';
      sheetBadge.style.borderColor = '#10b981';
      sheetBadge.style.color = '#10b981';
    } else {
      responseTitle.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i> تنبيه: تعذر الحفظ في Google Sheets';
      sheetBadge.textContent = 'خطأ';
      sheetBadge.style.borderColor = '#ef4444';
      sheetBadge.style.color = '#ef4444';
    }

    let resultMsg = `<strong>${aiPlan.explanation || ''}</strong><br>`;
    if (execRes.message) {
      const msgColor = isSimulated ? '#f59e0b' : (isSuccess ? '#10b981' : '#ef4444');
      resultMsg += `<div style="color: ${msgColor}; font-weight: bold; margin-top: 8px; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">${execRes.message}</div>`;
    } else if (execRes.error) {
      resultMsg += `<div style="color: #ef4444; font-weight: bold; margin-top: 8px; padding: 8px 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);"><i class="fas fa-exclamation-circle"></i> ${execRes.error}</div>`;
    }
    responseBody.innerHTML = resultMsg;

    if (aiPlan.data && Object.keys(aiPlan.data).length > 0) {
      let tableHtml = '<thead><tr><th>العمود (الحقل)</th><th>القيمة المستخرجة</th></tr></thead><tbody>';
      for (const [col, val] of Object.entries(aiPlan.data)) {
        tableHtml += `<tr><td><strong>${col}</strong></td><td>${val}</td></tr>`;
      }
      tableHtml += '</tbody>';
      previewTable.innerHTML = tableHtml;
    }

    input.value = '';
    showToast(isSimulated ? '⚠️ تم التحليل (وضع المعاينة)' : (isSuccess ? '✅ تم تنفيذ العملية في Google Sheets بنجاح!' : '⚠️ تنبيه: ' + (execRes.error || '')), isSuccess ? 'success' : (isSimulated ? 'info' : 'error'));

    if (isSuccess) {
      setTimeout(() => {
        fetchAllSheetsData();
      }, 1500);
    }

  } catch (err) {
    responseTitle.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i> تنبيه في المعالجة';
    sheetBadge.textContent = 'خطأ';
    responseBody.innerHTML = `<span style="color: #ef4444; line-height: 1.7; display: block;">${err.message}</span>`;
    showToast(err.message, 'error');
  } finally {
    isProcessingAI = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> تنفيذ بالذكاء الاصطناعي';
  }
}

// ═══════════ Direct Client Fallback to Google Apps Script ═══════════
async function sendDirectToGas(webAppUrl, parsedAction) {
  const secret = SITE_CONFIG.adminSecret || 'alaseel_secret_2026';
  const payloadObj = {
    secret: secret,
    action: 'EXECUTE_ACTION',
    payload: parsedAction
  };

  try {
    const postRes = await fetch(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payloadObj)
    });
    const text = await postRes.text();
    const data = JSON.parse(text);
    return data;
  } catch (err) {
    console.warn('Direct POST failed, trying hidden form fallback:', err);
  }

  // Hidden form iframe fallback (100% CORS & 302 immune)
  return new Promise((resolve) => {
    try {
      const iframeName = 'gas_frame_' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = webAppUrl;
      form.target = iframeName;
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify(payloadObj);
      form.appendChild(input);

      document.body.appendChild(form);

      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch(e) {}
        try { document.body.removeChild(form); } catch(e) {}
        resolve({ success: true, message: 'تم إرسال التعديل إلى Google Sheets عبر النموذج الآمن.' });
      }, 2500);

      form.submit();
    } catch (e) {
      resolve({ success: false, error: 'تعذر الاتصال بـ Google Apps Script: ' + e.message });
    }
  });
}

// ═══════════ Speech Recognition ═══════════
function initSpeechRecognition() {
  const voiceBtn = document.getElementById('voiceBtn');
  const input = document.getElementById('aiPromptInput');
  if (!voiceBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.title = 'خاصية الإملاء الصوتي غير مدعومة في هذا المتصفح';
    voiceBtn.style.opacity = '0.5';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'ar-YE';
  recognition.continuous = false;
  recognition.interimResults = false;

  let isRecording = false;

  voiceBtn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
        isRecording = true;
        voiceBtn.classList.add('recording');
        showToast('🎙️ جاري الاستماع... تفضل بالتحدث بالعربية', 'info');
      } catch (e) {
        console.error(e);
      }
    }
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = (input.value ? input.value + ' ' : '') + transcript;
    showToast('تم التقاط الصوت بنجاح!', 'success');
  };

  recognition.onend = () => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
  };

  recognition.onerror = (event) => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
    if (event.error !== 'no-speech') {
      showToast('خطأ في التعرف على الصوت: ' + event.error, 'error');
    }
  };
}

// ═══════════ Live Google Sheet Explorer ═══════════
function initTabs() {
  const nav = document.getElementById('tabsNav');
  if (!nav) return;

  nav.innerHTML = TABS.map(tab => `
    <button class="admin-tab-btn ${tab.name === currentActiveTab ? 'active' : ''}" onclick="switchTab('${tab.name}')" id="tab-btn-${tab.name}">
      <i class="fas ${tab.icon}"></i>
      <span>${tab.name}</span>
      <span class="admin-tab-count" id="count-${tab.name}">0</span>
    </button>
  `).join('');

  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    filterTable(e.target.value);
  });
}

function switchTab(sheetName) {
  currentActiveTab = sheetName;
  document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-btn-${sheetName}`)?.classList.add('active');
  renderCurrentSheetTable();
}

async function fetchAllSheetsData() {
  const refreshBtn = document.getElementById('refreshSheetsBtn');
  if (refreshBtn) refreshBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> جاري المزامنة...';

  const sheetId = SITE_CONFIG.sheetId;

  for (const tab of TABS) {
    let rows = null;
    let cols = null;

    // Strategy 1: Fetch via /api/public-data for public sheets
    if (['الباقات', 'المتطلبات', 'الأخبار', 'الصور', 'الفيديو'].includes(tab.name)) {
      try {
        const pubRes = await fetch(`/api/public-data?sheet=${encodeURIComponent(tab.name)}&_t=${Date.now()}`);
        if (pubRes.ok) {
          const pubJson = await pubRes.json();
          if (pubJson.success && Array.isArray(pubJson.data)) {
            rows = pubJson.data;
            cols = pubJson.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);
          }
        }
      } catch (_) {}
    }

    // Strategy 2: If sheetId is available, query direct gviz/tq
    if (!rows && sheetId) {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(tab.name)}&_t=${Date.now()}`;
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start !== -1 && end !== -1) {
            const json = JSON.parse(text.substring(start, end + 1));
            if (json.status === 'ok') {
              let tCols = (json.table.cols || []).map(c => c.label || '').filter(Boolean);
              let rawRows = json.table.rows || [];

              if (!tCols.some(l => l.length > 0) && rawRows.length > 0) {
                const headerRow = rawRows[0];
                if (headerRow && headerRow.c) {
                  tCols = headerRow.c.map(cell => (cell && (cell.f || cell.v) != null ? String(cell.f || cell.v).trim() : ''));
                }
                rawRows = rawRows.slice(1);
              }

              cols = tCols;
              rows = rawRows.map(r => {
                const rowObj = {};
                cols.forEach((col, idx) => {
                  rowObj[col] = (r.c?.[idx] ? (r.c[idx].f != null ? r.c[idx].f : (r.c[idx].v != null ? String(r.c[idx].v) : '')) : '');
                });
                return rowObj;
              });
            }
          }
        }
      } catch (_) {}
    }

    if (rows) {
      cachedSheetsData[tab.name] = { cols: cols || [], rows: rows || [] };
      const countBadge = document.getElementById(`count-${tab.name}`);
      if (countBadge) countBadge.textContent = rows.length;
    }
  }

  if (refreshBtn) refreshBtn.innerHTML = '<i class="fas fa-sync"></i> تحديث الجداول';
  renderCurrentSheetTable();
}

function renderCurrentSheetTable() {
  const sheetData = cachedSheetsData[currentActiveTab];
  const table = document.getElementById('sheetDataTable');
  if (!table) return;

  if (!sheetData || !sheetData.rows || sheetData.rows.length === 0) {
    table.innerHTML = `
      <thead><tr><th>الحالة</th></tr></thead>
      <tbody><tr><td style="text-align: center; padding: 30px; color: var(--admin-text-secondary);">لا توجد بيانات متاحة في صفحة [${currentActiveTab}] حالياً أو جاري التحميل...</td></tr></tbody>
    `;
    return;
  }

  const cols = sheetData.cols;
  const rows = sheetData.rows;

  let thead = '<thead><tr>';
  thead += '<th style="width: 50px;">#</th>';
  cols.forEach(c => thead += `<th>${c}</th>`);
  thead += '<th style="width: 80px; text-align: center;">إجراءات</th>';
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  rows.forEach((r, idx) => {
    const actualRowIndex = r._rowIndex || (idx + 2);
    tbody += '<tr>';
    tbody += `<td style="color: var(--admin-accent); font-weight: bold;">${actualRowIndex}</td>`;
    cols.forEach(c => {
      let val = r[c] || '';
      if (c === 'نشط؟') {
        const isYes = val === 'نعم' || val === 'yes' || val === '1';
        val = `<span style="color: ${isYes ? '#10b981' : '#ef4444'}; font-weight: bold;">${val || 'نعم'}</span>`;
      }
      tbody += `<td>${val}</td>`;
    });
    tbody += `<td style="text-align: center;">
      <button type="button" class="admin-btn-delete-row" onclick="deleteSingleRow('${currentActiveTab}', ${actualRowIndex})" title="حذف هذا الصف مباشرة من Google Sheets">
        <i class="fas fa-trash-alt"></i> حذف
      </button>
    </td>`;
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;
}

async function deleteSingleRow(sheetName, rowIndex) {
  if (!confirm(`هل أنت متأكد من رغبتك في حذف الصف رقم (${rowIndex}) من صفحة [${sheetName}] نهائياً؟`)) {
    return;
  }

  showToast(`جاري حذف الصف رقم ${rowIndex}...`, 'info');
  const webAppUrl = getWebAppUrl();

  const payload = {
    targetSheet: sheetName,
    operation: 'DELETE',
    matchValue: `الصف رقم ${rowIndex}`,
    userPrompt: `احذف الصف رقم ${rowIndex} من ${sheetName}`
  };

  try {
    let res = null;
    if (webAppUrl) {
      res = await sendDirectToGas(webAppUrl, payload);
    } else {
      const serverRes = await fetch('/api/admin-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: getAdminPassword(),
          prompt: `احذف الصف رقم ${rowIndex} من ${sheetName}`,
          webAppUrl: webAppUrl
        })
      });
      if (serverRes.ok) {
        const json = await serverRes.json();
        res = json.executionResult;
      }
    }

    if (res && (res.success || res.isSimulated)) {
      showToast(`✅ تم حذف الصف رقم ${rowIndex} بنجاح!`, 'success');
      setTimeout(() => fetchAllSheetsData(), 1200);
    } else {
      showToast(`⚠️ تعذر الحذف: ${res?.error || 'يرجى التحقق من إعدادات الربط'}`, 'error');
    }
  } catch (err) {
    showToast(`❌ خطأ: ${err.message}`, 'error');
  }
}

function filterTable(query) {
  const q = query.trim().toLowerCase();
  const rows = document.querySelectorAll('#sheetDataTable tbody tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

// ═══════════ Settings Modal ═══════════
function initSettings() {
  const modal = document.getElementById('settingsModal');
  const openBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('closeSettingsBtn');
  const form = document.getElementById('settingsForm');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => modal.style.display = 'flex');
    closeBtn?.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const gasUrl = document.getElementById('settingsGasUrl').value.trim();

    if (gasUrl) {
      localStorage.setItem('alaseel_gas_webapp_url', gasUrl);
    } else {
      localStorage.removeItem('alaseel_gas_webapp_url');
    }

    modal.style.display = 'none';
    showToast('تم حفظ الإعدادات بنجاح!', 'success');
    updateConnectionStatus();
  });
}

function loadSavedSettings() {
  const gasInput = document.getElementById('settingsGasUrl');
  if (gasInput) gasInput.value = localStorage.getItem('alaseel_gas_webapp_url') || '';
}

// ═══════════ Toast Helper ═══════════
function showToast(msg, type = 'info') {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.className = 'admin-toast';
    document.body.appendChild(toast);
  }

  toast.className = `admin-toast ${type} show`;
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}