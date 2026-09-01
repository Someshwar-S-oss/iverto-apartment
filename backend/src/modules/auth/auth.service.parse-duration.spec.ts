import { parseDurationMs } from './auth.service';

describe('parseDurationMs', () => {
  it('should parse days', () => {
    expect(parseDurationMs('30d', -1)).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('should parse hours', () => {
    expect(parseDurationMs('24h', -1)).toBe(24 * 60 * 60 * 1000);
  });

  it('should parse minutes', () => {
    expect(parseDurationMs('15m', -1)).toBe(15 * 60 * 1000);
  });

  it('should parse seconds', () => {
    expect(parseDurationMs('90s', -1)).toBe(90 * 1000);
  });

  it('should treat a bare number as milliseconds', () => {
    expect(parseDurationMs('5000', -1)).toBe(5000);
  });

  it('should tolerate whitespace between the number and unit', () => {
    expect(parseDurationMs(' 7 d ', -1)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('should fall back to the provided default for unparseable input', () => {
    expect(parseDurationMs('not-a-duration', 12345)).toBe(12345);
    expect(parseDurationMs('', 12345)).toBe(12345);
  });
});
