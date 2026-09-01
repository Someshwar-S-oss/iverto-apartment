import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  MobileGuardController,
  MobileEntryEventsController,
} from './mobile-guard.controller';
import { DrizzleService } from '../../database/drizzle.service';
import { EntryEventsService } from '../../modules/entry-events/entry-events.service';
import { ApprovalsService } from '../../modules/approvals/approvals.service';
import { VisitorImagesService } from '../../modules/media/visitor-images.service';
import { StaffService } from '../../modules/staff/staff.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';

describe('MobileGuardController', () => {
  let controller: MobileGuardController;
  let mockDb: any;
  let mockEntryEventsService: any;
  let mockApprovalsService: any;
  let mockVisitorImagesService: any;
  let mockStaffService: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockEntryEventsService = {
      createGuardEntry: jest.fn(),
      verifyPasscode: jest.fn(),
      markExit: jest.fn(),
      listGateEntryEvents: jest.fn(),
    };

    mockApprovalsService = {
      listPendingByGate: jest.fn(),
    };

    mockVisitorImagesService = {
      getImage: jest.fn(),
    };

    mockStaffService = {
      listStaffBySociety: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileGuardController],
      providers: [
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: EntryEventsService,
          useValue: mockEntryEventsService,
        },
        {
          provide: ApprovalsService,
          useValue: mockApprovalsService,
        },
        {
          provide: VisitorImagesService,
          useValue: mockVisitorImagesService,
        },
        {
          provide: StaffService,
          useValue: mockStaffService,
        },
        // These tests call controller methods directly, bypassing the HTTP/interceptor
        // pipeline entirely — IdempotencyInterceptor is never actually invoked here, but
        // Nest still needs to resolve it (referenced via @UseInterceptors on
        // createEntry/verifyPasscode/markExit) to build the module's DI container at
        // compile() time.
        IdempotencyInterceptor,
        {
          provide: IdempotencyService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
      ],
    })
      .overrideGuard(RbacScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MobileGuardController>(MobileGuardController);
  });

  describe('getDirectory', () => {
    it('should return units and residents grouped by unit', async () => {
      // 1. Resolve societyId from gate device
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ societyId: 'soc-1' }]),
          }),
        }),
      });

      // 2. Select units, buildings, memberships, users
      const mockRows = [
        {
          unitId: 'u-101',
          unitNumber: '101',
          buildingId: 'b-1',
          buildingName: 'Tower A',
          societyId: 'soc-1',
          userId: 'usr-1',
          userName: 'John Doe',
          userPhone: '9876543210',
          userRole: 'OWNER',
        },
      ];

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          leftJoin: jest.fn().mockReturnValueOnce({
            leftJoin: jest.fn().mockReturnValueOnce({
              leftJoin: jest.fn().mockReturnValueOnce({
                where: jest.fn().mockResolvedValueOnce(mockRows),
              }),
            }),
          }),
        }),
      });

      const result = await controller.getDirectory('gate-1');
      expect(result).toHaveLength(1);
      expect(result[0].unitNumber).toBe('101');
      expect(result[0].residents).toHaveLength(1);
      expect(result[0].residents[0].name).toBe('John Doe');
    });
  });

  describe('createEntry', () => {
    it('should throw BadRequestException if subjectType is missing', async () => {
      await expect(
        controller.createEntry('gate-1', 'guard-1', {
          subjectType: '' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should process base64 photo and call entryEventsService.createGuardEntry', async () => {
      // 1. Resolve societyId
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ societyId: 'soc-1' }]),
          }),
        }),
      });

      const mockResponse = { entryEvent: { id: 'evt-1' }, autoApproved: false };
      mockEntryEventsService.createGuardEntry.mockResolvedValueOnce(mockResponse);

      const result = await controller.createEntry('gate-1', 'guard-1', {
        subjectType: 'VISITOR',
        visitorName: 'Jane Visitor',
        visitorPhone: '9876500000',
        unitId: 'u-101',
        photoBase64: 'data:image/jpeg;base64,aGVsbG8=',
      });

      expect(result).toEqual(mockResponse);
      expect(mockEntryEventsService.createGuardEntry).toHaveBeenCalledWith(
        'soc-1',
        'gate-1',
        'guard-1',
        expect.objectContaining({
          subjectType: 'VISITOR',
          visitorName: 'Jane Visitor',
          unitId: 'u-101',
          photoBuffer: Buffer.from('aGVsbG8=', 'base64'),
        }),
      );
    });
  });

  describe('verifyPasscode', () => {
    it('should throw BadRequestException if codeOrQrToken missing', async () => {
      await expect(
        controller.verifyPasscode('gate-1', 'guard-1', { codeOrQrToken: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call entryEventsService.verifyPasscode', async () => {
      // 1. Resolve societyId
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ societyId: 'soc-1' }]),
          }),
        }),
      });

      const mockVerifyResult = { verified: true, unitId: 'u-101' };
      mockEntryEventsService.verifyPasscode.mockResolvedValueOnce(mockVerifyResult);

      const result = await controller.verifyPasscode('gate-1', 'guard-1', {
        codeOrQrToken: '123456',
      });

      expect(result).toEqual(mockVerifyResult);
      expect(mockEntryEventsService.verifyPasscode).toHaveBeenCalledWith(
        'soc-1',
        'gate-1',
        'guard-1',
        '123456',
        undefined,
      );
    });
  });

  describe('markExit', () => {
    it('should resolve the gate societyId and call entryEventsService.markExit scoped to it', async () => {
      // Resolve societyId from gate device
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ societyId: 'soc-1' }]),
          }),
        }),
      });

      const mockExit = { id: 'evt-exit-1', direction: 'OUT' };
      mockEntryEventsService.markExit.mockResolvedValueOnce(mockExit);

      const result = await controller.markExit('gate-1', 'evt-1', 'guard-1');
      expect(result).toEqual(mockExit);
      expect(mockEntryEventsService.markExit).toHaveBeenCalledWith('evt-1', 'soc-1', 'guard-1');
    });
  });

  describe('getGateEntryEvents', () => {
    it('should list paginated gate entry events with defaults', async () => {
      const mockResult = { items: [{ id: 'entry-1' }], total: 1, page: 1, limit: 20 };
      mockEntryEventsService.listGateEntryEvents.mockResolvedValueOnce(mockResult);

      const result = await controller.getGateEntryEvents('gate-1', undefined, undefined, undefined);
      expect(result).toEqual(mockResult);
      expect(mockEntryEventsService.listGateEntryEvents).toHaveBeenCalledWith('gate-1', 1, 20, false);
    });

    it('should parse page/limit and forward open=true', async () => {
      const mockResult = { items: [], total: 0, page: 2, limit: 10 };
      mockEntryEventsService.listGateEntryEvents.mockResolvedValueOnce(mockResult);

      const result = await controller.getGateEntryEvents('gate-1', '2', '10', 'true');
      expect(result).toEqual(mockResult);
      expect(mockEntryEventsService.listGateEntryEvents).toHaveBeenCalledWith('gate-1', 2, 10, true);
    });
  });

  describe('pending approvals', () => {
    it('should list pending approvals for gate fallback polling', async () => {
      const mockPending = [{ id: 'app-1', unitNumber: 'A-402', hasPhoto: false }];
      mockApprovalsService.listPendingByGate.mockResolvedValueOnce(mockPending);

      const result = await controller.getPendingApprovals('gate-1');
      expect(result).toEqual(mockPending);
      expect(mockApprovalsService.listPendingByGate).toHaveBeenCalledWith('gate-1');
    });
  });
});

