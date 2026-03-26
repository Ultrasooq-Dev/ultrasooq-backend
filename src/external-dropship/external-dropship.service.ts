import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

@Injectable()
export class ExternalDropshipService {
  constructor(private readonly prisma: PrismaService) {}

  async createStore(
    userId: number,
    payload: { name: string; platform?: string; settings?: any },
  ) {
    try {
      const store = await this.prisma.externalStore.create({
        data: {
          name: payload.name,
          platform: payload.platform || null,
          settings: payload.settings || null,
          userId,
        },
      });

      return {
        status: true,
        message: 'External store created successfully',
        data: store,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to create external store',
        error: getErrorMessage(error),
      };
    }
  }

  async listStores(userId: number) {
    try {
      const stores = await this.prisma.externalStore.findMany({
        where: {
          userId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        status: true,
        message: 'External stores fetched successfully',
        data: stores,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to fetch external stores',
        error: getErrorMessage(error),
      };
    }
  }

  async subscribeProducts(
    userId: number,
    storeId: number,
    payload: {
      productIds: number[];
      externalProductIdMap?: Record<number, string>;
      externalSkuMap?: Record<number, string>;
    },
  ) {
    try {
      // Verify store belongs to user
      const store = await this.prisma.externalStore.findFirst({
        where: { id: storeId, userId, status: 'ACTIVE', deletedAt: null },
      });

      if (!store) {
        return {
          status: false,
          message: 'Store not found or access denied',
        };
      }

      const subscriptions = await Promise.all(
        payload.productIds.map(async (productId) => {
          return this.prisma.externalStoreSubscription.upsert({
            where: {
              externalStoreId_productId: {
                externalStoreId: storeId,
                productId,
              },
            },
            update: {
              externalProductId:
                payload.externalProductIdMap?.[productId] || undefined,
              externalSku: payload.externalSkuMap?.[productId] || undefined,
              status: 'ACTIVE',
            },
            create: {
              externalStoreId: storeId,
              productId,
              externalProductId:
                payload.externalProductIdMap?.[productId] || null,
              externalSku: payload.externalSkuMap?.[productId] || null,
            },
          });
        }),
      );

      return {
        status: true,
        message: 'Products subscribed successfully',
        data: subscriptions,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to subscribe products',
        error: getErrorMessage(error),
      };
    }
  }

  async getSubscribedProducts(userId: number, storeId: number) {
    try {
      // Verify store belongs to user
      const store = await this.prisma.externalStore.findFirst({
        where: { id: storeId, userId, status: 'ACTIVE', deletedAt: null },
      });

      if (!store) {
        return {
          status: false,
          message: 'Store not found or access denied',
        };
      }

      const subscriptions =
        await this.prisma.externalStoreSubscription.findMany({
          where: {
            externalStoreId: storeId,
            status: 'ACTIVE',
          },
          include: {
            product: {
              include: {
                productImages: { take: 1 },
                product_productPrice: { take: 1 },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

      return {
        status: true,
        message: 'Subscribed products fetched successfully',
        data: subscriptions,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to fetch subscribed products',
        error: getErrorMessage(error),
      };
    }
  }

  async getProductFeed(feedToken: string, format: 'json' | 'xml' | 'csv') {
    try {
      const store = await this.prisma.externalStore.findUnique({
        where: { feedToken },
      });

      if (!store || store.status !== 'ACTIVE' || store.deletedAt) {
        return { status: false, message: 'Feed not found' };
      }

      const subscriptions =
        await this.prisma.externalStoreSubscription.findMany({
          where: {
            externalStoreId: store.id,
            status: 'ACTIVE',
          },
          include: {
            product: {
              include: {
                productImages: true,
                product_productPrice: { take: 1 },
                category: true,
                brand: true,
              },
            },
          },
        });

      const products = subscriptions.map((sub) => {
        const product = sub.product;
        const priceRow = product.product_productPrice?.[0];
        return {
          id: sub.externalProductId || String(product.id),
          sku: sub.externalSku || product.skuNo,
          title: product.productName,
          description: product.description || '',
          price: Number(priceRow?.offerPrice ?? product.offerPrice ?? 0),
          compareAtPrice: Number(
            priceRow?.productPrice ?? product.productPrice ?? 0,
          ),
          currency: 'OMR',
          category: product.category?.categoryName || '',
          brand: product.brand?.brandName || '',
          images: product.productImages?.map((img) => img.image) || [],
          availability:
            priceRow?.stock && Number(priceRow.stock) > 0
              ? 'in_stock'
              : 'out_of_stock',
          barcode: product.barcode || '',
        };
      });

      if (format === 'json') {
        return { status: true, data: products };
      }

      if (format === 'xml') {
        const xmlItems = products
          .map(
            (p) => `  <product>
    <id>${this.escapeXml(p.id)}</id>
    <sku>${this.escapeXml(p.sku)}</sku>
    <title>${this.escapeXml(p.title)}</title>
    <description>${this.escapeXml(p.description)}</description>
    <price>${p.price}</price>
    <compare_at_price>${p.compareAtPrice}</compare_at_price>
    <currency>${p.currency}</currency>
    <category>${this.escapeXml(p.category)}</category>
    <brand>${this.escapeXml(p.brand)}</brand>
    <availability>${p.availability}</availability>
    <barcode>${this.escapeXml(p.barcode)}</barcode>
    <images>${p.images.map((img) => `<image>${this.escapeXml(img)}</image>`).join('')}</images>
  </product>`,
          )
          .join('\n');

        return {
          status: true,
          data: `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${xmlItems}\n</products>`,
        };
      }

      if (format === 'csv') {
        const header =
          'id,sku,title,description,price,compare_at_price,currency,category,brand,availability,barcode,image_url';
        const rows = products.map(
          (p) =>
            `${this.escapeCsv(p.id)},${this.escapeCsv(p.sku)},${this.escapeCsv(p.title)},${this.escapeCsv(p.description)},${p.price},${p.compareAtPrice},${p.currency},${this.escapeCsv(p.category)},${this.escapeCsv(p.brand)},${p.availability},${this.escapeCsv(p.barcode)},${this.escapeCsv(p.images[0] || '')}`,
        );
        return { status: true, data: [header, ...rows].join('\n') };
      }

      return { status: false, message: 'Unsupported format' };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to generate feed',
        error: getErrorMessage(error),
      };
    }
  }

  async handleOrderWebhook(feedToken: string, payload: any) {
    try {
      const store = await this.prisma.externalStore.findUnique({
        where: { feedToken },
      });

      if (!store || store.status !== 'ACTIVE' || store.deletedAt) {
        return { status: false, message: 'Store not found' };
      }

      // TODO: Process incoming order from external platform
      // This would typically create an order in the system
      return {
        status: true,
        message: 'Webhook received successfully',
        data: { storeId: store.id, received: true },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to process webhook',
        error: getErrorMessage(error),
      };
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeCsv(str: string): string {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}
