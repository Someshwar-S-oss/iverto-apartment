import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { notices } from '../../database/schema';

export type NoticeCategory = 'GENERAL' | 'MAINTENANCE' | 'SECURITY' | 'EVENT' | 'EMERGENCY' | 'BILLING';

export interface CreateNoticeDto {
  title: string;
  body: string;
  category?: NoticeCategory;
  isPinned?: boolean;
}

@Injectable()
export class NoticesService {
  private readonly logger = new Logger(NoticesService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * List a society's notices, pinned first then newest.
   */
  async listBySociety(societyId: string) {
    const rows = await this.drizzle.db
      .select()
      .from(notices)
      .where(eq(notices.societyId, societyId))
      .orderBy(desc(notices.isPinned), desc(notices.createdAt));

    return rows;
  }

  /**
   * Publish a notice. authorUserId/authorName/authorRole are derived server-side from
   * the authenticated caller — never trust client-supplied author identity.
   */
  async create(
    societyId: string,
    data: CreateNoticeDto,
    author: { userId: string; name: string; role: string },
  ) {
    const [created] = await this.drizzle.db
      .insert(notices)
      .values({
        societyId,
        title: data.title.trim(),
        body: data.body.trim(),
        category: data.category || 'GENERAL',
        isPinned: data.isPinned ?? false,
        authorUserId: author.userId,
        authorName: author.name,
        authorRole: author.role,
      })
      .returning();

    this.logger.log(`Notice ${created.id} published for society ${societyId}`);
    return created;
  }

  async togglePin(societyId: string, noticeId: string) {
    const [existing] = await this.drizzle.db
      .select({ isPinned: notices.isPinned })
      .from(notices)
      .where(and(eq(notices.id, noticeId), eq(notices.societyId, societyId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Notice ${noticeId} not found in society ${societyId}`);
    }

    const [updated] = await this.drizzle.db
      .update(notices)
      .set({ isPinned: !existing.isPinned, updatedAt: new Date() })
      .where(and(eq(notices.id, noticeId), eq(notices.societyId, societyId)))
      .returning();

    return updated;
  }

  async delete(societyId: string, noticeId: string) {
    const [deleted] = await this.drizzle.db
      .delete(notices)
      .where(and(eq(notices.id, noticeId), eq(notices.societyId, societyId)))
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Notice ${noticeId} not found in society ${societyId}`);
    }

    return deleted;
  }
}
