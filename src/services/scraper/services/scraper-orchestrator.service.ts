import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScraperQueueService, PLATFORM_CONFIG } from './scraper-queue.service';
import { ScraperRotationService } from './scraper-rotation.service';
import { ScraperMonitorService } from './scraper-monitor.service';
import { TranslationService } from './translation.service';
import { CategoryMappingService } from './category-mapping.service';
import { ScraperExportService } from './scraper-export.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Platform targets
const TARGETS = {
  amazon: 2_000_000,
  taobao: 3_000_000,
  alibaba: 2_500_000,
  aliexpress: 2_500_000,
};

const AUTO_PARTS_TARGETS: Record<string, number> = {
  hondaparts: 500_000,
  rockauto: 1_000_000,
  megazip: 500_000,
  partsouq: 300_000,
  realoem: 200_000,
  catcar: 200_000,
  yoshiparts: 150_000,
  partsnext: 100_000,
  toyotaparts: 200_000,
};

// Amazon regions to scrape (high-tech focus)
const AMAZON_REGIONS = ['us', 'ae', 'uk', 'de', 'fr', 'jp', 'ca', 'au'];

// Tech categories per platform (starting set)
const PLATFORM_CATEGORIES = {
  amazon: [
    { path: 'Electronics', url: 'https://www.amazon.com/s?i=electronics&rh=n%3A172282' },
    { path: 'Computers & Accessories', url: 'https://www.amazon.com/s?i=computers&rh=n%3A541966' },
    { path: 'Industrial & Scientific', url: 'https://www.amazon.com/s?i=industrial&rh=n%3A16310091' },
    { path: 'Automotive', url: 'https://www.amazon.com/s?i=automotive&rh=n%3A15684181' },
    { path: 'Office Products', url: 'https://www.amazon.com/s?i=office-products&rh=n%3A1064954' },
  ],
  taobao: [
    // 1688.com = Alibaba domestic China (real China factory prices in CNY, no login required)
    // This is the PRIMARY source for China prices — NOT world.taobao.com (inflated international prices)
    { path: '数码电子', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%95%B0%E7%A0%81%E7%94%B5%E5%AD%90' },
    { path: '电脑整机', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E7%94%B5%E8%84%91%E6%95%B4%E6%9C%BA' },
    { path: '手机通讯', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%89%8B%E6%9C%BA%E9%80%9A%E8%AE%AF' },
    { path: '家用电器', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%AE%B6%E7%94%A8%E7%94%B5%E5%99%A8' },
    { path: '汽车配件', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%B1%BD%E8%BD%A6%E9%85%8D%E4%BB%B6' },
    { path: '安防监控', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%AE%89%E9%98%B2%E7%9B%91%E6%8E%A7' },
    { path: '电子元件', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E7%94%B5%E5%AD%90%E5%85%83%E4%BB%B6' },
    { path: '智能设备', url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%99%BA%E8%83%BD%E8%AE%BE%E5%A4%87' },
    // Taobao search as secondary (needs login, may redirect)
    { path: '数码产品', url: 'https://s.taobao.com/search?q=%E6%95%B0%E7%A0%81%E4%BA%A7%E5%93%81' },
    { path: '电脑办公', url: 'https://s.taobao.com/search?q=%E7%94%B5%E8%84%91%E5%8A%9E%E5%85%AC' },
  ],
  alibaba: [
    { path: 'Consumer Electronics', url: 'https://www.alibaba.com/Consumer-Electronics_cid3.html' },
    { path: 'Computer Hardware & Software', url: 'https://www.alibaba.com/Computer-Hardware-Software_cid100003961.html' },
    { path: 'Electronic Components & Supplies', url: 'https://www.alibaba.com/Electronic-Components-Supplies_cid100000001.html' },
    { path: 'Machinery', url: 'https://www.alibaba.com/Machinery_cid51.html' },
    { path: 'Auto Parts & Accessories', url: 'https://www.alibaba.com/Auto-Parts-Accessories_cid100000037.html' },
  ],
  aliexpress: [
    { path: 'Consumer Electronics', url: 'https://www.aliexpress.com/category/44/consumer-electronics.html' },
    { path: 'Computer & Office', url: 'https://www.aliexpress.com/category/7/computer-office.html' },
    { path: 'Phones & Telecommunications', url: 'https://www.aliexpress.com/category/509/phones-telecommunications.html' },
    { path: 'Electronic Components', url: 'https://www.aliexpress.com/category/502/electronic-components-supplies.html' },
    { path: 'Automobiles & Motorcycles', url: 'https://www.aliexpress.com/category/34/automobiles-motorcycles.html' },
  ],
};

const AUTO_PARTS_CATEGORIES = {
  hondaparts: [
    { path: 'Engine', url: '/parts/engine' },
    { path: 'Brakes', url: '/parts/brakes' },
    { path: 'Suspension', url: '/parts/suspension' },
    { path: 'Electrical', url: '/parts/electrical' },
    { path: 'Body', url: '/parts/body' },
    { path: 'Transmission', url: '/parts/transmission' },
  ],
  rockauto: [
    { path: 'Engine', url: '/en/catalog/?type=engine' },
    { path: 'Brake & Wheel Hub', url: '/en/catalog/?type=brake' },
    { path: 'Suspension', url: '/en/catalog/?type=suspension' },
    { path: 'Electrical', url: '/en/catalog/?type=electrical' },
    { path: 'Body & Lamp Assembly', url: '/en/catalog/?type=body' },
    { path: 'Transmission', url: '/en/catalog/?type=transmission' },
  ],
  megazip: [
    { path: 'Engine', url: '/catalog/engine' },
    { path: 'Brakes', url: '/catalog/brakes' },
    { path: 'Suspension', url: '/catalog/suspension' },
    { path: 'Body Parts', url: '/catalog/body' },
    { path: 'Electrical', url: '/catalog/electrical' },
  ],
  partsouq: [
    { path: 'Engine', url: '/en/catalog/engine' },
    { path: 'Brakes', url: '/en/catalog/brakes' },
    { path: 'Suspension', url: '/en/catalog/suspension' },
    { path: 'Body', url: '/en/catalog/body' },
    { path: 'Electrical', url: '/en/catalog/electrical' },
  ],
  realoem: [
    { path: 'Engine', url: '/bmw/enUS/select?catalog=engine' },
    { path: 'Brakes', url: '/bmw/enUS/select?catalog=brakes' },
    { path: 'Suspension', url: '/bmw/enUS/select?catalog=suspension' },
    { path: 'Body', url: '/bmw/enUS/select?catalog=body' },
    { path: 'Electrical', url: '/bmw/enUS/select?catalog=electrical' },
  ],
  catcar: [
    { path: 'Engine', url: '/en/catalog/engine' },
    { path: 'Chassis', url: '/en/catalog/chassis' },
    { path: 'Body', url: '/en/catalog/body' },
    { path: 'Electrical', url: '/en/catalog/electrical' },
  ],
  yoshiparts: [
    { path: 'Engine', url: '/catalog/engine' },
    { path: 'Brakes', url: '/catalog/brakes' },
    { path: 'Body', url: '/catalog/body' },
    { path: 'Suspension', url: '/catalog/suspension' },
  ],
  partsnext: [
    { path: 'Engine', url: '/catalog/engine' },
    { path: 'Brakes', url: '/catalog/brakes' },
    { path: 'Body', url: '/catalog/body' },
  ],
  toyotaparts: [
    { path: 'Engine', url: '/v/engine' },
    { path: 'Brakes', url: '/v/brakes' },
    { path: 'Suspension', url: '/v/suspension' },
    { path: 'Body', url: '/v/body' },
    { path: 'Electrical', url: '/v/electrical' },
  ],
};

export type WorkflowState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'CATEGORY_IMPORT'
  | 'CATEGORY_MAPPING'
  | 'SCRAPING'
  | 'TRANSLATING'
  | 'EXPORTING'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'ERROR';

export interface WorkflowCheckpoint {
  state: WorkflowState;
  startedAt: string;
  lastCheckpoint: string;
  progress: {
    categoriesImported: number;
    categoriesMapped: number;
    jobsDispatched: number;
    productsScraped: number;
    productsTranslated: number;
    productsExported: number;
    productsImported: number;
  };
  currentPlatform?: string;
  currentRegion?: string;
  errors: string[];
}

@Injectable()
export class ScraperOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(ScraperOrchestratorService.name);
  private readonly redis: Redis;
  private readonly WORKFLOW_KEY = 'mega-scrape:workflow';

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: ScraperQueueService,
    private readonly rotationService: ScraperRotationService,
    private readonly monitorService: ScraperMonitorService,
    private readonly translationService: TranslationService,
    private readonly categoryMappingService: CategoryMappingService,
    private readonly exportService: ScraperExportService,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    this.redis = new Redis({ host, port, lazyConnect: true });
  }

  async onModuleInit() {
    // Check for existing workflow state on startup (crash recovery)
    const existing = await this.getCheckpoint();
    if (existing && existing.state !== 'IDLE' && existing.state !== 'COMPLETED' && existing.state !== 'PAUSED') {
      this.logger.warn(`Found interrupted workflow in state: ${existing.state}. Will resume on next cron tick.`);
    }
  }

  // ═══════════════════════════════════════════
  // CHECKPOINT MANAGEMENT (crash-proof state)
  // ═══════════════════════════════════════════

  private async getCheckpoint(): Promise<WorkflowCheckpoint | null> {
    const data = await this.redis.get(this.WORKFLOW_KEY);
    return data ? JSON.parse(data) : null;
  }

  private async saveCheckpoint(checkpoint: WorkflowCheckpoint): Promise<void> {
    checkpoint.lastCheckpoint = new Date().toISOString();
    await this.redis.set(this.WORKFLOW_KEY, JSON.stringify(checkpoint));
  }

  private async initCheckpoint(): Promise<WorkflowCheckpoint> {
    const checkpoint: WorkflowCheckpoint = {
      state: 'INITIALIZING',
      startedAt: new Date().toISOString(),
      lastCheckpoint: new Date().toISOString(),
      progress: {
        categoriesImported: 0,
        categoriesMapped: 0,
        jobsDispatched: 0,
        productsScraped: 0,
        productsTranslated: 0,
        productsExported: 0,
        productsImported: 0,
      },
      errors: [],
    };
    await this.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  // ═══════════════════════════════════════════
  // PUBLIC API (called by controller / MCP)
  // ═══════════════════════════════════════════

  async startWorkflow(): Promise<{ status: string; checkpoint: WorkflowCheckpoint }> {
    const existing = await this.getCheckpoint();
    if (existing && !['IDLE', 'COMPLETED', 'ERROR'].includes(existing.state)) {
      return { status: `Workflow already running in state: ${existing.state}`, checkpoint: existing };
    }

    const checkpoint = await this.initCheckpoint();
    this.logger.log('Mega scrape workflow STARTED');

    // Run the first phase immediately
    await this.runNextPhase(checkpoint);

    return { status: 'started', checkpoint };
  }

  async pauseWorkflow(): Promise<{ status: string }> {
    const checkpoint = await this.getCheckpoint();
    if (!checkpoint) return { status: 'no workflow running' };

    checkpoint.state = 'PAUSED';
    await this.saveCheckpoint(checkpoint);

    // Pause all platform queues
    for (const platform of Object.keys(TARGETS)) {
      await this.queueService.pausePlatform(platform);
    }

    this.logger.log('Mega scrape workflow PAUSED');
    return { status: 'paused' };
  }

  async resumeWorkflow(): Promise<{ status: string; checkpoint: WorkflowCheckpoint | null }> {
    const checkpoint = await this.getCheckpoint();
    if (!checkpoint) return { status: 'no workflow to resume', checkpoint: null };

    if (checkpoint.state !== 'PAUSED') {
      return { status: `Cannot resume from state: ${checkpoint.state}`, checkpoint };
    }

    // Resume all platform queues
    for (const platform of Object.keys(TARGETS)) {
      await this.queueService.resumePlatform(platform);
    }

    checkpoint.state = 'SCRAPING'; // Resume to scraping phase
    await this.saveCheckpoint(checkpoint);

    this.logger.log('Mega scrape workflow RESUMED');
    return { status: 'resumed', checkpoint };
  }

  async getWorkflowStatus(): Promise<{ checkpoint: WorkflowCheckpoint | null; health: any }> {
    const checkpoint = await this.getCheckpoint();
    const health = await this.monitorService.getHealthReport();
    return { checkpoint, health };
  }

  async resetWorkflow(): Promise<{ status: string }> {
    await this.redis.del(this.WORKFLOW_KEY);
    this.logger.log('Mega scrape workflow RESET');
    return { status: 'reset' };
  }

  // ═══════════════════════════════════════════
  // STATE MACHINE (phase progression)
  // ═══════════════════════════════════════════

  private async runNextPhase(checkpoint: WorkflowCheckpoint): Promise<void> {
    try {
      switch (checkpoint.state) {
        case 'INITIALIZING':
          await this.phaseInitialize(checkpoint);
          break;
        case 'CATEGORY_IMPORT':
          await this.phaseCategoryImport(checkpoint);
          break;
        case 'CATEGORY_MAPPING':
          await this.phaseCategoryMapping(checkpoint);
          break;
        case 'SCRAPING':
          await this.phaseScraping(checkpoint);
          break;
        case 'TRANSLATING':
          await this.phaseTranslation(checkpoint);
          break;
        case 'EXPORTING':
          await this.phaseExport(checkpoint);
          break;
        case 'IMPORTING':
          await this.phaseImport(checkpoint);
          break;
        default:
          this.logger.log(`Workflow in terminal state: ${checkpoint.state}`);
      }
    } catch (error) {
      checkpoint.state = 'ERROR';
      checkpoint.errors.push(`Phase error: ${error.message}`);
      await this.saveCheckpoint(checkpoint);
      this.logger.error(`Workflow error in phase: ${error.message}`, error.stack);
    }
  }

  // ═══════════════════════════════════════════
  // PHASE IMPLEMENTATIONS
  // ═══════════════════════════════════════════

  private async phaseInitialize(cp: WorkflowCheckpoint): Promise<void> {
    this.logger.log('Phase: INITIALIZING — loading category mappings');
    await this.categoryMappingService.loadUltrasooqCategories();
    cp.state = 'CATEGORY_IMPORT';
    await this.saveCheckpoint(cp);
    await this.runNextPhase(cp);
  }

  private async phaseCategoryImport(cp: WorkflowCheckpoint): Promise<void> {
    this.logger.log('Phase: CATEGORY_IMPORT — storing source categories');

    for (const [platform, categories] of Object.entries(PLATFORM_CATEGORIES)) {
      for (const cat of categories) {
        await this.prisma.categoryMapping.upsert({
          where: { sourcePlatform_sourcePath: { sourcePlatform: platform, sourcePath: cat.path } },
          create: { sourcePlatform: platform, sourcePath: cat.path, sourceId: cat.url },
          update: { sourceId: cat.url },
        });
        cp.progress.categoriesImported++;
      }
    }

    await this.saveCheckpoint(cp);
    cp.state = 'CATEGORY_MAPPING';
    await this.saveCheckpoint(cp);
    await this.runNextPhase(cp);
  }

  private async phaseCategoryMapping(cp: WorkflowCheckpoint): Promise<void> {
    this.logger.log('Phase: CATEGORY_MAPPING — AI mapping source -> Ultrasooq');

    const unmapped = await this.prisma.categoryMapping.findMany({
      where: { ultrasooqCategoryId: null },
    });

    for (const mapping of unmapped) {
      await this.categoryMappingService.mapCategory(mapping.sourcePlatform, mapping.sourcePath);
      cp.progress.categoriesMapped++;
    }

    await this.saveCheckpoint(cp);
    cp.state = 'SCRAPING';
    await this.saveCheckpoint(cp);
    // Don't auto-advance — scraping runs via cron tick
  }

  private async phaseScraping(cp: WorkflowCheckpoint): Promise<void> {
    this.logger.log('Phase: SCRAPING — dispatching jobs to queues');

    // Calculate how many products per category to reach targets
    for (const [platform, target] of Object.entries(TARGETS)) {
      const currentCount = await this.prisma.scrapedProductRaw.count({
        where: { sourcePlatform: platform },
      });

      if (currentCount >= target) {
        this.logger.log(`${platform}: target reached (${currentCount}/${target})`);
        continue;
      }

      const remaining = target - currentCount;
      const categories = PLATFORM_CATEGORIES[platform] || [];
      const perCategory = Math.ceil(remaining / categories.length);

      // Check cooldown before dispatching
      const inCooldown = await this.rotationService.isInCooldown(platform);
      if (inCooldown) {
        this.logger.log(`${platform}: in cooldown, skipping dispatch`);
        continue;
      }

      // Check queue depth — don't over-queue
      const stats = await this.queueService.getQueueStats();
      const queueKey = `scrape-${platform}`;
      const queueDepth = (stats[queueKey]?.waiting || 0) + (stats[queueKey]?.active || 0);
      if (queueDepth > 50) {
        this.logger.log(`${platform}: queue deep enough (${queueDepth}), skipping dispatch`);
        continue;
      }

      for (const cat of categories) {
        const regions = platform === 'amazon' ? AMAZON_REGIONS : [undefined];
        for (const region of regions) {
          // Create scraping job in DB
          const job = await this.prisma.scrapingJob.create({
            data: {
              platform,
              region,
              categorySource: cat.path,
              sourceUrl: cat.url,
              totalProducts: Math.min(perCategory, 1000),
              status: 'QUEUED',
              priority: platform === 'amazon' ? 3 : platform === 'taobao' ? 2 : 4,
              nodeId: this.configService.get('SCRAPER_NODE_ID', 'primary'),
            },
          });

          // Enqueue to BullMQ
          await this.queueService.addScrapeJob({
            jobId: job.id,
            platform,
            region,
            categoryUrl: cat.url,
            categoryPath: cat.path,
            pageStart: 1,
            maxProducts: Math.min(perCategory, 1000),
          }, job.priority);

          cp.progress.jobsDispatched++;
        }
      }
    }

    // ── AUTO PARTS PLATFORMS ──
    for (const [platform, target] of Object.entries(AUTO_PARTS_TARGETS)) {
      const currentCount = await this.prisma.scrapedAutoPart.count({
        where: { sourcePlatform: platform },
      }).catch(() => 0);

      if (currentCount >= target) {
        this.logger.log(`[auto] ${platform}: target reached (${currentCount}/${target})`);
        continue;
      }

      const categories = AUTO_PARTS_CATEGORIES[platform] || [];
      if (categories.length === 0) continue;

      const remaining = target - currentCount;
      const perCategory = Math.ceil(remaining / categories.length);

      // Check cooldown
      const inCooldown = await this.rotationService.isInCooldown(platform);
      if (inCooldown) continue;

      // Check queue depth
      const stats = await this.queueService.getQueueStats();
      const queueKey = `scrape-${platform}`;
      const queueDepth = (stats[queueKey]?.waiting || 0) + (stats[queueKey]?.active || 0);
      if (queueDepth > 20) continue;

      for (const cat of categories) {
        const job = await this.prisma.scrapingJob.create({
          data: {
            platform,
            categorySource: cat.path,
            sourceUrl: cat.url,
            totalProducts: Math.min(perCategory, 500),
            status: 'QUEUED',
            priority: 6, // lower priority than main e-commerce
            nodeId: this.configService.get('SCRAPER_NODE_ID', 'primary'),
          },
        });

        await this.queueService.addScrapeJob({
          jobId: job.id,
          platform,
          categoryUrl: cat.url,
          categoryPath: cat.path,
          pageStart: 1,
          maxProducts: Math.min(perCategory, 500),
        }, 6);

        cp.progress.jobsDispatched++;
      }
    }

    await this.saveCheckpoint(cp);
  }

  private async phaseTranslation(cp: WorkflowCheckpoint): Promise<void> {
    this.logger.log('Phase: TRANSLATING — processing RAW products');

    // Get untranslated Chinese products in batches
    const rawProducts = await this.prisma.scrapedProductRaw.findMany({
      where: {
        status: 'RAW',
        sourcePlatform: { in: ['taobao', 'alibaba', 'aliexpress'] },
      },
      take: 50,
      select: { id: true },
    });

    if (rawProducts.length > 0) {
      const result = await this.translationService.translateBatch(rawProducts.map(p => p.id));
      cp.progress.productsTranslated += result.translated;
      this.logger.log(`Translated ${result.translated}, failed ${result.failed}`);
    }

    // Mark English products as TRANSLATED directly
    const englishRaw = await this.prisma.scrapedProductRaw.updateMany({
      where: {
        status: 'RAW',
        sourcePlatform: 'amazon',
      },
      data: { status: 'TRANSLATED', translatedAt: new Date() },
    });
    cp.progress.productsTranslated += englishRaw.count;

    await this.saveCheckpoint(cp);
  }

  private async phaseExport(cp: WorkflowCheckpoint): Promise<void> {
    this.logger.log('Phase: EXPORTING — writing JSON files');

    for (const platform of Object.keys(TARGETS)) {
      try {
        // Move TRANSLATED -> READY
        await this.prisma.scrapedProductRaw.updateMany({
          where: { sourcePlatform: platform, status: 'TRANSLATED' },
          data: { status: 'READY' },
        });

        const readyCount = await this.prisma.scrapedProductRaw.count({
          where: { sourcePlatform: platform, status: 'READY' },
        });

        if (readyCount >= 1000) {
          const result = await this.exportService.exportBatch(platform);
          cp.progress.productsExported += result.count;
          this.logger.log(`Exported ${result.count} ${platform} products to ${result.filePath}`);
        }
      } catch (err) {
        this.logger.warn(`Export failed for ${platform}: ${err.message}`);
      }
    }

    await this.saveCheckpoint(cp);
  }

  private async phaseImport(cp: WorkflowCheckpoint): Promise<void> {
    this.logger.log('Phase: IMPORTING — bulk DB import');

    // Find unimported batches
    const batches = await this.prisma.scrapingJob.findMany({
      where: {
        batchId: { not: null },
        importedCount: 0,
        exportFilePath: { not: null },
      },
      take: 5,
    });

    for (const batch of batches) {
      try {
        const result = await this.exportService.importBatchToDb(batch.batchId);
        cp.progress.productsImported += result.imported;
        this.logger.log(`Imported batch ${batch.batchId}: ${result.imported} products`);
      } catch (err) {
        this.logger.warn(`Import failed for ${batch.batchId}: ${err.message}`);
      }
    }

    await this.saveCheckpoint(cp);
  }

  // ═══════════════════════════════════════════
  // CRON: MAIN LOOP (runs every 5 minutes)
  // ═══════════════════════════════════════════

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cronTick(): Promise<void> {
    const cp = await this.getCheckpoint();
    if (!cp || cp.state === 'IDLE' || cp.state === 'COMPLETED' || cp.state === 'PAUSED') {
      return; // Nothing to do
    }

    this.logger.log(`Cron tick — workflow state: ${cp.state}`);

    // Update progress from actual DB counts
    const health = await this.monitorService.getHealthReport();
    cp.progress.productsScraped = health.overall.totalScraped;

    // Check if all targets are met
    const allDone = Object.entries(TARGETS).every(([platform, target]) => {
      const scraped = health.platforms[platform]?.scraped || 0;
      return scraped >= target;
    });

    if (allDone) {
      cp.state = 'COMPLETED';
      await this.saveCheckpoint(cp);
      this.logger.log('MEGA SCRAPE WORKFLOW COMPLETED — 10M products target reached!');
      return;
    }

    // Run all phases that have work to do (pipeline parallelism)
    // Scraping continues regardless
    if (cp.state === 'SCRAPING' || cp.state === 'TRANSLATING' || cp.state === 'EXPORTING' || cp.state === 'IMPORTING') {
      // Always try to dispatch more scraping jobs
      await this.phaseScraping(cp);

      // Always try to translate pending products
      await this.phaseTranslation(cp);

      // Always try to export ready products
      await this.phaseExport(cp);

      // Always try to import exported batches
      await this.phaseImport(cp);
    } else if (cp.state === 'ERROR') {
      // Auto-retry from last known good state
      cp.state = 'SCRAPING';
      cp.errors.push('Auto-recovered from ERROR state');
      await this.saveCheckpoint(cp);
    } else {
      await this.runNextPhase(cp);
    }
  }

  // ═══════════════════════════════════════════
  // CRON: ANTI-BLOCKING CHECK (every 2 minutes)
  // ═══════════════════════════════════════════

  @Cron('*/2 * * * *')
  async antiBlockingCheck(): Promise<void> {
    const cp = await this.getCheckpoint();
    if (!cp || cp.state !== 'SCRAPING') return;

    for (const platform of Object.keys(TARGETS)) {
      const inCooldown = await this.rotationService.isInCooldown(platform);
      if (inCooldown) {
        const remaining = await this.rotationService.getCooldownRemaining(platform);
        this.logger.warn(`${platform}: in cooldown (${Math.round(remaining / 60000)}min remaining)`);
      } else {
        // Successful scraping streak — adjust rate up
        await this.rotationService.adjustRate(platform, false);
      }
    }
  }

  // ═══════════════════════════════════════════
  // CRON: HOURLY SELF-HEALING TASK
  // Ensures scraping continues even if MCP disconnects.
  // Recovers stuck jobs, re-queues failed work, logs progress.
  // ═══════════════════════════════════════════

  @Cron(CronExpression.EVERY_HOUR)
  async hourlyHealthCheck(): Promise<void> {
    const cp = await this.getCheckpoint();
    if (!cp || cp.state === 'IDLE' || cp.state === 'COMPLETED') return;

    this.logger.log('═══ HOURLY HEALTH CHECK ═══');

    // 1. Record heartbeat (proves the system is alive)
    await this.redis.set('mega-scrape:heartbeat', new Date().toISOString(), 'EX', 7200);

    // 2. Auto-recover from PAUSED if paused for > 2 hours (MCP likely disconnected)
    if (cp.state === 'PAUSED') {
      const lastCheckpoint = new Date(cp.lastCheckpoint).getTime();
      const pausedFor = Date.now() - lastCheckpoint;
      if (pausedFor > 2 * 60 * 60 * 1000) {
        this.logger.warn(`Workflow paused for ${Math.round(pausedFor / 3600000)}h — auto-resuming (MCP may have disconnected)`);
        cp.state = 'SCRAPING';
        cp.errors.push(`Auto-resumed after ${Math.round(pausedFor / 3600000)}h pause (hourly check)`);
        await this.saveCheckpoint(cp);
        for (const platform of Object.keys(TARGETS)) {
          try { await this.queueService.resumePlatform(platform); } catch {}
        }
      }
      return;
    }

    // 3. Auto-recover from ERROR state
    if (cp.state === 'ERROR') {
      this.logger.warn('Workflow in ERROR state — auto-recovering to SCRAPING');
      cp.state = 'SCRAPING';
      cp.errors.push('Auto-recovered from ERROR (hourly check)');
      await this.saveCheckpoint(cp);
    }

    // 4. Recover stuck jobs (RUNNING for > 30 min = likely crashed)
    const stuckJobs = await this.prisma.scrapingJob.findMany({
      where: {
        status: 'RUNNING',
        startedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      },
    });

    for (const job of stuckJobs) {
      this.logger.warn(`Recovering stuck job ${job.id} (${job.platform}, running since ${job.startedAt})`);
      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          retryCount: { increment: 1 },
          lastError: 'Recovered by hourly health check (stuck > 30min)',
        },
      });

      // Re-queue if retry count < 4
      if ((job.retryCount || 0) < 4) {
        await this.queueService.addScrapeJob({
          jobId: job.id,
          platform: job.platform,
          region: job.region || undefined,
          categoryUrl: job.sourceUrl,
          categoryPath: job.categorySource,
          pageStart: job.sourcePageStart || 1,
        }, job.priority || 5);
      } else {
        await this.prisma.scrapingJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', lastError: 'Max retries exceeded (4)' },
        });
      }
    }

    // 5. Re-queue BLOCKED jobs whose cooldown has expired
    const blockedJobs = await this.prisma.scrapingJob.findMany({
      where: {
        status: 'BLOCKED',
        cooldownUntil: { lt: new Date() },
      },
    });

    for (const job of blockedJobs) {
      const inCooldown = await this.rotationService.isInCooldown(job.platform, job.region);
      if (!inCooldown) {
        this.logger.log(`Re-queuing unblocked job ${job.id} (${job.platform})`);
        await this.prisma.scrapingJob.update({
          where: { id: job.id },
          data: { status: 'QUEUED', retryCount: { increment: 1 } },
        });
        await this.queueService.addScrapeJob({
          jobId: job.id,
          platform: job.platform,
          region: job.region || undefined,
          categoryUrl: job.sourceUrl,
          categoryPath: job.categorySource,
          pageStart: job.sourcePageStart || 1,
        }, (job.priority || 5) + 1); // slightly lower priority on retry
      }
    }

    // 6. Ensure queues aren't empty — dispatch more if needed
    const stats = await this.queueService.getQueueStats();
    const totalWaiting = Object.values(stats).reduce((sum: number, q: any) => sum + (q.waiting || 0), 0);
    const totalActive = Object.values(stats).reduce((sum: number, q: any) => sum + (q.active || 0), 0);

    if (totalWaiting === 0 && totalActive === 0 && cp.state === 'SCRAPING') {
      this.logger.log('All queues empty — dispatching new batch of jobs');
      await this.phaseScraping(cp);
    }

    // 7. Run translation/export/import pipeline
    await this.phaseTranslation(cp);
    await this.phaseExport(cp);
    await this.phaseImport(cp);

    // 8. Log hourly progress summary
    const health = await this.monitorService.getHealthReport();
    cp.progress.productsScraped = health.overall.totalScraped;
    await this.saveCheckpoint(cp);

    const elapsed = (Date.now() - new Date(cp.startedAt).getTime()) / 3600000;
    this.logger.log(`═══ HOURLY REPORT ═══`);
    this.logger.log(`  Runtime: ${elapsed.toFixed(1)}h`);
    this.logger.log(`  Scraped: ${health.overall.totalScraped.toLocaleString()} / ${health.overall.totalTarget.toLocaleString()} (${health.overall.percentComplete}%)`);
    this.logger.log(`  Translated: ${health.overall.totalTranslated.toLocaleString()}`);
    this.logger.log(`  Imported: ${health.overall.totalImported.toLocaleString()}`);
    this.logger.log(`  Rate: ${health.overall.ratePerHour.toLocaleString()}/hr`);
    this.logger.log(`  Stuck jobs recovered: ${stuckJobs.length}`);
    this.logger.log(`  Blocked jobs re-queued: ${blockedJobs.length}`);
    this.logger.log(`  Errors (24h): ${health.errors.last24h.blocks} blocks, ${health.errors.last24h.failures} failures`);
    for (const [platform, pStats] of Object.entries(health.platforms) as any) {
      this.logger.log(`  ${platform}: ${pStats.scraped.toLocaleString()}/${pStats.target.toLocaleString()} (${pStats.percentComplete}%) rate=${pStats.currentRate}/hr ${pStats.blocked ? 'BLOCKED' : 'ok'}`);
    }
    this.logger.log(`═════════════════════`);
  }

  // ═══════════════════════════════════════════
  // CRON: EVERY 10 MINUTES — ensure pipeline stays fed
  // Lighter than hourly, just ensures jobs are dispatched
  // ═══════════════════════════════════════════

  @Cron('*/10 * * * *')
  async pipelineFeeder(): Promise<void> {
    const cp = await this.getCheckpoint();
    if (!cp || !['SCRAPING', 'TRANSLATING', 'EXPORTING', 'IMPORTING'].includes(cp.state)) return;

    // Check if queues are starving
    const stats = await this.queueService.getQueueStats();
    let anyStarving = false;

    for (const platform of Object.keys(TARGETS)) {
      const queueKey = `scrape-${platform}`;
      const depth = (stats[queueKey]?.waiting || 0) + (stats[queueKey]?.active || 0);
      if (depth === 0) {
        const currentCount = await this.prisma.scrapedProductRaw.count({
          where: { sourcePlatform: platform },
        });
        if (currentCount < TARGETS[platform]) {
          anyStarving = true;
          break;
        }
      }
    }

    if (anyStarving) {
      this.logger.log('Pipeline feeder: queues starving, dispatching new jobs');
      await this.phaseScraping(cp);
    }

    // Always try to move products through the pipeline
    await this.phaseTranslation(cp);
  }
}
