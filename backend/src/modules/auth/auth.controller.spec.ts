import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    login: jest.fn(),
    changePassword: jest.fn(),
    refreshAccessToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should call authService.login and return result', async () => {
      const loginDto = { email: 'user@example.com', password: 'password123' };
      const expectedResult = {
        accessToken: 'jwt_test_token',
        user: {
          id: 'u-1',
          email: 'user@example.com',
          name: 'User One',
          isSuperadmin: false,
          mustChangePassword: true,
        },
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.login).toHaveBeenCalledWith('user@example.com', 'password123');
    });
  });

  describe('changePassword', () => {
    it('should extract userId from req.user and call authService.changePassword', async () => {
      const changePasswordDto = { newPassword: 'NewSecurePassword123!' };
      const req = {
        user: {
          id: 'u-1',
          email: 'user@example.com',
        },
      };
      const expectedResult = {
        accessToken: 'new_jwt_token',
        message: 'Password changed successfully',
        user: {
          id: 'u-1',
          mustChangePassword: false,
        },
      };

      mockAuthService.changePassword.mockResolvedValue(expectedResult);

      const result = await controller.changePassword(req, changePasswordDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.changePassword).toHaveBeenCalledWith('u-1', 'NewSecurePassword123!');
    });
  });

  describe('refresh', () => {
    it('should call authService.refreshAccessToken with the provided refresh token', async () => {
      const dto = { refreshToken: 'raw-refresh-token' };
      const expectedResult = {
        accessToken: 'new_jwt_token',
        refreshToken: 'new-raw-refresh-token',
        user: { id: 'u-1' },
      };

      mockAuthService.refreshAccessToken.mockResolvedValue(expectedResult);

      const result = await controller.refresh(dto as any);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith('raw-refresh-token');
    });
  });

  describe('logout', () => {
    it('should revoke the provided refresh token and return success', async () => {
      const dto = { refreshToken: 'raw-refresh-token' };
      mockAuthService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await controller.logout(dto as any);

      expect(result).toEqual({ success: true });
      expect(mockAuthService.revokeRefreshToken).toHaveBeenCalledWith('raw-refresh-token');
    });
  });
});
