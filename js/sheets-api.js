/* ============================================
   الأصيل بين القارات — Google Sheets Integration (Secured)
   Communicates with secure serverless endpoints (/api/public-data, /api/track)
   Zero exposure of Sheet IDs, customer passports, or private data.
   ============================================ */

const SheetsAPI = (() => {
  // Sheet tab names (for public display)
  const SHEETS = {
    NEWS: 'الأخبار',
    GALLERY: 'الصور',
    VIDEOS: 'الفيديو',
    PACKAGES: 'الباقات',
    REQUIREMENTS: 'المتطلبات'
  };

  // ─── Core: Fetch data via Serverless Public API ───
  async function fetchSheetData(sheetName) {
    const url = `/api/public-data?sheet=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const json = await response.json();
      if (!json.success || !Array.isArray(json.data)) {
        throw new Error(json.error || 'فشل في استرجاع البيانات');
      }

      return json.data;
    } catch (error) {
      console.error(`Error fetching sheet "${sheetName}":`, error);
      throw error;
    }
  }

  // ─── Tracking: Secure search via Serverless Tracking API ───
  async function searchTracking(passportNumber) {
    if (!passportNumber || !passportNumber.trim()) {
      return { found: false, error: 'الرجاء إدخال رقم الجواز' };
    }

    const passport = passportNumber.trim();
    const url = `/api/track?passport=${encodeURIComponent(passport)}&_t=${Date.now()}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        return {
          found: false,
          error: data.error || `تعذر الاستعلام (${response.status})`
        };
      }

      return data;
    } catch (error) {
      console.error('Tracking API error:', error);
      return {
        found: false,
        error: 'حدث خطأ في الاتصال بالخادم. حاول مرة أخرى.'
      };
    }
  }

  // ─── News: Load active news articles ───
  async function loadNews() {
    try {
      const rows = await fetchSheetData(SHEETS.NEWS);
      return rows.filter(row => {
        const active = String(row['نشط؟'] || '').trim().toLowerCase();
        return active === 'نعم' || active === 'yes' || active === 'true' || active === '1';
      }).map(row => ({
        title: row['العنوان'] || '',
        text: row['النص'] || '',
        image: row['رابط الصورة'] || '',
        date: row['تاريخ النشر'] || ''
      }));
    } catch (error) {
      console.error('Error loading news:', error);
      return [];
    }
  }

  // ─── Gallery: Load photos ───
  async function loadGallery() {
    try {
      const rows = await fetchSheetData(SHEETS.GALLERY);
      return rows.filter(row => row['رابط الصورة'] && String(row['رابط الصورة']).trim())
        .map(row => ({
          image: convertDriveLink(String(row['رابط الصورة']).trim()),
          description: row['الوصف'] || ''
        }));
    } catch (error) {
      console.error('Error loading gallery:', error);
      return [];
    }
  }

  // ─── Videos: Load active videos ───
  async function loadVideos() {
    try {
      const rows = await fetchSheetData(SHEETS.VIDEOS);
      return rows.filter(row => {
        const active = String(row['نشط؟'] || '').trim().toLowerCase();
        const hasUrl = row['رابط اليوتيوب'] && String(row['رابط اليوتيوب']).trim();
        return hasUrl && (active === 'نعم' || active === 'yes' || active === 'true' || active === '1');
      }).map(row => ({
        url: row['رابط اليوتيوب'] || '',
        title: row['العنوان'] || '',
        embedUrl: getYoutubeEmbedUrl(row['رابط اليوتيوب'] || ''),
        thumbnailUrl: getYoutubeThumbnail(row['رابط اليوتيوب'] || '')
      }));
    } catch (error) {
      console.error('Error loading videos:', error);
      return [];
    }
  }

  // ─── Packages: Load packages ───
  async function loadPackages() {
    try {
      const rows = await fetchSheetData(SHEETS.PACKAGES);
      return rows.filter(row => {
        const active = String(row['نشط؟'] || '').trim().toLowerCase();
        return active === 'نعم' || active === 'yes' || active === 'true' || active === '1';
      }).map(row => ({
        title: row['اسم الباقة'] || '',
        destination: row['الوجهة'] || '',
        price: row['السعر'] || '',
        duration: row['المدة'] || '',
        description: row['الوصف'] || '',
        includes: row['يشمل'] || '',
        image: convertDriveLink(String(row['رابط الصورة'] || '').trim())
      }));
    } catch (error) {
      console.error('Error loading packages:', error);
      return [];
    }
  }

  // ─── Requirements: Load service requirements ───
  async function loadRequirements(serviceType) {
    try {
      const rows = await fetchSheetData(SHEETS.REQUIREMENTS);
      return rows.filter(row => {
        const type = String(row['نوع الخدمة'] || '').trim();
        const active = String(row['نشط؟'] || '').trim().toLowerCase();
        const isActive = active === 'نعم' || active === 'yes' || active === 'true' || active === '1';
        return type === serviceType && isActive;
      }).map(row => ({
        tabName: String(row['اسم التبويب'] || '').trim(),
        price: String(row['السعر'] || '').trim(),
        description: String(row['الوصف'] || '').trim(),
        requirements: parseRequirements(String(row['المتطلبات'] || '')),
        notes: String(row['ملاحظات'] || '').trim()
      }));
    } catch (error) {
      console.error('Error loading requirements:', error);
      return [];
    }
  }

  function parseRequirements(text) {
    if (!text) return [];
    const cases = text.split('===').map(c => c.trim()).filter(c => c);
    if (cases.length <= 1) {
      return text.split('\n').map(line => line.trim()).filter(line => line && line !== '---' && line !== '===');
    }
    return cases.map(caseText => {
      const lines = caseText.split('\n').map(l => l.trim()).filter(l => l);
      const titleLine = lines[0];
      const items = lines.slice(1).filter(l => l !== '---');
      return {
        title: titleLine,
        items: items
      };
    });
  }

  // ─── Helpers ───
  function convertDriveLink(url) {
    if (!url) return '';
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (openMatch) {
      return `https://lh3.googleusercontent.com/d/${openMatch[1]}`;
    }
    return url;
  }

  function getYoutubeEmbedUrl(url) {
    const videoId = extractYoutubeId(url);
    return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : '';
  }

  function getYoutubeThumbnail(url) {
    const videoId = extractYoutubeId(url);
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
  }

  function extractYoutubeId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function showLoading(container) {
    container.innerHTML = `
      <div class="sheets-loading">
        <div class="sheets-spinner"></div>
        <p>جارٍ التحميل...</p>
      </div>
    `;
  }

  function showEmpty(container, message) {
    container.innerHTML = `
      <div class="sheets-empty">
        <div class="icon">📭</div>
        <p>${message}</p>
      </div>
    `;
  }

  function showError(container, message) {
    container.innerHTML = `
      <div class="sheets-error">
        <div class="icon">⚠️</div>
        <p>${message || 'حدث خطأ في تحميل البيانات. حاول تحديث الصفحة.'}</p>
      </div>
    `;
  }

  return {
    fetchSheetData,
    searchTracking,
    loadNews,
    loadGallery,
    loadVideos,
    loadRequirements,
    loadPackages,
    showLoading,
    showEmpty,
    showError,
    SHEETS
  };
})();