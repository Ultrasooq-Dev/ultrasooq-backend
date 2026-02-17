import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { NotificationService } from '../notification/notification.service';
import { HelperService } from '../helper/helper.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Mock PrismaService — minimal stubs for OrderService.
 * The auto-confirm scheduler uses productPrice and orderProducts, so we stub those too.
 */
const mockPrismaService = {
  order: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  orderSeller: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  orderProducts: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  orderShipping: {
    create: jest.fn(),
  },
  orderAddress: {
    create: jest.fn(),
  },
  cart: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  cartProductService: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  cartServiceFeature: {
    deleteMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  productPrice: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  transactionPaymob: {
    create: jest.fn(),
  },
  orderEMI: {
    create: jest.fn(),
  },
  orderProductService: {
    create: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
  },
};

const mockNotificationService = {
  sendNotification: jest.fn(),
  sendEmail: jest.fn(),
};

const mockHelperService = {
  getAdminId: jest.fn(),
};

const mockWalletService = {
  getBalance: jest.fn(),
  debit: jest.fn(),
  credit: jest.fn(),
};

describe('OrderService', () => {
  let service: OrderService;
  let prisma: typeof mockPrismaService;

  // We need to spy on setInterval to verify the auto-confirm scheduler
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Spy on setInterval before module creation
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue({
      ref: jest.fn(),
      unref: jest.fn(),
      hasRef: jest.fn(),
      refresh: jest.fn(),
      [Symbol.toPrimitive]: jest.fn(),
      [Symbol.dispose]: jest.fn(),
    } as unknown as NodeJS.Timeout);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: HelperService, useValue: mockHelperService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================================
  // Auto-confirm interval initialization
  // ===========================================================================
  describe('constructor / auto-confirm interval', () => {
    it('should initialize auto-confirm interval on construction', () => {
      // The constructor should have called setInterval with 5 * 60 * 1000 ms (5 minutes)
      // Since we mocked setInterval before module creation, check it was called
      expect(setIntervalSpy).toHaveBeenCalled();

      // Find the call that matches the 5-minute interval (300000 ms)
      const intervalCalls = setIntervalSpy.mock.calls;
      const fiveMinuteCall = intervalCalls.find(
        (call) => call[1] === 5 * 60 * 1000,
      );
      expect(fiveMinuteCall).toBeDefined();

      // The callback should be a function
      expect(typeof fiveMinuteCall[0]).toBe('function');
    });

    it('should set autoConfirmInterval to a non-null value', () => {
      // The service's private autoConfirmInterval should have been set
      // We can verify this indirectly: setInterval was called and returned a value
      expect(setIntervalSpy).toHaveBeenCalled();

      // The interval should have been set with 5-minute period
      const matchingCall = setIntervalSpy.mock.calls.find(
        (call) => call[1] === 300000,
      );
      expect(matchingCall).toBeDefined();
    });
  });

  // ===========================================================================
  // Service structure smoke tests
  // ===========================================================================
  describe('service methods existence', () => {
    it('should have createOrder2 method', () => {
      expect(typeof (service as any).createOrder2).toBe('function');
    });

    it('should have autoConfirmBuygroupOrdersOnStockOut as private method', () => {
      // Private methods are accessible via bracket notation in tests
      expect(typeof (service as any).autoConfirmBuygroupOrdersOnStockOut).toBe('function');
    });
  });
});
