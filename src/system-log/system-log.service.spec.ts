import { Test, TestingModule } from '@nestjs/testing';
import { SystemLogService } from './system-log.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  systemLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    groupBy: jest.fn(),
  },
};

describe('SystemLogService', () => {
  let service: SystemLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<SystemLogService>(SystemLogService);
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // getLogs — filters
  // ═══════════════════════════════════════════════════════════

  describe('getLogs', () => {
    it('queries with no filters', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);
      mockPrisma.systemLog.count.mockResolvedValue(0);

      const result = await service.getLogs({});
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('filters by level', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);
      mockPrisma.systemLog.count.mockResolvedValue(0);

      await service.getLogs({ level: 'ERROR' });

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ level: 'ERROR' }),
        }),
      );
    });

    it('filters by requestId', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);
      mockPrisma.systemLog.count.mockResolvedValue(0);

      await service.getLogs({ requestId: 'req_123_abc' });

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ requestId: 'req_123_abc' }),
        }),
      );
    });

    it('searches across message, path, requestId, context', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);
      mockPrisma.systemLog.count.mockResolvedValue(0);

      await service.getLogs({ search: 'deal' });

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ message: { contains: 'deal', mode: 'insensitive' } }),
              expect.objectContaining({ path: { contains: 'deal', mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });

    it('filters by method', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);
      mockPrisma.systemLog.count.mockResolvedValue(0);

      await service.getLogs({ method: 'POST' });

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ method: 'POST' }),
        }),
      );
    });

    it('filters by statusCode', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);
      mockPrisma.systemLog.count.mockResolvedValue(0);

      await service.getLogs({ statusCode: 500 });

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ statusCode: 500 }),
        }),
      );
    });

    it('paginates correctly', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);
      mockPrisma.systemLog.count.mockResolvedValue(100);

      const result = await service.getLogs({ page: 3, limit: 20 });

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
      expect(result.totalPages).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // getTrace — request pipeline trace
  // ═══════════════════════════════════════════════════════════

  describe('getTrace', () => {
    it('returns full pipeline trace for a requestId', async () => {
      const now = new Date();
      const logs = [
        { id: 1, requestId: 'req_123', level: 'INFO', context: 'HTTP GET', message: 'Request start', statusCode: null, createdAt: now, metadata: null, user: { id: 1, email: 'test@test.com' }, ipAddress: '127.0.0.1', userAgent: 'Test', method: 'GET', path: '/deal/list', errorStack: null },
        { id: 2, requestId: 'req_123', level: 'INFO', context: 'HTTP GET', message: 'HTTP 200 - GET /deal/list', statusCode: 200, createdAt: new Date(now.getTime() + 145), metadata: { delay: '145ms' }, user: { id: 1, email: 'test@test.com' }, ipAddress: '127.0.0.1', userAgent: 'Test', method: 'GET', path: '/deal/list', errorStack: null },
      ];

      mockPrisma.systemLog.findMany.mockResolvedValue(logs);

      const result = await service.getTrace('req_123');

      expect(result.status).toBe(true);
      expect(result.data.requestId).toBe('req_123');
      expect(result.data.steps).toHaveLength(2);
      expect(result.data.hasError).toBe(false);
      expect(result.data.totalDuration).toBe(145);
    });

    it('detects errors in trace', async () => {
      const now = new Date();
      mockPrisma.systemLog.findMany.mockResolvedValue([
        { id: 1, requestId: 'req_err', level: 'INFO', context: 'HTTP POST', message: 'Start', statusCode: null, createdAt: now, user: null, method: 'POST', path: '/deal/accept', errorStack: null, metadata: null, ipAddress: null, userAgent: null },
        { id: 2, requestId: 'req_err', level: 'ERROR', context: 'HTTP POST', message: 'Deal not found', statusCode: 404, createdAt: new Date(now.getTime() + 50), user: null, method: 'POST', path: '/deal/accept', errorStack: 'Error: Deal not found\n  at DealService...', metadata: null, ipAddress: null, userAgent: null },
      ]);

      const result = await service.getTrace('req_err');

      expect(result.data.hasError).toBe(true);
      expect(result.data.errorMessage).toBe('Deal not found');
      expect(result.data.errorStack).toContain('DealService');
    });

    it('returns not found for unknown requestId', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      const result = await service.getTrace('req_unknown');

      expect(result.status).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // getStats — summary statistics
  // ═══════════════════════════════════════════════════════════

  describe('getStats', () => {
    it('returns aggregated stats', async () => {
      mockPrisma.systemLog.count
        .mockResolvedValueOnce(5000)  // totalLogs
        .mockResolvedValueOnce(3)     // errors 1h
        .mockResolvedValueOnce(12);   // errors 24h

      mockPrisma.systemLog.groupBy.mockResolvedValue([
        { level: 'INFO', _count: { id: 450 } },
        { level: 'ERROR', _count: { id: 12 } },
        { level: 'WARN', _count: { id: 25 } },
      ]);

      mockPrisma.systemLog.findMany
        .mockResolvedValueOnce([])  // topErrors
        .mockResolvedValueOnce([]); // slowRequests

      const result = await service.getStats();

      expect(result.status).toBe(true);
      expect(result.data.totalLogs).toBe(5000);
      expect(result.data.errors.lastHour).toBe(3);
      expect(result.data.errors.last24h).toBe(12);
      expect(result.data.byLevel).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // createLog — write log
  // ═══════════════════════════════════════════════════════════

  describe('createLog', () => {
    it('writes log to database', async () => {
      mockPrisma.systemLog.create.mockResolvedValue({ id: 1 });

      await service.createLog({
        level: 'INFO',
        message: 'Test log',
        requestId: 'req_test',
      });

      expect(mockPrisma.systemLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            level: 'INFO',
            message: 'Test log',
            requestId: 'req_test',
          }),
        }),
      );
    });

    it('does not throw on DB error', async () => {
      mockPrisma.systemLog.create.mockRejectedValue(new Error('DB down'));

      await expect(service.createLog({ level: 'ERROR', message: 'test' })).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // deleteOldLogs — retention
  // ═══════════════════════════════════════════════════════════

  describe('deleteOldLogs', () => {
    it('deletes logs older than specified days', async () => {
      mockPrisma.systemLog.deleteMany.mockResolvedValue({ count: 150 });

      const result = await service.deleteOldLogs(30);

      expect(result).toBe(150);
      expect(mockPrisma.systemLog.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdAt: { lt: expect.any(Date) } },
        }),
      );
    });
  });
});
