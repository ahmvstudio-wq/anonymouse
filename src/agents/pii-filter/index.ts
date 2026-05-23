const INDIAN_PHONE = /(?:(?:\+91|0)[- ]?)?[6-9]\d{9}/g;
const INTL_PHONE = /\+[1-9]\d{6,14}/g;
const EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const SOCIAL = /@[a-zA-Z0-9_.]{2,30}|t\.me\/\S+|wa\.me\/\S+/g;
const UPI = /[a-zA-Z0-9._\-]{3,}@[a-zA-Z]{2,}/g;
const EXTERNAL_URL = /https?:\/\/\S+/gi;

export function piiFilter(text: string): { clean: boolean; redactedText: string; types: string[] } {
  try {
    let clean = true;
    let redactedText = text;
    const types: string[] = [];

    // 1. Check Email first
    EMAIL.lastIndex = 0;
    if (redactedText.match(EMAIL)) {
      clean = false;
      types.push('EMAIL');
      EMAIL.lastIndex = 0;
      redactedText = redactedText.replace(EMAIL, '[REDACTED BY SYSTEM]');
    }

    // 2. Check UPI ID next (shares @, but lacks domain dots)
    UPI.lastIndex = 0;
    if (redactedText.match(UPI)) {
      clean = false;
      types.push('UPI');
      UPI.lastIndex = 0;
      redactedText = redactedText.replace(UPI, '[REDACTED BY SYSTEM]');
    }

    // 3. Check Social links & handles (@handle, t.me, wa.me)
    SOCIAL.lastIndex = 0;
    if (redactedText.match(SOCIAL)) {
      clean = false;
      types.push('SOCIAL');
      SOCIAL.lastIndex = 0;
      redactedText = redactedText.replace(SOCIAL, '[REDACTED BY SYSTEM]');
    }

    // 4. Check External URL (http/https)
    EXTERNAL_URL.lastIndex = 0;
    if (redactedText.match(EXTERNAL_URL)) {
      clean = false;
      types.push('EXTERNAL_URL');
      EXTERNAL_URL.lastIndex = 0;
      redactedText = redactedText.replace(EXTERNAL_URL, '[REDACTED BY SYSTEM]');
    }

    // 5. Check Indian Phone
    INDIAN_PHONE.lastIndex = 0;
    if (redactedText.match(INDIAN_PHONE)) {
      clean = false;
      types.push('INDIAN_PHONE');
      INDIAN_PHONE.lastIndex = 0;
      redactedText = redactedText.replace(INDIAN_PHONE, '[REDACTED BY SYSTEM]');
    }

    // 6. Check International Phone
    INTL_PHONE.lastIndex = 0;
    if (redactedText.match(INTL_PHONE)) {
      clean = false;
      types.push('INTL_PHONE');
      INTL_PHONE.lastIndex = 0;
      redactedText = redactedText.replace(INTL_PHONE, '[REDACTED BY SYSTEM]');
    }

    return {
      clean,
      redactedText,
      types,
    };
  } catch (error) {
    console.error('PII filter error:', error);
    return {
      clean: false,
      redactedText: '[MESSAGE BLOCKED BY SYSTEM]',
      types: ['ERROR'],
    };
  }
}
