import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------
export const SCRAPE_QUEUES = {
  AMAZON: 'scrape-amazon',
  TAOBAO: 'scrape-taobao',
  ALIBABA: 'scrape-alibaba',
  ALIEXPRESS: 'scrape-aliexpress',
  TRANSLATE_TEXT: 'translate-text',
  TRANSLATE_IMAGE: 'translate-image',
  IMPORT_PRODUCTS: 'import-products',
  EXPORT_FILES: 'export-files',
} as const;

// ---------------------------------------------------------------------------
// Platform-level rate-limiting & concurrency config
// ---------------------------------------------------------------------------
export const PLATFORM_CONFIG = {
  amazon: {
    queue: SCRAPE_QUEUES.AMAZON,
    maxPerSession: 200,
    cooldownMs: 30_000,
    requestJitterMs: [1_000, 4_000] as [number, number],
    concurrency: 5,
    rateLimit: { max: 300, duration: 3_600_000 }, // 300 / hour
  },
  taobao: {
    queue: SCRAPE_QUEUES.TAOBAO,
    maxPerSession: 100,
    cooldownMs: 45_000,
    requestJitterMs: [2_000, 5_000] as [number, number],
    concurrency: 3,
    rateLimit: { max: 200, duration: 3_600_000 },
  },
  alibaba: {
    queue: SCRAPE_QUEUES.ALIBABA,
    maxPerSession: 300,
    cooldownMs: 20_000,
    requestJitterMs: [1_000, 3_000] as [number, number],
    concurrency: 5,
    rateLimit: { max: 400, duration: 3_600_000 },
  },
  aliexpress: {
    queue: SCRAPE_QUEUES.ALIEXPRESS,
    maxPerSession: 200,
    cooldownMs: 30_000,
    requestJitterMs: [1_000, 4_000] as [number, number],
    concurrency: 5,
    rateLimit: { max: 350, duration: 3_600_000 },
  },
} as const;

export type PlatformName = keyof typeof PLATFORM_CONFIG;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Manages BullMQ job queues for the scraping pipeline.
 *
 * Responsibilities:
 *  - Enqueue scrape / translate / import / export jobs
 *  - Pause / resume / drain individual platform queues
 *  - Expose aggregate queue statistics for the admin dashboard
 */
