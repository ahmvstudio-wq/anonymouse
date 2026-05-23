import { piiFilter } from './index';

describe('PII Filter Agent Unit Tests', () => {
  // 1. Clean message
  test('should pass through clean message unchanged', () => {
    const text = 'Hello, how is the project going? Let us meet tomorrow at 10 AM.';
    const result = piiFilter(text);
    expect(result.clean).toBe(true);
    expect(result.redactedText).toBe(text);
    expect(result.types).toEqual([]);
  });

  // 2. Indian Phone (2 examples)
  test('should redact Indian phone numbers', () => {
    const example1 = 'Call me at +91 9876543210';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Call me at [REDACTED BY SYSTEM]');
    expect(result1.types).toContain('INDIAN_PHONE');

    const example2 = 'My number is 09876543210';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('My number is [REDACTED BY SYSTEM]');
    expect(result2.types).toContain('INDIAN_PHONE');
  });

  // 3. International Phone (2 examples)
  test('should redact international phone numbers', () => {
    const example1 = 'Reach me at +15551234567';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Reach me at [REDACTED BY SYSTEM]');
    expect(result1.types).toContain('INTL_PHONE');

    const example2 = 'Dial +442079460192';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('Dial [REDACTED BY SYSTEM]');
    expect(result2.types).toContain('INTL_PHONE');
  });

  // 4. Email (2 examples)
  test('should redact email addresses', () => {
    const example1 = 'Contact me at test.user@example.com';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Contact me at [REDACTED BY SYSTEM]');
    expect(result1.types).toContain('EMAIL');

    const example2 = 'Email user_name+sub@domain.co.uk for details';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('Email [REDACTED BY SYSTEM] for details');
    expect(result2.types).toContain('EMAIL');
  });

  // 5. UPI ID (2 examples)
  test('should redact UPI IDs', () => {
    const example1 = 'Pay me at receiver@okaxis';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Pay me at [REDACTED BY SYSTEM]');
    expect(result1.types).toContain('UPI');

    const example2 = 'My UPI handle is name.lastname@ybl';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('My UPI handle is [REDACTED BY SYSTEM]');
    expect(result2.types).toContain('UPI');
  });

  // 6. @handle (2 examples)
  test('should redact social @handles', () => {
    const example1 = 'Ping me at @my_telegram_handle';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Ping me at [REDACTED BY SYSTEM]');
    expect(result1.types).toContain('SOCIAL');

    const example2 = 'Check out @twitterName';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('Check out [REDACTED BY SYSTEM]');
    expect(result2.types).toContain('SOCIAL');
  });

  // 7. t.me link (2 examples)
  test('should redact t.me links', () => {
    const example1 = 'Visit t.me/mychannel for info';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Visit [REDACTED BY SYSTEM] for info');
    expect(result1.types).toContain('SOCIAL');

    const example2 = 'Join group: t.me/joinchat/xyz123';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('Join group: [REDACTED BY SYSTEM]');
    expect(result2.types).toContain('SOCIAL');
  });

  // 8. wa.me link (2 examples)
  test('should redact wa.me links', () => {
    const example1 = 'Chat on wa.me/919876543210';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Chat on [REDACTED BY SYSTEM]');
    expect(result1.types).toContain('SOCIAL');

    const example2 = 'Contact wa.me/qr/xyz';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('Contact [REDACTED BY SYSTEM]');
    expect(result2.types).toContain('SOCIAL');
  });

  // 9. External URL (2 examples)
  test('should redact external URLs', () => {
    const example1 = 'Go to http://malicious-site.com';
    const result1 = piiFilter(example1);
    expect(result1.clean).toBe(false);
    expect(result1.redactedText).toBe('Go to [REDACTED BY SYSTEM]');
    expect(result1.types).toContain('EXTERNAL_URL');

    const example2 = 'Read documentation at https://google.com/details';
    const result2 = piiFilter(example2);
    expect(result2.clean).toBe(false);
    expect(result2.redactedText).toBe('Read documentation at [REDACTED BY SYSTEM]');
    expect(result2.types).toContain('EXTERNAL_URL');
  });
});
