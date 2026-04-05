import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ScraperExportService {
  private readonly logger = new Logger(ScraperExportService.name);
  private readonly exportDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.exportDir = this.configService.get('SCRAPER_EXPORT_DIR', './exports');
  }

  /**
   * Export a batch of scraped products to a JSON file
   */
  async exportBatch(platform: string, region?: string, batchSize: number = 1000): Promise<{
    filePath: string;
    batchId: string;
    count: number;
  }> {
    // Get READY products for this platform
    const products = await this.prisma.scrapedProductRaw.findMany({
      where: {
        sourcePlatform: platform,
        status: 'READY',
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    if (products.length === 0) {
      throw new Error(`No READY products found for ${platform}`);
    }

    // Generate batch ID and file path
    const date = new Date().toISOString().split('T')[0];
    const batchNum = Date.now().toString(36);
    const batchId = `${platform.toUpperCase()}-${(region || 'all').toUpperCase()}-${date}-${batchNum}`;

    const dir = path.join(this.exportDir, platform, region || 'all');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fileName = `${platform}_${region || 'all'}_${date}_${batchNum}.json`;
    const filePath = path.join(dir, fileName);

    // Build export data
    const exportData = {
      metadata: {
        platform,
        region: region || 'all',
        batchId,
        count: products.length,
        exportedAt: new Date().toISOString(),
      },
      products: products.map(p => {
        const raw = (p.translatedData || p.rawData) as any;
        return {
          sourceUrl: p.sourceUrl,
          sourcePlatform: p.sourcePlatform,
          productName: p.productNameEn || p.productName,
          productNameOriginal: p.productName,
          priceOriginal: p.priceOriginal ? Number(p.priceOriginal) : null,
          priceCurrency: p.priceCurrency,
          priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
          description: raw?.description,
          specifications: raw?.specifications,
          brand: raw?.brandName,
          barcode: raw?.barcode,
          images: raw?.images || [],
          variants: raw?.variants || [],
          seller: raw?.seller,
          shipping: raw?.shipping,
          rating: raw?.rating,
          reviewCount: raw?.reviewCount,
          relatedProducts: raw?.relatedProducts || [],
          imageTexts: p.imageTexts,
          translatedFrom: p.productName !== p.productNameEn ? 'zh-CN' : null,
        };
      }),
    };

    // Write file
    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    this.logger.log(`Exported ${products.length} products to ${filePath}`);

    // Update product IDs with batch ID
    const productIds = products.map(p => p.id);
    await this.prisma.scrapedProductRaw.updateMany({
      where: { id: { in: productIds } },
      data: { status: 'READY' }, // Keep as READY until imported
    });

    // Create/update scraping job with export file
    const job = await this.prisma.scrapingJob.findFirst({
      where: { platform, batchId: null, status: 'COMPLETED' },
    });
    if (job) {
      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: { exportFilePath: filePath, batchId },
      });
    }

    return { filePath, batchId, count: products.length };
  }

  /**
   * Import a batch from JSON file into the Product table
   */
  async importBatchToDb(batchId: string): Promise<{
    imported: number;
    skipped: number;
    failed: number;
  }> {
    // Find the export file
    const job = await this.prisma.scrapingJob.findFirst({
      where: { batchId },
    });

    let filePath = job?.exportFilePath;
    if (!filePath) {
      // Try to find by batch ID pattern in exports directory
      throw new Error(`No export file found for batch ${batchId}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Export file not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const exportData = JSON.parse(fileContent);
    const products = exportData.products || [];

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    // Process in batches of 100
    for (let i = 0; i < products.length; i += 100) {
      const batch = products.slice(i, i + 100);

      for (const product of batch) {
        try {
          // Check for duplicate by sourceUrl
          const existing = await this.prisma.scrapedProductRaw.findUnique({
            where: { sourceUrl: product.sourceUrl },
          });

          if (existing?.productId) {
            skipped++;
            continue;
          }

          // Generate SKU
          const skuNo = `SCR-${product.sourcePlatform.substring(0, 3).toUpperCase()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

          // Create product with INACTIVE status
          const created = await this.prisma.product.create({
            data: {
              productName: product.productName || 'Unnamed Product',
              skuNo,
              productPrice: product.priceUsd || product.priceOriginal || 0,
              offerPrice: product.priceUsd || product.priceOriginal || 0,
              description: product.description || '',
              specification: typeof product.specifications === 'object'
                ? JSON.stringify(product.specifications)
                : product.specifications || '',
              status: 'INACTIVE',
              barcode: product.barcode,
              productType: 'P',
            },
          });

          // Update scraped product raw with product ID
          if (existing) {
            await this.prisma.scrapedProductRaw.update({
              where: { id: existing.id },
              data: { productId: created.id, status: 'IMPORTED', importedAt: new Date() },
            });
          }

          imported++;
        } catch (err) {
          this.logger.error(`Failed to import product ${product.sourceUrl}: ${err.message}`);
          failed++;
        }
      }

      this.logger.log(`Import progress: ${i + batch.length}/${products.length} (imported: ${imported}, skipped: ${skipped}, failed: ${failed})`);
    }

    // Update job stats
    if (job) {
      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: { importedCount: { increment: imported } },
      });
    }

    return { imported, skipped, failed };
  }

  /**
   * List available export files
   */
  async listExports(): Promise<Array<{ platform: string; region: string; file: string; size: number }>> {
    const results: Array<{ platform: string; region: string; file: string; size: number }> = [];

    if (!fs.existsSync(this.exportDir)) return results;

    const platforms = fs.readdirSync(this.exportDir);
    for (const platform of platforms) {
      const platformDir = path.join(this.exportDir, platform);
      if (!fs.statSync(platformDir).isDirectory()) continue;

      const regions = fs.readdirSync(platformDir);
      for (const region of regions) {
        const regionDir = path.join(platformDir, region);
        if (!fs.statSync(regionDir).isDirectory()) continue;

        const files = fs.readdirSync(regionDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const stat = fs.statSync(path.join(regionDir, file));
          results.push({ platform, region, file, size: stat.size });
        }
      }
    }

    return results;
  }
}
