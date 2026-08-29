import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VisitorImagesService } from './visitor-images.service';
import { DrizzleService } from '../../database/drizzle.service';

describe('VisitorImagesService', () => {
  let service: VisitorImagesService;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorImagesService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<VisitorImagesService>(VisitorImagesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveImage', () => {
    it('should insert or upsert image binary buffer and return saved record', async () => {
      const entryEventId = 'entry-123';
      const buffer = Buffer.from('fake-image-bytes');
      const savedRecord = {
        id: 'img-1',
        entryEventId,
        imageBytes: buffer,
        mimeType: 'image/jpeg',
        sizeBytes: buffer.length,
        createdAt: new Date(),
      };

      const returningMock = jest.fn().mockResolvedValue([savedRecord]);
      const onConflictMock = jest.fn().mockReturnValue({ returning: returningMock });
      const valuesMock = jest.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
      mockDb.insert.mockReturnValue({ values: valuesMock });

      const result = await service.saveImage(entryEventId, buffer, 'image/jpeg');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith({
        entryEventId,
        imageBytes: buffer,
        mimeType: 'image/jpeg',
        sizeBytes: buffer.length,
      });
      expect(result).toEqual(savedRecord);
    });
  });

  describe('getImage', () => {
    it('should return image when found', async () => {
      const entryEventId = 'entry-123';
      const mockRecord = {
        id: 'img-1',
        entryEventId,
        imageBytes: Buffer.from('fake-image'),
        mimeType: 'image/png',
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockRecord]),
          }),
        }),
      });

      const result = await service.getImage(entryEventId);
      expect(result).toEqual(mockRecord);
    });

    it('should throw NotFoundException when image does not exist', async () => {
      const entryEventId = 'entry-none';

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.getImage(entryEventId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteImage', () => {
    it('should delete and return record when found', async () => {
      const entryEventId = 'entry-123';
      const deletedRecord = { id: 'img-1', entryEventId };

      mockDb.delete.mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([deletedRecord]),
        }),
      });

      const result = await service.deleteImage(entryEventId);
      expect(result).toEqual(deletedRecord);
    });

    it('should throw NotFoundException when no record was deleted', async () => {
      const entryEventId = 'entry-none';

      mockDb.delete.mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.deleteImage(entryEventId)).rejects.toThrow(NotFoundException);
    });
  });
});