@Injectable()
export class ScraperQueueService {
  private readonly logger = new Logger(ScraperQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SCRAPE_QUEUES.AMAZON) private readonly amazonQueue: Queue,
    @InjectQueue(SCRAPE_QUEUES.TAOBAO) private readonly taobaoQueue: Queue,
    @InjectQueue(SCRAPE_QUEUES.ALIBABA) private readonly alibabaQueue: Queue,
    @InjectQueue(SCRAPE_QUEUES.ALIEXPRESS) private readonly aliexpressQueue: Queue,
    @InjectQueue(SCRAPE_QUEUES.TRANSLATE_TEXT) private readonly translateTextQueue: Queue,
    @InjectQueue(SCRAPE_QUEUES.TRANSLATE_IMAGE) private readonly translateImageQueue: Queue,
    @InjectQueue(SCRAPE_QUEUES.IMPORT_PRODUCTS) private readonly importQueue: Queue,
    @InjectQueue(SCRAPE_QUEUES.EXPORT_FILES) private readonly exportQueue: Queue,
  ) {}

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Resolve the correct queue instance for a platform key. */
  private getQueue(platform: string): Queue {
    const map: Record<string, Queue> = {
      amazon: this.amazonQueue,
      taobao: this.taobaoQueue,
      alibaba: this.alibabaQueue,
      aliexpress: this.aliexpressQueue,
    };
    const queue = map[platform];
    if (!queue) {
      throw new Error(`Unknown platform: ${platform}`);
    }
    return queue;
  }

  // -----------------------------------------------------------------------
  // Scrape jobs
  // -----------------------------------------------------------------------

  /** Add a scraping job to the appropriate platform queue. */
  async addScrapeJob(
    data: {
      jobId: number;
      platform: string;
      region?: string;
      categoryUrl: string;
      categoryPath: string;
      pageStart: number;
      pageEnd?: number;
      maxProducts?: number;
    },
    priority: number = 5,
  ): Promise<Job> {
    const queue = this.getQueue(data.platform);

    const job = await queue.add(
      `scrape-${data.platform}-${data.jobId}`,
      data,
      {
        priority,
        attempts: 4,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800 },
      },
    );

    this.logger.log(
      `Added scrape job ${data.jobId} to ${data.platform} queue (priority: ${priority})`,
    );
    return job;
  }

  // -----------------------------------------------------------------------
  // Translation jobs
  // -----------------------------------------------------------------------

  /** Add a batch text-translation job. */
  async addTranslateJob(data: {
    productIds: string[];
    batchIndex: number;
  }): Promise<Job> {
    return this.translateTextQueue.add(
      `translate-batch-${data.batchIndex}`,
      data,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 86_400 },
      },
    );
  }

  /** Add an image-translation job for a single product. */
  async addImageTranslateJob(data: {
    productId: string;
    imageUrls: string[];
  }): Promise<Job> {
    return this.translateImageQueue.add(
      `translate-image-${data.productId}`,
      data,
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { age: 86_400 },
      },
    );
  }

  // -----------------------------------------------------------------------
  // Export / Import jobs
  // -----------------------------------------------------------------------

  /** Add an export job (JSON or CSV). */
  async addExportJob(data: {
    platform: string;
    region?: string;
    format: 'json' | 'csv';
    batchId: string;
    productIds: string[];
  }): Promise<Job> {
    return this.exportQueue.add(`export-${data.batchId}`, data, {
      attempts: 1,
      removeOnComplete: { age: 604_800 },
    });
  }

  /** Add a DB-import job from a file path. */
  async addImportJob(data: {
    batchId: string;
    filePath: string;
  }): Promise<Job> {
    return this.importQueue.add(`import-${data.batchId}`, data, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 30_000 },
      removeOnComplete: { age: 604_800 },
    });
  }

  // -----------------------------------------------------------------------
  // Queue lifecycle
  // -----------------------------------------------------------------------

  /** Pause all pending jobs for a platform. */
  async pausePlatform(platform: string): Promise<void> {
    const queue = this.getQueue(platform);
    await queue.pause();
    this.logger.log(`Paused ${platform} queue`);
  }

  /** Resume a previously-paused platform queue. */
  async resumePlatform(platform: string): Promise<void> {
    const queue = this.getQueue(platform);
    await queue.resume();
    this.logger.log(`Resumed ${platform} queue`);
  }

  /** Remove all waiting jobs from a platform queue. */
  async drainQueue(platform: string): Promise<void> {
    const queue = this.getQueue(platform);
    await queue.drain();
    this.logger.log(`Drained ${platform} queue`);
  }

  // -----------------------------------------------------------------------
  // Observability
  // -----------------------------------------------------------------------

  /** Return job-count stats for every queue in the pipeline. */
  async getQueueStats(): Promise<
    Record<
      string,
      {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
      }
    >
  > {
    const allQueues: Record<string, Queue> = {
      [SCRAPE_QUEUES.AMAZON]: this.amazonQueue,
      [SCRAPE_QUEUES.TAOBAO]: this.taobaoQueue,
      [SCRAPE_QUEUES.ALIBABA]: this.alibabaQueue,
      [SCRAPE_QUEUES.ALIEXPRESS]: this.aliexpressQueue,
      [SCRAPE_QUEUES.TRANSLATE_TEXT]: this.translateTextQueue,
      [SCRAPE_QUEUES.TRANSLATE_IMAGE]: this.translateImageQueue,
      [SCRAPE_QUEUES.IMPORT_PRODUCTS]: this.importQueue,
      [SCRAPE_QUEUES.EXPORT_FILES]: this.exportQueue,
    };

    const stats: Record<string, any> = {};
    for (const [name, queue] of Object.entries(allQueues)) {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      stats[name] = counts;
    }
    return stats;
  }
}
