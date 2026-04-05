import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScraperService } from '../scraper.service';
import { ScraperRotationService } from '../services/scraper-rotation.service';
import { SCRAPE_QUEUES } from '../services/scraper-queue.service';

/**
 * Processor for Amazon scraping queue.
 * Picks up jobs from BullMQ and executes scraping via the ScraperService.
 */
@Processor(SCRAPE_QUEUES.AMAZON, { concurrency: 5 })
export class AmazonScrapeProcessor extends WorkerHost {
    private readonly logger = new Logger(AmazonScrapeProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scraperService: ScraperService,
        private readonly rotationService: ScraperRotationService,
    ) {
        super();
    }

    async process(job: Job): Promise<any> {
        return this.processScrapeJob(job, 'amazon');
    }

<<<<<<< HEAD
    // ─── BullMQ lifecycle event handlers ─────────────────────────────────────
    @OnWorkerEvent('failed')
    async onFailed(job: Job, error: Error) {
        this.logger.error(`Job ${job.id} (${job.name}) FAILED after ${job.attemptsMade} attempts: ${error.message}`);
        // Update DB if we have a jobId in the data
        if (job.data?.jobId) {
            try {
                await this.prisma.scrapingJob.update({
                    where: { id: job.data.jobId },
                    data: { status: 'FAILED', lastError: `BullMQ final failure: ${error.message}` },
                });
            } catch (_) {}
        }
    }

    @OnWorkerEvent('stalled')
    onStalled(jobId: string) {
        this.logger.warn(`Job ${jobId} STALLED — worker lost connection or timed out. BullMQ will retry.`);
    }

