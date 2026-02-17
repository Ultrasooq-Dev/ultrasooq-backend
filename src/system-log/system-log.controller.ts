import { Controller, Get, Query, Param, UseGuards, ParseIntPipe, DefaultValuePipe, Delete } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SystemLogService } from './system-log.service';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';

@ApiTags('system-logs')
@ApiBearerAuth('JWT-auth')
@Controller('system-logs')
@UseGuards(SuperAdminAuthGuard)
export class SystemLogController {
  constructor(private readonly systemLogService: SystemLogService) {}

  @Get()
  async getLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('level') level?: string,
    @Query('userId') userId?: string,
    @Query('context') context?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.systemLogService.getLogs({
      level,
      userId: userId ? parseInt(userId, 10) : undefined,
      context,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      limit,
    });
  }

  @Get(':id')
  async getLogById(@Param('id', ParseIntPipe) id: number) {
    return this.systemLogService.getLogById(id);
  }

  @Delete('retention')
  async deleteOldLogs(@Query('days', new DefaultValuePipe(90), ParseIntPipe) days: number) {
    const deletedCount = await this.systemLogService.deleteOldLogs(days);
    return {
      status: true,
      message: `Successfully deleted ${deletedCount} log entries older than ${days} days`,
      deletedCount,
    };
  }
}

