// Netlify Function: /api/config
// Returns site configuration ONLY after strict admin authentication
// Never returns secrets or sheetId to unauthenticated requests

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5; // Max 5 login attempts per minute per IP

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
  return userRecord.count > MAX_ATTEMPTS_PER_WINDOW;
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
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
        success: false,
        error: 'تم تجاوز عدد محاولات الدخول المسموح بها. يرجى الانتظار دقيقة والمحاولة مجدداً.'
      })
    };
  }

  try {
    let password = '';
    if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      password = body.password || '';
    } else {
      const params = event.queryStringParameters || {};
      password = params.password || '';
    }

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
    const SHEET_ID = process.env.SHEET_ID || '';
    const APPS_SCRIPT_WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL || '';
    const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

    // Strict validation: Require non-empty ADMIN_PASSWORD configured on server
    if (!ADMIN_PASSWORD) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'ADMIN_PASSWORD غير مضبوط في متغيرات البيئة على الخادم.'
        })
      };
    }

    // Require exact match
    if (!password || password !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'كلمة المرور غير صحيحة.'
        })
      };
    }

    // Reset rate limiter on successful authentication
    rateLimitMap.delete(clientIp);

    // Return admin config only
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sheetId: SHEET_ID,
        webAppUrl: APPS_SCRIPT_WEB_APP_URL,
        adminSecret: ADMIN_SECRET
      })
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