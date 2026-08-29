/* ============================================
   الشات بوت — الأصيل بين القارات
   AI Chatbot powered by Google Gemini
   ============================================ */

(() => {
  'use strict';

  // ═══════════════════════════════════════════
  // ═══════════════════════════════════════════
  // تم نقل مفتاح الـ API إلى Vercel Environment Variables لمزيد من الأمان
  // ═══════════════════════════════════════════

  // رابط الخادم الوسيط (Serverless Function)
  const API_URL = '/api/chat';

  // ─── System Prompt ───
  const SYSTEM_PROMPT = `أنت مساعد ذكي ومحترف لمكتب "الأصيل بين القارات" — مكتب سفريات يمني بترخيص رقم 46. مهمتك مساعدة العملاء والإجابة على استفساراتهم بدقة واحتراف.

## قواعد عامة:
- تحدث بالعربية الفصحى المبسطة
- كن مختصراً ومفيداً
- إذا لم تعرف إجابة، حيل العميل لخدمة العملاء
- لا تخترع معلومات — إذا لم تجد معلومة في قاعدة معلوماتك، قل ذلك
-  الاحترام والوداعة
- إذا سأل العميل عن سعر معين ولم تجد السعر في قاعدة معلوماتك، قل "تواصل معنا لمعرفة السعر"

## معلومات المكتب:
- الاسم: الأصيل بين القارات — ترخيص رقم 46
- الفروع: صنعاء (الرئيسي)، عدن، تعز، مأرب
- أوقات الدوام: السبت–الخميس، 9:00 صباحاً–1:00 ظهراً | 4:00 عصراً–9:00 مساءً

## أرقام التواصل:
- أيدي عاملة: 770001996 / 770040097
- الطيران: 779111667 / 776677544
- الحج والعمرة: 779668666 / 779944939
- واتساب عام: 967770001996
- واتساب للشكاوى: 967770007336
- البريد: alaseeltravel2@gmail.com

## الأنظمة المستخدمة:
- يعملون على أنظمة إنجاز والمساند
- المكاتب المرتبطة في مساند: محمد مصطفى للاستقدام، الفريد للاستقدام، الثقة للاستقدام

## تفويض التأشيرات:
- المتطلبات: صورة الجواز + صورة التأشيرة
- عمالة منزلية: يتواصل مع خدمة العملاء لمعرفة المكاتب المتعاقدين معها
- مهنية: يمكن تفويضها من أي مكتب استقدام في السعودية

## خدمات الأيدي العاملة:
- تأشيرات عمل: 600 ر.س — المتطلبات: الجواز، صورتين 4×6، بحث جنائي، فحص طبي، مستند التأشيرة، التفويض على المكتب، عقد العمل، رخصة قيادة (للسائق)
- تأشيرات زيارة: 800 ر.س — لها 4 حالات (طلب أب/أم، زوجة، أبناء، والد/والدة زوجة)
- تأشيرات إقامة: 600 ر.س — الجواز، صور شخصية، تأشيرة الإقامة، فحص طبي، صورة إقامة، عقد الزواج/شهادات ميلاد
- تمديد خروج وعودة: 500 ر.س — الجواز، صورتين، إقامة الشخص، بطاقة الكفيل، برنت الداخلية، خطاب الكفيل، طلب التمديد

## أحكام خاصة بالزيارة العائلية:
- أبناء أقل من 20 سنة يحتاجون إذن سفر (ذكر أو أنثى)
- البنت: إثبات عزوبية من 15 سنة وما فوق (في الحالة الطبيعية)، ومن 13 سنة إذا كانت هئيتها كبيرة
- اختلاف الأسماء: إذا اختلف اسم الأب عن الابن في الجواز → يجب إرفاق شهادة ميلاد أو بطاقة عائلية تظهر الأسماء الكاملة
- الجوازات المطابقة: الابن = جواز مطابق فقط، البنت = جواز مطابق + شهادة ميلاد
- إذا الأب والأم كلاهما بالسعودية وأحدهما طلب الابن/البنت → الطرف الآخر يجب أن يعطي إذن سفر من المدينة التي هو فيها بالسعودية

## أنواع التأشيرات غير المتوفرة:
- لا توجد: إقامة سياحية، زيارة أعمال، زيارة سياحية، تأشيرة عمل مؤقتة، زيارة شخصية
- توجد زيارة علاجية: بشرط إحضار مستند تأشيرة علاجية من مستشفى حكومي سعودي + سجل من المستشفى

## الحج والعمرة:
- تأشيرات الحج: تواصل معنا — جواز سفر ساري، فحوصات طبية، تسجيل بحملة معتمدة
- تأشيرات العمرة: تواصل معنا — اسم المعتمر، اسم المستضيف، عدد المعتمرين، إقامة المستضيف، صورة الجواز، صورة شخصية، ضمانة تجارية

## سفريات وسياحة:
- فيزا سريلانكا: تأشيرة إلكترونية 30 يوم — جواز 6 أشهر، تذكرة عودة، حجز فندق — مدة الإنجاز 5 أيام
- فيزا إثيوبيا: صلاحية مرنة 30 يوم إضافي — جواز سارٍ، صورة، تاريخ السفر — مدة الإنجاز 2-5 أيام
- فيزا جيبوتي: جواز، مواعيد السفر، حجز فندق، تذكرة طيران — المبلغ غير قابل للاسترداد

## النقل البري:
- طرق النقل إلى عدن: سيارات خاصة، باصات نقل جماعي، باصات بلكه
- رحلات إلى جميع محافظات اليمن والسعودية

## سياسة الإلغاء:
- إذا سأل عن إلغاء تذكرة أو أي شيء → حيله لخدمة العملاء لأن كل شركة لها سياستها الخاصة

## لماذا تختار الأصيل بين القارات:
- وكالة معتمدة بترخيص رقم 46
- 28 سنة خبرة في السوق اليمني
- فروع متعددة (صنعاء، عدن، تعز، مأرب)
- متابعة كاملة من التسجيل حتى الاستلام
- أسعار تنافسية`;

  // ─── State ───
  let conversationHistory = [];
  let isOpen = false;
  let isLoading = false;

  // ─── DOM Elements ───
  let fab, win, messagesEl, textarea, sendBtn;

  // ─── Initialize ───
  function init() {
    createUI();
    bindEvents();
  }

  // ─── Create UI ───
  function createUI() {
    // FAB button
    fab = document.createElement('button');
    fab.className = 'chatbot-fab';
    fab.setAttribute('aria-label', 'اسأل المساعد');
    fab.innerHTML = '<span class="fab-icon-open">💬</span><span class="fab-icon-close">✕</span>';
    document.body.appendChild(fab);

    // Chat window
    win = document.createElement('div');
    win.className = 'chatbot-window';
    win.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-header-avatar">🤖</div>
        <div class="chatbot-header-info">
          <h4>مساعد الأصيل بين القارات</h4>
          <span>متاح الآن</span>
        </div>
        <button class="chatbot-header-close" aria-label="إغلاق">✕</button>
      </div>
      <div class="chatbot-messages" id="chatbotMessages">
        <div class="chat-welcome">
          <div class="chat-welcome-icon">👋</div>
          <h5>مرحباً بك في الأصيل بين القارات</h5>
          <p>يسعدنا مساعدتك! اسأل عن أي خدمة من خدماتنا</p>
          <div class="chat-suggestions">
            <button class="chat-suggestion-btn" data-q="ما هي خدماتكم؟">خدماتكم</button>
            <button class="chat-suggestion-btn" data-q="كم سعر تأشيرة العمل؟">سعر تأشيرة العمل</button>
            <button class="chat-suggestion-btn" data-q="متطلبات تأشيرة الزيارة">متطلبات الزيارة</button>
            <button class="chat-suggestion-btn" data-q="أرقام التواصل">أرقام التواصل</button>
          </div>
        </div>
      </div>
      <div class="chatbot-input">
        <textarea rows="1" placeholder="اكتب سؤالك هنا..." id="chatbotInput"></textarea>
        <button class="chatbot-send" id="chatbotSend" aria-label="إرسال">➤</button>
      </div>
    `;
    document.body.appendChild(win);

    messagesEl = win.querySelector('#chatbotMessages');
    textarea = win.querySelector('#chatbotInput');
    sendBtn = win.querySelector('#chatbotSend');
  }

  // ─── Bind Events ───
  function bindEvents() {
    // Toggle chat
    fab.addEventListener('click', () => {
      isOpen = !isOpen;
      fab.classList.toggle('active', isOpen);
      win.classList.toggle('open', isOpen);
      if (isOpen) textarea.focus();
    });

    // Close button
    win.querySelector('.chatbot-header-close').addEventListener('click', () => {
      isOpen = false;
      fab.classList.remove('active');
      win.classList.remove('open');
    });

    // Send message
    sendBtn.addEventListener('click', sendMessage);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    });

    // Suggestion buttons
    win.querySelectorAll('.chat-suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        textarea.value = btn.dataset.q;
        sendMessage();
      });
    });
  }

  // ─── Send Message ───
  async function sendMessage() {
    const text = textarea.value.trim();
    if (!text || isLoading) return;

    // Add user message
    addUserMessage(text);
    textarea.value = '';
    textarea.style.height = 'auto';
    isLoading = true;
    sendBtn.disabled = true;

    // Show typing indicator
    const typingEl = showTyping();

    try {
      // Build conversation
      const contents = [];

      // Add history
      conversationHistory.forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });

      // Add current message
      contents.push({ role: 'user', parts: [{ text }] });

      const body = {
        contents: contents
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        let errMsg = `HTTP ${response.status}`;
        if (typeof err.error === 'string') errMsg = err.error;
        else if (err.error?.message) errMsg = err.error.message;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const reply = data.reply || data.candidates?.[0]?.content?.parts?.[0]?.text || 'عذراً، لم أتمكن من فهم سؤالك. حاول مرة أخرى.';

      // Save to history
      conversationHistory.push({ role: 'user', text });
      conversationHistory.push({ role: 'assistant', text: reply });

      // Keep history manageable (last 20 messages)
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }

      // Remove typing, show reply
      typingEl.remove();
      showAssistantMessage(reply);

    } catch (error) {
      console.error('Chatbot error:', error);
      typingEl.remove();
      showAssistantMessage('⚠️ حدث خطأ: ' + error.message);
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
    }
  }

  // ─── Add User Message ───
  function addUserMessage(text) {
    // Remove welcome screen if exists
    const welcome = messagesEl.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML = `
      <div class="chat-msg-avatar">👤</div>
      <div class="chat-msg-bubble">${escapeHtml(text)}</div>
    `;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  // ─── Show Assistant Message ───
  function showAssistantMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.innerHTML = `
      <div class="chat-msg-avatar">🤖</div>
      <div class="chat-msg-bubble">${formatMessage(text)}</div>
    `;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  // ─── Typing Indicator ───
  function showTyping() {
    const div = document.createElement('div');
    div.className = 'chat-typing';
    div.innerHTML = `
      <div class="chat-msg-avatar" style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#D4A537,#E8C56A);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🤖</div>
      <div class="chat-typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  // ─── Helpers ───
  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatMessage(text) {
    // Basic formatting: links, bold, line breaks
    let html = escapeHtml(text);
    // Convert URLs to links
    html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Bold with **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return html;
  }

  // ─── Start ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
