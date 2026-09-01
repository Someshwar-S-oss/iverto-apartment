import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ApprovalsService } from '../src/modules/approvals/approvals.service';
import { DrizzleService } from '../src/database/drizzle.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';
import { approvalRequests, entryEvents } from '../src/database/schema';

describe('Approvals Atomic Decision & Race Condition E2E Suite', () => {
  let approvalsService: ApprovalsService;
  let inMemoryDb: {
    approvalRequests: any[];
    entryEvents: any[];
  };
  let mockRealtime: {
    emitToGate: jest.Mock;
    emitToUnit: jest.Mock;
  };

  beforeEach(async () => {
    inMemoryDb = {
      approvalRequests: [
        {
          id: 'appr-race-1',
          entryEventId: 'evt-1',
          unitId: 'unit-101',
          status: 'PENDING',
          decidedByUserId: null,
          decidedAt: null,
          expiresAt: new Date(Date.now() + 60000), // 1 min in future
          createdAt: new Date(),
        },
        {
          id: 'appr-expired-1',
          entryEventId: 'evt-2',
          unitId: 'unit-101',
          status: 'PENDING',
          decidedByUserId: null,
          decidedAt: null,
          expiresAt: new Date(Date.now() - 5000), // expired 5s ago
          createdAt: new Date(Date.now() - 95000),
        },
      ],
      entryEvents: [
        {
          id: 'evt-1',
          gateId: 'gate-north',
          visitorName: 'Delivery Driver Dave',
          subjectType: 'DELIVERY',
        },
      ],
    };

    mockRealtime = {
      emitToGate: jest.fn(),
      emitToUnit: jest.fn(),
    };

    // Simulated atomic single-winner SQL update
    let isWinnerChosen = false;

    const mockDrizzle = {
      db: {
        insert: (table: any) => ({
          values: (vals: any) => ({
            returning: async () => {
              const inserted = { id: `appr-${Date.now()}`, ...vals };
              inMemoryDb.approvalRequests.push(inserted);
              return [inserted];
            },
          }),
        }),
        update: (table: any) => ({
          set: (updateVals: any) => ({
            where: (_condition: any) => ({
              returning: async () => {
                const record = inMemoryDb.approvalRequests.find((r) => r.id === 'appr-race-1');
                if (!record || record.status !== 'PENDING' || isWinnerChosen) {
                  return []; // Zero rows updated (atomic race loser)
                }
                // First to update atomically wins
                isWinnerChosen = true;
                record.status = updateVals.status;
                record.decidedByUserId = updateVals.decidedByUserId;
                record.decidedAt = updateVals.decidedAt || new Date();
                return [record];
              },
            }),
          }),
        }),
        select: () => ({
          from: (table: any) => ({
            where: (_cond: any) => ({
              limit: async () => {
                return inMemoryDb.entryEvents.filter((e) => e.id === 'evt-1');
              },
            }),
          }),
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        {
          provide: DrizzleService,
          useValue: mockDrizzle,
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtime,
        },
      ],
    }).compile();

    approvalsService = module.get<ApprovalsService>(ApprovalsService);
  });

  it('should resolve concurrent approval decisions atomically with a single winner and 409 on race', async () => {
    const user1 = 'resident-uuid-1';
    const user2 = 'resident-uuid-2';

    // Simulate two residents in same unit tapping Approve and Reject at the exact same millisecond
    const results = await Promise.allSettled([
      approvalsService.decideApproval('appr-race-1', 'unit-101', user1, 'APPROVED'),
      approvalsService.decideApproval('appr-race-1', 'unit-101', user2, 'REJECTED'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    // Exactly 1 winner
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Winner resolved to valid state
    const winnerResult = fulfilled[0].value;
    expect(['APPROVED', 'REJECTED']).toContain(winnerResult.status);
    expect(winnerResult.decidedByUserId).toBeDefined();

    // Loser receives 409 ConflictException
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(rejected[0].reason.message).toContain('already decided');

    // Real-time broadcast occurred for the winner decision
    expect(mockRealtime.emitToGate).toHaveBeenCalledTimes(1);
    expect(mockRealtime.emitToUnit).toHaveBeenCalledTimes(1);
    expect(mockRealtime.emitToGate).toHaveBeenCalledWith(
      'gate-north',
      'approval.decided',
      expect.objectContaining({
        approvalId: 'appr-race-1',
        status: winnerResult.status,
      }),
    );
  });

  it('should throw ConflictException on subsequent decision after an approval is already decided', async () => {
    inMemoryDb.approvalRequests[0].status = 'APPROVED';

    await expect(
      approvalsService.decideApproval('appr-race-1', 'unit-101', 'resident-uuid-3', 'REJECTED'),
    ).rejects.toThrow(ConflictException);
  });

  it('should create new approval request with 90s expiry by default', async () => {
    const created = await approvalsService.createApprovalRequest('evt-1', 'unit-101');
    expect(created).toBeDefined();
    expect(created.status).toBe('PENDING');
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now() + 80000);
  });
});
