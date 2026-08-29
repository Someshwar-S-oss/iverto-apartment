import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const mockConfigService = {
    get: jest.fn().mockReturnValue('test_secret'),
  };

  beforeEach(() => {
    strategy = new JwtStrategy(mockConfigService as unknown as ConfigService);
  });

  it('should validate and extract user data from valid JWT payload', async () => {
    const payload = {
      sub: 'u-123',
      email: 'test@example.com',
      isSuperadmin: true,
      mustChangePassword: false,
    };

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      id: 'u-123',
      userId: 'u-123',
      email: 'test@example.com',
      isSuperadmin: true,
      mustChangePassword: false,
    });
  });

  it('should throw UnauthorizedException if sub is missing', async () => {
    await expect(strategy.validate({} as any)).rejects.toThrow(UnauthorizedException);
  });
});
