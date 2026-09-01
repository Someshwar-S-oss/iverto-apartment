import { AccountThrottlerGuard } from './account-throttler.guard';

describe('AccountThrottlerGuard', () => {
  let guard: AccountThrottlerGuard;
  let mockJwtService: any;

  const getTracker = (req: Record<string, any>): Promise<string> =>
    (guard as any).getTracker(req);

  beforeEach(() => {
    mockJwtService = { decode: jest.fn() };
    // Base ThrottlerGuard's constructor params (options/storage/reflector) are never
    // touched by getTracker, so bare stand-ins are enough here.
    guard = new AccountThrottlerGuard({} as any, {} as any, {} as any, mockJwtService);
  });

  it('should key on the authenticated account when a valid bearer token is present', async () => {
    mockJwtService.decode.mockReturnValue({ sub: 'user-123' });

    const tracker = await getTracker({
      headers: { authorization: 'Bearer some.jwt.token' },
    });

    expect(tracker).toBe('user:user-123');
    expect(mockJwtService.decode).toHaveBeenCalledWith('some.jwt.token');
  });

  it('should fall back to IP when there is no Authorization header (e.g. login)', async () => {
    const tracker = await getTracker({ headers: {}, ip: '10.0.0.5', ips: [] });

    expect(tracker).toBe('10.0.0.5');
    expect(mockJwtService.decode).not.toHaveBeenCalled();
  });

  it('should fall back to IP when the token decodes with no sub', async () => {
    mockJwtService.decode.mockReturnValue({ foo: 'bar' });

    const tracker = await getTracker({
      headers: { authorization: 'Bearer garbage' },
      ip: '10.0.0.6',
      ips: [],
    });

    expect(tracker).toBe('10.0.0.6');
  });

  it('should fall back to IP when decoding throws', async () => {
    mockJwtService.decode.mockImplementation(() => {
      throw new Error('malformed token');
    });

    const tracker = await getTracker({
      headers: { authorization: 'Bearer garbage' },
      ip: '10.0.0.7',
      ips: [],
    });

    expect(tracker).toBe('10.0.0.7');
  });

  it('should prefer the first proxied ip when present', async () => {
    const tracker = await getTracker({ headers: {}, ip: '10.0.0.8', ips: ['203.0.113.1', '10.0.0.8'] });

    expect(tracker).toBe('203.0.113.1');
  });
});
