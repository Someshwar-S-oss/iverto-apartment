import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { DrizzleService } from '../../database/drizzle.service';

describe('StaffService', () => {
  let service: StaffService;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
  });

  describe('createStaff', () => {
    it('should insert and return a new staff member', async () => {
      const societyId = 'soc-123';
      const inputData = {
        name: ' Ramesh Kumar ',
        phone: ' +919876543210 ',
        staffType: 'DRIVER' as const,
        facePersonRef: ' face-ref-999 ',
        photoData: 'data:image/jpeg;base64,samplephoto',
      };

      const createdStaff = {
        id: 'staff-uuid-1',
        societyId,
        name: 'Ramesh Kumar',
        phone: '+919876543210',
        staffType: 'DRIVER',
        facePersonRef: 'face-ref-999',
        photoData: 'data:image/jpeg;base64,samplephoto',
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([createdStaff]),
        }),
      });

      const result = await service.createStaff(societyId, inputData);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(createdStaff);
    });
  });

  describe('assignStaffToUnit', () => {
    it('should create a new assignment if none exists', async () => {
      const staffId = 'staff-1';
      const unitId = 'unit-101';

      // Check existing -> returns empty
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const newAssignment = {
        id: 'assign-1',
        staffId,
        unitId,
        notify: true,
        activeFrom: new Date(),
        activeTo: null,
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([newAssignment]),
        }),
      });

      const result = await service.assignStaffToUnit(staffId, unitId, true);
      expect(result).toEqual(newAssignment);
    });

    it('should update notify if active assignment exists with different notify value', async () => {
      const staffId = 'staff-1';
      const unitId = 'unit-101';

      const existingAssignment = {
        id: 'assign-1',
        staffId,
        unitId,
        notify: false,
        activeFrom: new Date(),
        activeTo: null,
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([existingAssignment]),
          }),
        }),
      });

      const updatedAssignment = {
        ...existingAssignment,
        notify: true,
      };

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedAssignment]),
          }),
        }),
      });

      const result = await service.assignStaffToUnit(staffId, unitId, true);
      expect(result).toEqual(updatedAssignment);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should return existing assignment if active assignment already has identical notify value', async () => {
      const staffId = 'staff-1';
      const unitId = 'unit-101';

      const existingAssignment = {
        id: 'assign-1',
        staffId,
        unitId,
        notify: true,
        activeFrom: new Date(),
        activeTo: null,
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([existingAssignment]),
          }),
        }),
      });

      const result = await service.assignStaffToUnit(staffId, unitId, true);
      expect(result).toEqual(existingAssignment);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('unassignStaffFromUnit', () => {
    it('should set activeTo to current timestamp for active assignments', async () => {
      const staffId = 'staff-1';
      const unitId = 'unit-101';
      const unassignedRecord = {
        id: 'assign-1',
        staffId,
        unitId,
        notify: true,
        activeTo: new Date(),
      };

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([unassignedRecord]),
          }),
        }),
      });

      const result = await service.unassignStaffFromUnit(staffId, unitId);
      expect(result).toEqual([unassignedRecord]);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('updateUnitAssignment', () => {
    it('should update notify settings for active unit assignment', async () => {
      const staffId = 'staff-1';
      const unitId = 'unit-101';
      const updatedRecord = {
        id: 'assign-1',
        staffId,
        unitId,
        notify: false,
        activeTo: null,
      };

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedRecord]),
          }),
        }),
      });

      const result = await service.updateUnitAssignment(staffId, unitId, false);
      expect(result).toEqual(updatedRecord);
    });

    it('should return null if no active assignment matched', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.updateUnitAssignment('staff-99', 'unit-99', true);
      expect(result).toBeNull();
    });
  });

  describe('listStaffBySociety', () => {
    it('should return list of staff for a society', async () => {
      const societyId = 'soc-1';
      const mockStaffList = [
        { id: 'staff-1', name: 'Maid 1', status: 'ACTIVE', societyId },
        { id: 'staff-2', name: 'Cook 1', status: 'ACTIVE', societyId },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockStaffList),
        }),
      });

      const result = await service.listStaffBySociety(societyId);
      expect(result).toEqual(mockStaffList);
    });

    it('should filter by status if provided', async () => {
      const societyId = 'soc-1';
      const mockInactiveList = [
        { id: 'staff-3', name: 'Driver 1', status: 'INACTIVE', societyId },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockInactiveList),
        }),
      });

      const result = await service.listStaffBySociety(societyId, 'INACTIVE');
      expect(result).toEqual(mockInactiveList);
    });
  });

  describe('listStaffByUnit', () => {
    it('should return active staff assigned to a unit', async () => {
      const unitId = 'unit-101';
      const mockJoinedRows = [
        {
          assignmentId: 'assign-1',
          staffId: 'staff-1',
          name: 'Sunita Devi',
          phone: '9876543210',
          staffType: 'MAID',
          photoData: null,
          facePersonRef: 'ref-1',
          status: 'ACTIVE',
          notify: true,
          activeFrom: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(mockJoinedRows),
          }),
        }),
      });

      const result = await service.listStaffByUnit(unitId);
      expect(result).toEqual(mockJoinedRows);
    });
  });

  describe('getStaffByFaceRef', () => {
    it('should return staff member by face reference in society', async () => {
      const societyId = 'soc-1';
      const facePersonRef = 'face-123';
      const mockStaffMember = {
        id: 'staff-1',
        societyId,
        facePersonRef,
        name: 'Driver Joe',
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockStaffMember]),
          }),
        }),
      });

      const result = await service.getStaffByFaceRef(societyId, facePersonRef);
      expect(result).toEqual(mockStaffMember);
    });

    it('should return null if no staff matches facePersonRef', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.getStaffByFaceRef('soc-1', 'unknown-face');
      expect(result).toBeNull();
    });
  });
});
