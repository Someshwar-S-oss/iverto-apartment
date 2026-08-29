import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { visitorImages } from '../../database/schema';

@Injectable()
export class VisitorImagesService {
  constructor(private readonly drizzle: DrizzleService) {}

  async saveImage(entryEventId: string, buffer: Buffer, mimeType = 'image/jpeg') {
    const [saved] = await this.drizzle.db
      .insert(visitorImages)
      .values({
        entryEventId,
        imageBytes: buffer,
        mimeType,
        sizeBytes: buffer.length,
      })
      .onConflictDoUpdate({
        target: visitorImages.entryEventId,
        set: {
          imageBytes: buffer,
          mimeType,
          sizeBytes: buffer.length,
        },
      })
      .returning();

    return saved;
  }

  async getImage(entryEventId: string) {
    const [image] = await this.drizzle.db
      .select()
      .from(visitorImages)
      .where(eq(visitorImages.entryEventId, entryEventId))
      .limit(1);

    if (!image) {
      throw new NotFoundException(`Visitor image not found for entry event: ${entryEventId}`);
    }

    return image;
  }

  async deleteImage(entryEventId: string) {
    const [deleted] = await this.drizzle.db
      .delete(visitorImages)
      .where(eq(visitorImages.entryEventId, entryEventId))
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Visitor image not found for entry event: ${entryEventId}`);
    }

    return deleted;
  }
}
