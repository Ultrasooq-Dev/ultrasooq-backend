import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class SelfLearningService {
  private readonly logger = new Logger(SelfLearningService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Find the best matching learned answer using PostgreSQL trigram similarity.
   */
  async findAnswer(question: string, locale = 'en') {
    const normalized = question.toLowerCase().trim();
    if (normalized.length < 3) return null;

    // First try exact hash match
    const hash = this.hashQuestion(normalized);
    const exact = await this.prisma.botLearning.findUnique({
      where: { questionHash: hash },
    });
    if (exact && exact.status === 'active') return exact;

    // Then try fuzzy match using pg_trgm similarity
    const fuzzy = await this.prisma.$queryRaw<
      Array<{ id: number; question: string; answer: string; confidence: number; similarity: number }>
    >`
      SELECT id, question, answer, confidence,
        similarity(question, ${normalized}) AS similarity
      FROM bot_learning
      WHERE status = 'active'
        AND locale = ${locale}
        AND similarity(question, ${normalized}) > 0.3
      ORDER BY similarity DESC
      LIMIT 1
    `;

    if (fuzzy.length > 0) {
      // Combine stored confidence with similarity score
      const combined = (fuzzy[0].confidence + fuzzy[0].similarity) / 2;
      return { ...fuzzy[0], confidence: combined };
    }

    return null;
  }

  /**
   * Learn from an admin's answer to a customer question.
   * Called when admin responds to a conversation that was escalated.
   */
  async learnFromAdmin(question: string, answer: string, topic?: string, locale = 'en', adminId?: number) {
    const normalized = question.toLowerCase().trim();
    const hash = this.hashQuestion(normalized);

    await this.prisma.botLearning.upsert({
      where: { questionHash: hash },
      update: {
        answer,
        topic,
        confidence: 0.6, // Start with moderate confidence
        status: 'active',
        updatedAt: new Date(),
      },
      create: {
        question: normalized,
        questionHash: hash,
        answer,
        topic,
        locale,
        confidence: 0.6,
        source: 'admin_escalation',
        createdBy: adminId,
      },
    });

    this.logger.log(`Learned: "${normalized.slice(0, 50)}" → "${answer.slice(0, 50)}"`);
  }

  /**
   * Update confidence based on user feedback.
   */
  async updateFeedback(learningId: number, positive: boolean) {
    const field = positive ? 'thumbsUp' : 'thumbsDown';
    const learning = await this.prisma.botLearning.update({
      where: { id: learningId },
      data: {
        [field]: { increment: 1 },
        useCount: { increment: 1 },
      },
    });

    // Recalculate confidence: (thumbsUp / (thumbsUp + thumbsDown))
    const total = learning.thumbsUp + learning.thumbsDown;
    if (total >= 3) {
      const newConfidence = Math.round((learning.thumbsUp / total) * 100) / 100;
      await this.prisma.botLearning.update({
        where: { id: learningId },
        data: {
          confidence: newConfidence,
          // Auto-disable if confidence drops below 0.2
          status: newConfidence < 0.2 ? 'review' : 'active',
        },
      });
    }
  }

  /**
   * Increment use count (called when a learned answer is used).
   */
  async incrementUseCount(learningId: number) {
    await this.prisma.botLearning.update({
      where: { id: learningId },
      data: { useCount: { increment: 1 } },
    }).catch(() => {});
  }

  /**
   * List learned answers for admin review.
   */
  async listLearnings(filters: { status?: string; page?: number; limit?: number }) {
    const { status = 'all', page = 1, limit = 20 } = filters;
    const where: any = {};
    if (status !== 'all') where.status = status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.botLearning.findMany({
        where,
        orderBy: { useCount: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.botLearning.count({ where }),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Admin approves/edits a learned answer.
   */
  async updateLearning(id: number, data: { answer?: string; topic?: string; status?: string; confidence?: number }) {
    return this.prisma.botLearning.update({ where: { id }, data });
  }

  private hashQuestion(q: string): string {
    return crypto.createHash('sha256').update(q).digest('hex');
  }
}
