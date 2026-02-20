import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

@Injectable()
export class BannerService {
  constructor(private readonly prisma: PrismaService) {}
  // Helper function to convert BigInt to number for JSON serialization
  private convertBannerForResponse(banner: any) {
    if (!banner) return null;
    return {
      ...banner,
      id: Number(banner.id),
    };
  }

  // Helper function to convert array of banners
  private convertBannersForResponse(banners: any[]) {
    return banners.map(banner => this.convertBannerForResponse(banner));
  }

  // Get all active banners (public)
  async getActiveBanners(position?: string) {
    try {
      const now = new Date();
      
      const where: any = {
        isActive: true,
        AND: [
          {
            OR: [
              { startDate: null },
              { startDate: { lte: now } },
            ],
          },
          {
            OR: [
              { endDate: null },
              { endDate: { gte: now } },
            ],
          },
        ],
      };

      if (position) {
        where.position = position;
      }

      const banners = await this.prisma.banner.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return {
        status: true,
        message: 'Banners retrieved successfully',
        data: this.convertBannersForResponse(banners),
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching active banners',
        error: getErrorMessage(error),
      };
    }
  }

  // Get all banners (admin)
  async getAllBanners(page: number = 1, limit: number = 10, position?: string) {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      if (position) {
        where.position = position;
      }

      const [banners, total] = await Promise.all([
        this.prisma.banner.findMany({
          where,
          skip,
          take: limit,
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'desc' },
          ],
        }),
        this.prisma.banner.count({ where }),
      ]);

      return {
        status: true,
        message: 'Banners retrieved successfully',
        data: {
          banners: this.convertBannersForResponse(banners),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching banners',
        error: getErrorMessage(error),
      };
    }
  }

  // Get single banner
  async getBannerById(id: number) {
    try {
      const banner = await this.prisma.banner.findUnique({
        where: { id: BigInt(id) },
      });

      if (!banner) {
        return {
          status: false,
          message: 'Banner not found',
          data: null,
        };
      }

      return {
        status: true,
        message: 'Banner retrieved successfully',
        data: this.convertBannerForResponse(banner),
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching banner',
        error: getErrorMessage(error),
      };
    }
  }

  // Create banner (admin)
  async createBanner(payload: any, req: any) {
    try {
      // Validate required fields
      if (!payload.title) {
        return {
          status: false,
          message: 'Title is required',
        };
      }

      if (!payload.image) {
        return {
          status: false,
          message: 'Image is required',
        };
      }

      // Validate position enum
      const validPositions = ['MAIN', 'SIDE_TOP', 'SIDE_BOTTOM', 'FULL_WIDTH', 'POPUP'];
      const position = payload.position || 'MAIN';
      if (!validPositions.includes(position)) {
        return {
          status: false,
          message: `Invalid position. Must be one of: ${validPositions.join(', ')}`,
        };
      }

      // Parse dates safely
      let startDate = null;
      let endDate = null;
      
      if (payload.startDate && payload.startDate.trim() !== '') {
        try {
          startDate = new Date(payload.startDate);
          if (isNaN(startDate.getTime())) {
            startDate = null;
          }
        } catch (e) {
          startDate = null;
        }
      }

      if (payload.endDate && payload.endDate.trim() !== '') {
        try {
          endDate = new Date(payload.endDate);
          if (isNaN(endDate.getTime())) {
            endDate = null;
          }
        } catch (e) {
          endDate = null;
        }
      }

      const banner = await this.prisma.banner.create({
        data: {
          title: payload.title,
          subtitle: payload.subtitle && payload.subtitle.trim() !== '' ? payload.subtitle : null,
          description: payload.description && payload.description.trim() !== '' ? payload.description : null,
          image: payload.image,
          link: payload.link && payload.link.trim() !== '' ? payload.link : null,
          buttonText: payload.buttonText && payload.buttonText.trim() !== '' ? payload.buttonText : 'Shop Now',
          position: position as any,
          priority: payload.priority ? parseInt(payload.priority) : 0,
          startDate: startDate,
          endDate: endDate,
          targetUrl: payload.targetUrl && payload.targetUrl.trim() !== '' ? payload.targetUrl : null,
          isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
        },
      });

      return {
        status: true,
        message: 'Banner created successfully',
        data: this.convertBannerForResponse(banner),
      };
    } catch (error: any) {
      return {
        status: false,
        message: 'Error creating banner',
        error: getErrorMessage(error) || 'Unknown error occurred',
        details: error.code || null,
      };
    }
  }

  // Update banner (admin)
  async updateBanner(id: number, payload: any, req: any) {
    try {
      const updateData: any = {};

      // Validate position if provided
      if (payload.position !== undefined) {
        const validPositions = ['MAIN', 'SIDE_TOP', 'SIDE_BOTTOM', 'FULL_WIDTH', 'POPUP'];
        if (!validPositions.includes(payload.position)) {
          return {
            status: false,
            message: `Invalid position. Must be one of: ${validPositions.join(', ')}`,
          };
        }
        updateData.position = payload.position;
      }

      if (payload.title !== undefined) updateData.title = payload.title;
      if (payload.subtitle !== undefined) {
        updateData.subtitle = payload.subtitle && payload.subtitle.trim() !== '' ? payload.subtitle : null;
      }
      if (payload.description !== undefined) {
        updateData.description = payload.description && payload.description.trim() !== '' ? payload.description : null;
      }
      if (payload.image !== undefined) updateData.image = payload.image;
      if (payload.link !== undefined) {
        updateData.link = payload.link && payload.link.trim() !== '' ? payload.link : null;
      }
      if (payload.buttonText !== undefined) {
        updateData.buttonText = payload.buttonText && payload.buttonText.trim() !== '' ? payload.buttonText : 'Shop Now';
      }
      if (payload.priority !== undefined) {
        updateData.priority = parseInt(payload.priority) || 0;
      }
      
      // Parse dates safely
      if (payload.startDate !== undefined) {
        if (payload.startDate && payload.startDate.trim() !== '') {
          try {
            const date = new Date(payload.startDate);
            updateData.startDate = isNaN(date.getTime()) ? null : date;
          } catch (e) {
            updateData.startDate = null;
          }
        } else {
          updateData.startDate = null;
        }
      }
      
      if (payload.endDate !== undefined) {
        if (payload.endDate && payload.endDate.trim() !== '') {
          try {
            const date = new Date(payload.endDate);
            updateData.endDate = isNaN(date.getTime()) ? null : date;
          } catch (e) {
            updateData.endDate = null;
          }
        } else {
          updateData.endDate = null;
        }
      }
      
      if (payload.targetUrl !== undefined) {
        updateData.targetUrl = payload.targetUrl && payload.targetUrl.trim() !== '' ? payload.targetUrl : null;
      }
      if (payload.isActive !== undefined) {
        updateData.isActive = Boolean(payload.isActive);
      }

      const banner = await this.prisma.banner.update({
        where: { id: BigInt(id) },
        data: updateData,
      });

      return {
        status: true,
        message: 'Banner updated successfully',
        data: this.convertBannerForResponse(banner),
      };
    } catch (error: any) {
      return {
        status: false,
        message: 'Error updating banner',
        error: getErrorMessage(error) || 'Unknown error occurred',
        details: error.code || null,
      };
    }
  }

  // Delete banner (admin)
  async deleteBanner(id: number, req: any) {
    try {
      await this.prisma.banner.delete({
        where: { id: BigInt(id) },
      });

      return {
        status: true,
        message: 'Banner deleted successfully',
        data: null,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error deleting banner',
        error: getErrorMessage(error),
      };
    }
  }

  // Toggle banner status (admin)
  async toggleBannerStatus(id: number, isActive: boolean) {
    try {
      const banner = await this.prisma.banner.update({
        where: { id: BigInt(id) },
        data: { isActive },
      });

      return {
        status: true,
        message: `Banner ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: this.convertBannerForResponse(banner),
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error updating banner status',
        error: getErrorMessage(error),
      };
    }
  }

  // Update banner priority (admin)
  async updateBannerPriority(id: number, priority: number) {
    try {
      const banner = await this.prisma.banner.update({
        where: { id: BigInt(id) },
        data: { priority },
      });

      return {
        status: true,
        message: 'Banner priority updated successfully',
        data: this.convertBannerForResponse(banner),
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error updating banner priority',
        error: getErrorMessage(error),
      };
    }
  }

  // Track banner click
  async trackBannerClick(id: number) {
    try {
      await this.prisma.banner.update({
        where: { id: BigInt(id) },
        data: {
          clicks: {
            increment: 1,
          },
        },
      });

      return {
        status: true,
        message: 'Click tracked successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error tracking click',
        error: getErrorMessage(error),
      };
    }
  }

  // Track banner view
  async trackBannerView(id: number) {
    try {
      await this.prisma.banner.update({
        where: { id: BigInt(id) },
        data: {
          views: {
            increment: 1,
          },
        },
      });

      return {
        status: true,
        message: 'View tracked successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error tracking view',
        error: getErrorMessage(error),
      };
    }
  }

  // Get banner analytics (admin)
  async getBannerAnalytics() {
    try {
      const [totalBanners, activeBanners, allBanners] = await Promise.all([
        this.prisma.banner.count(),
        this.prisma.banner.count({ where: { isActive: true } }),
        this.prisma.banner.findMany({
          select: {
            id: true,
            title: true,
            clicks: true,
            views: true,
            position: true,
            isActive: true,
          },
        }),
      ]);

      const totalClicks = allBanners.reduce((sum, b) => sum + b.clicks, 0);
      const totalViews = allBanners.reduce((sum, b) => sum + b.views, 0);
      const clickThroughRate = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

      // Top performing banners (by clicks)
      const topBanners = allBanners
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10)
        .map((b) => ({
          ...b,
          id: Number(b.id),
        }));

      return {
        status: true,
        message: 'Analytics retrieved successfully',
        data: {
          totalBanners,
          activeBanners,
          totalClicks,
          totalViews,
          clickThroughRate: parseFloat(clickThroughRate.toFixed(2)),
          topBanners,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching analytics',
        error: getErrorMessage(error),
      };
    }
  }
}

