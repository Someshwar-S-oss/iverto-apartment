import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export class M50XmlCodec {
  private static parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });

  private static builder = new XMLBuilder({
    ignoreAttributes: false,
    suppressEmptyNode: false,
  });

  /**
   * Parse raw XML string to JS object
   */
  static parseXml(xmlString: string): any {
    if (!xmlString || !xmlString.trim()) {
      return {};
    }
    return this.parser.parse(xmlString);
  }

  /**
   * Build XML Response string formatted for M50 Terminal
   */
  static buildResponse(type: string, payload: Record<string, any> = {}): string {
    const messageObj: Record<string, any> = {
      Response: type,
      ...payload,
    };

    const xml = this.builder.build({
      Message: messageObj,
    });

    return `<?xml version="1.0"?>\n${xml}`;
  }

  /**
   * Decode Base64-encoded UTF-16LE user names
   */
  static decodeUtf16leBase64(b64: string): string {
    if (!b64) return '';
    try {
      const buf = Buffer.from(b64, 'base64');
      return buf.toString('utf16le').replace(/\0/g, '').trim();
    } catch {
      return '';
    }
  }

  /**
   * Encode string to Base64 UTF-16LE
   */
  static encodeUtf16leBase64(str: string): string {
    if (!str) return '';
    return Buffer.from(str, 'utf16le').toString('base64');
  }

  /**
   * Parse M50 hardware timestamps that may include an extra hyphen before 'T'
   * e.g. "2026-08-28-T15:30:00Z" or standard "2026-08-28T15:30:00Z"
   */
  static parseDeviceTime(timeStr: string): Date {
    if (!timeStr) return new Date();
    const trimmed = timeStr.trim();
    const normalized = trimmed.replace('-T', 'T');
    const parsed = new Date(normalized);

    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Fallback manual regex match
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})-?T(\d{1,2}):(\d{2}):(\d{2})Z?$/i.exec(trimmed);
    if (match) {
      const [, y, m, day, hh, mm, ss] = match;
      return new Date(Date.UTC(+y, +m - 1, +day, +hh, +mm, +ss));
    }

    return new Date();
  }

  /**
   * Format Date to M50 timestamp string (e.g. 2026-08-28-T15:30:00Z)
   */
  static formatDeviceTime(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    return `${y}-${m}-${d}-T${hh}:${mm}:${ss}Z`;
  }
}