describe('MobileEntryEventsController (Photo Streaming)', () => {
  let photoController: MobileEntryEventsController;
  let mockEntryEventsService: any;

  beforeEach(async () => {
    mockEntryEventsService = {
      getVisitorPhotoForUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileEntryEventsController],
      providers: [
        {
          provide: EntryEventsService,
          useValue: mockEntryEventsService,
        },
      ],
    }).compile();

    photoController = module.get<MobileEntryEventsController>(
      MobileEntryEventsController,
    );
  });

  it('should stream image bytes with proper content type header, scoped to the requesting user', async () => {
    const imageBytes = Buffer.from('fake-image-bytes');
    mockEntryEventsService.getVisitorPhotoForUser.mockResolvedValueOnce({
      id: 'img-1',
      entryEventId: 'evt-1',
      imageBytes,
      mimeType: 'image/png',
      sizeBytes: imageBytes.length,
    });

    const mockRes = {
      setHeader: jest.fn(),
      end: jest.fn(),
    } as any;
    const requestingUser = { sub: 'user-1' };

    await photoController.streamVisitorPhoto('evt-1', requestingUser, mockRes);

    expect(mockEntryEventsService.getVisitorPhotoForUser).toHaveBeenCalledWith(
      'evt-1',
      requestingUser,
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', imageBytes.length.toString());
    expect(mockRes.end).toHaveBeenCalledWith(imageBytes);
  });
});