    @OnWorkerEvent('error')
    onError(error: Error) {
        this.logger.error(`Worker error: ${error.message}`, error.stack);
    }

=======
>>>>>>> origin/feat/recommendation-system
    private async processScrapeJob(job: Job, platform: string): Promise<any> {
        const { jobId, categoryUrl, region, maxProducts } = job.data;
        this.logger.log(`Processing ${platform} job ${jobId}: ${categoryUrl} (region: ${region || 'default'})`);

        // Update DB status
        await this.prisma.scrapingJob.update({
            where: { id: jobId },
            data: { status: 'RUNNING', startedAt: new Date() },
        });

        let scrapedCount = 0;
        let failedCount = 0;
        const targetCount = maxProducts || 1000;

        try {
<<<<<<< HEAD
            // Check cooldown
            const inCooldown = await this.rotationService.isInCooldown(platform, region);
            if (inCooldown) {
                const remaining = await this.rotationService.getCooldownRemaining(platform, region);
                this.logger.warn(`${platform}:${region} in cooldown, ${Math.round(remaining / 60000)}min remaining`);
                // Re-queue with delay
                throw new Error(`Platform in cooldown for ${Math.round(remaining / 60000)} minutes`);
=======
            // Check cooldown — delay job instead of failing
            const inCooldown = await this.rotationService.isInCooldown(platform, region);
            if (inCooldown) {
                const remaining = await this.rotationService.getCooldownRemaining(platform, region);
                this.logger.log(`${platform}:${region} in cooldown (${Math.round(remaining / 60000)}min) — delaying job`);
                // Move job to delayed state instead of throwing (prevents failure count inflation)
                await job.moveToDelayed(Date.now() + remaining + 30000, job.token); // delay + 30s buffer
                await this.prisma.scrapingJob.update({
                    where: { id: jobId },
                    data: { status: 'QUEUED', cooldownUntil: new Date(Date.now() + remaining) },
                });
                return { scrapedCount: 0, delayed: true };
>>>>>>> origin/feat/recommendation-system
            }

            // Build the search URL based on platform
            const baseUrls: Record<string, Record<string, string>> = {
                amazon: {
                    us: 'https://www.amazon.com',
                    ae: 'https://www.amazon.ae',
                    uk: 'https://www.amazon.co.uk',
                    de: 'https://www.amazon.de',
                    fr: 'https://www.amazon.fr',
                    jp: 'https://www.amazon.co.jp',
                    ca: 'https://www.amazon.ca',
                    au: 'https://www.amazon.com.au',
                },
                alibaba: { default: 'https://www.alibaba.com' },
                aliexpress: { default: 'https://www.aliexpress.com' },
                taobao: { default: 'https://s.1688.com' },
                // Auto parts platforms
                hondaparts: { default: 'https://www.hondapartsnow.com' },
                rockauto: { default: 'https://www.rockauto.com' },
                megazip: { default: 'https://www.megazip.net' },
                partsouq: { default: 'https://partsouq.com' },
                realoem: { default: 'https://www.realoem.com' },
                catcar: { default: 'https://www.catcar.info' },
                yoshiparts: { default: 'https://yoshiparts.com' },
                partsnext: { default: 'https://www.partsnext.com' },
                toyotaparts: { default: 'https://toyotaparts.ourismantoyotaofrichmond.com' },
            };

            const baseUrl = baseUrls[platform]?.[region || 'default'] || baseUrls[platform]?.['us'] || '';
            const searchUrl = categoryUrl.startsWith('http') ? categoryUrl : `${baseUrl}${categoryUrl}`;

            // Scrape search results — try provider first, fallback to direct link extraction
            let searchResult = await this.scraperService.scrapeSearch(searchUrl).catch(err => {
                this.logger.warn(`Provider scrapeSearch failed: ${err.message}`);
                return { products: [] } as any;
            });

            // FALLBACK: If provider returned no products, extract links directly with Puppeteer
            if (!searchResult?.products?.length) {
                this.logger.log(`Provider returned 0 products — trying direct link extraction for ${platform}`);
<<<<<<< HEAD
                let fallbackBrowser: any = null;
                try {
                    const puppeteer = require('puppeteer');
                    fallbackBrowser = await puppeteer.launch({
=======
                try {
                    const puppeteer = require('puppeteer');
                    const browser = await puppeteer.launch({
>>>>>>> origin/feat/recommendation-system
                        headless: 'shell',
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
                        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                    });
<<<<<<< HEAD
                    const page = await fallbackBrowser.newPage();
=======
                    const page = await browser.newPage();
>>>>>>> origin/feat/recommendation-system
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
                    await page.setViewport({ width: 1920, height: 1080 });
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 3000)); // wait for dynamic content

                    // Extract product links based on platform-specific URL patterns
                    const linkPatterns: Record<string, RegExp> = {
                        amazon: /\/dp\/[A-Z0-9]{10}/,
                        alibaba: /\/product-detail\/[^"]+\.html/,
                        aliexpress: /\/item\/\d+\.html/,
                        taobao: /detail\.1688\.com\/offer\/\d+\.html|item\.taobao\.com\/item\.htm/,
                        // Auto parts platforms
                        hondaparts: /\/parts\/|\/genuine\//,
                        rockauto: /\/catalog\/|\/moreinfo\.php/,
                        megazip: /\/catalog\/|\/part\//,
                        partsouq: /\/part\/|\/catalog\//,
                        realoem: /\/bmw\/|\/partgrp\//,
                        catcar: /\/catalog\/|\/group\//,
                        yoshiparts: /\/catalog\/|\/part\//,
                        partsnext: /\/part\/|\/product\//,
                        toyotaparts: /\/v\/|\/p\//,
                    };
                    const pattern = linkPatterns[platform] || /\/product|\/item|\/part|\/dp\//;

                    const links: string[] = await page.evaluate((patternStr: string) => {
                        const regex = new RegExp(patternStr);
                        const allLinks = Array.from(document.querySelectorAll('a[href]'));
                        const productLinks: string[] = [];
                        const seen = new Set<string>();
                        for (const a of allLinks) {
                            const href = (a as HTMLAnchorElement).href;
                            if (regex.test(href) && !seen.has(href)) {
                                seen.add(href);
                                productLinks.push(href);
                            }
                        }
                        return productLinks;
                    }, pattern.source);

                    this.logger.log(`Direct extraction found ${links.length} product links for ${platform}`);

                    if (links.length > 0) {
                        searchResult = {
                            products: links.slice(0, targetCount).map(url => ({
                                productName: '',
                                productUrl: url,
                            })),
                        };
                    }
<<<<<<< HEAD
                } catch (err) {
                    this.logger.warn(`Direct link extraction failed: ${err.message}`);
                } finally {
                    // Always close the fallback browser to prevent memory leaks
                    if (fallbackBrowser) {
                        try { await fallbackBrowser.close(); } catch (_) {}
                    }
=======

                    await browser.close();
                } catch (err) {
                    this.logger.warn(`Direct link extraction failed: ${err.message}`);
>>>>>>> origin/feat/recommendation-system
                }
            }

            if (!searchResult?.products?.length) {
                this.logger.warn(`No products found for ${platform} job ${jobId} (provider + fallback both empty)`);
                await this.prisma.scrapingJob.update({
                    where: { id: jobId },
                    data: { status: 'COMPLETED', completedAt: new Date(), lastError: 'No products found' },
                });
                return { scrapedCount: 0, failedCount: 0 };
            }

<<<<<<< HEAD
            // Process each product
            const productsToScrape = searchResult.products.slice(0, targetCount);
=======
            // Process each product — DEDUP: skip URLs we already scraped
            const candidateUrls = searchResult.products.slice(0, targetCount * 2).map(p => p.productUrl);
            const existingUrls = await this.prisma.scrapedProductRaw.findMany({
                where: { sourceUrl: { in: candidateUrls } },
                select: { sourceUrl: true },
            });
            const existingSet = new Set(existingUrls.map(e => e.sourceUrl));
            const productsToScrape = searchResult.products
                .filter(p => !existingSet.has(p.productUrl))
                .slice(0, targetCount);

            if (productsToScrape.length === 0) {
                this.logger.log(`All ${candidateUrls.length} URLs already scraped for ${platform} job ${jobId} — skipping`);
                await this.prisma.scrapingJob.update({
                    where: { id: jobId },
                    data: { status: 'COMPLETED', completedAt: new Date(), lastError: 'All URLs already scraped (dedup)' },
                });
                return { scrapedCount: 0, failedCount: 0 };
            }

            this.logger.log(`${productsToScrape.length} new URLs to scrape (${existingSet.size} duplicates skipped)`);
>>>>>>> origin/feat/recommendation-system

            for (const product of productsToScrape) {
                try {
                    // Add jitter between requests
                    const jitter = this.rotationService.getRequestJitter(1000, 4000);
                    await new Promise(resolve => setTimeout(resolve, jitter));

                    // Scrape individual product
                    const scrapedProduct = await this.scraperService.scrapeProduct(product.productUrl);

<<<<<<< HEAD
                    // Store raw data
                    await this.prisma.scrapedProductRaw.create({
                        data: {
=======
                    // Extract product name from multiple sources (fallback chain)
                    const productName = scrapedProduct.productName
                        || (scrapedProduct as any).metadata?.title
                        || (scrapedProduct as any).metadata?.name
                        || product.productName
                        || '';

                    // Extract price from multiple sources
                    const price = scrapedProduct.productPrice
                        || scrapedProduct.offerPrice
                        || (scrapedProduct as any).metadata?.price
                        || null;

                    // Determine currency by platform
                    const currencyMap: Record<string, string> = {
                        amazon: 'USD', alibaba: 'USD', aliexpress: 'USD', taobao: 'CNY',
                        hondaparts: 'USD', rockauto: 'USD', megazip: 'USD',
                        partsouq: 'AED', realoem: 'EUR', catcar: 'EUR',
                        yoshiparts: 'USD', partsnext: 'USD', toyotaparts: 'USD',
                    };

                    // Store raw data — upsert to prevent duplicate constraint errors
                    await this.prisma.scrapedProductRaw.upsert({
                        where: { sourceUrl: product.productUrl },
                        create: {
>>>>>>> origin/feat/recommendation-system
                            jobId,
                            rawData: scrapedProduct as any,
                            sourceUrl: product.productUrl,
                            sourcePlatform: platform,
<<<<<<< HEAD
                            productName: scrapedProduct.productName,
                            priceOriginal: scrapedProduct.productPrice || null,
                            priceCurrency: platform === 'amazon' ? 'USD' : platform === 'taobao' ? 'CNY' : 'USD',
                            status: platform === 'amazon' ? 'TRANSLATED' : 'RAW', // Amazon is already English
=======
                            productName,
                            priceOriginal: price,
                            priceCurrency: currencyMap[platform] || 'USD',
                            status: platform === 'amazon' ? 'TRANSLATED' : 'RAW',
                        },
                        update: {
                            rawData: scrapedProduct as any,
                            productName: productName || undefined,
                            priceOriginal: price || undefined,
                            priceCurrency: currencyMap[platform] || undefined,
                            updatedAt: new Date(),
>>>>>>> origin/feat/recommendation-system
                        },
                    });

                    scrapedCount++;

                    // Update job progress periodically
                    if (scrapedCount % 10 === 0) {
                        await this.prisma.scrapingJob.update({
                            where: { id: jobId },
                            data: { scrapedCount },
                        });
                        // Adjust rate on success streak
                        await this.rotationService.adjustRate(platform, false);
                    }
                } catch (err) {
                    failedCount++;
                    this.logger.warn(`Failed to scrape product ${product.productUrl}: ${err.message}`);

                    // Check if blocked
                    const blockCheck = this.rotationService.detectBlock({
                        status: 200,
                        body: err.message || '',
                        url: product.productUrl,
                    });

                    if (blockCheck.blocked) {
                        this.logger.error(`BLOCKED on ${platform}: ${blockCheck.reason}`);
                        await this.rotationService.recordBlock(platform, region);
                        await this.rotationService.adjustRate(platform, true);

                        // Update job as blocked
                        await this.prisma.scrapingJob.update({
                            where: { id: jobId },
                            data: {
                                status: 'BLOCKED',
                                blockedAt: new Date(),
                                lastError: blockCheck.reason,
                                scrapedCount,
                                failedCount,
                            },
                        });
                        return { scrapedCount, failedCount, blocked: true, reason: blockCheck.reason };
                    }
                }
            }

            // Mark job completed
            await this.prisma.scrapingJob.update({
                where: { id: jobId },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    scrapedCount,
                    failedCount,
                },
            });

            this.logger.log(`Completed ${platform} job ${jobId}: ${scrapedCount} scraped, ${failedCount} failed`);
            return { scrapedCount, failedCount };
        } catch (error) {
            this.logger.error(`Job ${jobId} failed: ${error.message}`);
            await this.prisma.scrapingJob.update({
                where: { id: jobId },
                data: {
                    status: 'FAILED',
                    lastError: error.message,
                    scrapedCount,
                    failedCount,
                },
            });
            throw error; // BullMQ will retry based on config
        }
    }
}

/**
 * Processor for Taobao scraping queue.
 */
@Processor(SCRAPE_QUEUES.TAOBAO, { concurrency: 3 })
export class TaobaoScrapeProcessor extends WorkerHost {
    private readonly logger = new Logger(TaobaoScrapeProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scraperService: ScraperService,
        private readonly rotationService: ScraperRotationService,
    ) {
        super();
    }

    async process(job: Job): Promise<any> {
        return new AmazonScrapeProcessor(this.prisma, this.scraperService, this.rotationService)
            ['processScrapeJob'](job, 'taobao');
    }
}

/**
 * Processor for Alibaba scraping queue.
 */
@Processor(SCRAPE_QUEUES.ALIBABA, { concurrency: 5 })
export class AlibabaScrapeProcessor extends WorkerHost {
    private readonly logger = new Logger(AlibabaScrapeProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scraperService: ScraperService,
        private readonly rotationService: ScraperRotationService,
    ) {
        super();
    }

    async process(job: Job): Promise<any> {
        return new AmazonScrapeProcessor(this.prisma, this.scraperService, this.rotationService)
            ['processScrapeJob'](job, 'alibaba');
    }
}

/**
 * Processor for AliExpress scraping queue.
 */
@Processor(SCRAPE_QUEUES.ALIEXPRESS, { concurrency: 5 })
export class AliExpressScrapeProcessor extends WorkerHost {
    private readonly logger = new Logger(AliExpressScrapeProcessor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly scraperService: ScraperService,
        private readonly rotationService: ScraperRotationService,
    ) {
        super();
    }

    async process(job: Job): Promise<any> {
        return new AmazonScrapeProcessor(this.prisma, this.scraperService, this.rotationService)
            ['processScrapeJob'](job, 'aliexpress');
    }
}
