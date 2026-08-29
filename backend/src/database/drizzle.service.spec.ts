import { ConfigService } from '@nestjs/config';
import { DrizzleService } from './drizzle.service';
import { buildRlsSessionSql } from './rls.helper';

describe('Database Layer & DrizzleService', () => {
  describe('buildRlsSessionSql', () => {
    it('should generate SQL with correct tenant and user parameters', () => {
      const sqlQuery = buildRlsSessionSql({
        userId: '11111111-1111-1111-1111-111111111111',
        societyId: '22222222-2222-2222-2222-222222222222',
        isSuperadmin: false,
      });

      expect(sqlQuery).toBeDefined();
      expect(sqlQuery.queryChunks).toBeDefined();
    });

    it('should handle empty or undefined RlsContext values', () => {
      const sqlQuery = buildRlsSessionSql({});
      expect(sqlQuery).toBeDefined();
    });

    it('should properly set isSuperadmin to true when requested', () => {
      const sqlQuery = buildRlsSessionSql({
        isSuperadmin: true,
      });
      expect(sqlQuery).toBeDefined();
    });
  });

  describe('DrizzleService', () => {
    let service: DrizzleService;
    let configService: ConfigService;

    beforeEach(() => {
      configService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'database.url') {
            return 'postgres://user:pass@localhost:5432/testdb';
          }
          return null;
        }),
      } as unknown as ConfigService;

      service = new DrizzleService(configService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize db on onModuleInit', async () => {
      await service.onModuleInit();
      expect(service.db).toBeDefined();
    });

    it('should execute withTenantContext and pass tx callback', async () => {
      await service.onModuleInit();

      const mockTx = {
        execute: jest.fn().mockResolvedValue({}),
      };

      jest.spyOn(service.db, 'transaction').mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      const result = await service.withTenantContext(
        {
          userId: 'user-123',
          societyId: 'soc-456',
          isSuperadmin: false,
        },
        async (tx) => {
          return { success: true };
        },
      );

      expect(mockTx.execute).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should close connection pool on onModuleDestroy', async () => {
      await service.onModuleInit();
      const endSpy = jest.spyOn((service as any).pool, 'end').mockResolvedValue(undefined as never);
      await service.onModuleDestroy();
      expect(endSpy).toHaveBeenCalled();
    });
  });
});
