import { M50XmlCodec } from './m50.xml-codec';

describe('M50XmlCodec', () => {
  it('should decode base64 UTF-16LE user names correctly', () => {
    // "SABlAGwAbABvAA==" encodes "Hello\0" in UTF-16LE
    const decoded = M50XmlCodec.decodeUtf16leBase64('SABlAGwAbABvAA==');
    expect(decoded).toBe('Hello');

    const customName = 'John Doe';
    const encoded = M50XmlCodec.encodeUtf16leBase64(customName);
    expect(M50XmlCodec.decodeUtf16leBase64(encoded)).toBe(customName);
  });

  it('should handle empty or invalid base64 names gracefully', () => {
    expect(M50XmlCodec.decodeUtf16leBase64('')).toBe('');
    expect(M50XmlCodec.encodeUtf16leBase64('')).toBe('');
  });

  it('should parse M50 hardware timestamps with extra hyphen', () => {
    const parsedDate = M50XmlCodec.parseDeviceTime('2026-08-28-T15:30:00Z');
    expect(parsedDate.getUTCFullYear()).toBe(2026);
    expect(parsedDate.getUTCMonth()).toBe(7); // August (0-indexed)
    expect(parsedDate.getUTCDate()).toBe(28);
    expect(parsedDate.getUTCHours()).toBe(15);
    expect(parsedDate.getUTCMinutes()).toBe(30);
    expect(parsedDate.getUTCSeconds()).toBe(0);
  });

  it('should parse standard ISO timestamps', () => {
    const parsedDate = M50XmlCodec.parseDeviceTime('2026-08-28T10:15:30Z');
    expect(parsedDate.getUTCFullYear()).toBe(2026);
    expect(parsedDate.getUTCMonth()).toBe(7);
    expect(parsedDate.getUTCDate()).toBe(28);
    expect(parsedDate.getUTCHours()).toBe(10);
  });

  it('should format date to M50 timestamp string with extra hyphen', () => {
    const testDate = new Date(Date.UTC(2026, 7, 28, 15, 30, 0));
    const formatted = M50XmlCodec.formatDeviceTime(testDate);
    expect(formatted).toBe('2026-08-28-T15:30:00Z');
  });

  it('should build XML response with payload correctly', () => {
    const xml = M50XmlCodec.buildResponse('Register', {
      DeviceSerialNo: 'DEV-001',
      Token: 'token-abc-123',
      Result: 'OK',
    });

    expect(xml).toContain('<?xml version="1.0"?>');
    expect(xml).toContain('<Message>');
    expect(xml).toContain('<Response>Register</Response>');
    expect(xml).toContain('<DeviceSerialNo>DEV-001</DeviceSerialNo>');
    expect(xml).toContain('<Token>token-abc-123</Token>');
    expect(xml).toContain('<Result>OK</Result>');
  });

  it('should parse XML strings to JavaScript objects', () => {
    const xml = `
      <Message>
        <Request>Register</Request>
        <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
        <CloudId>cloud-123</CloudId>
      </Message>
    `;
    const parsed = M50XmlCodec.parseXml(xml);
    expect(parsed).toBeDefined();
    expect(parsed.Message).toBeDefined();
    expect(parsed.Message.Request).toBe('Register');
    expect(parsed.Message.DeviceSerialNo).toBe('DJ20250307014');
    expect(parsed.Message.CloudId).toBe('cloud-123');
  });
});
