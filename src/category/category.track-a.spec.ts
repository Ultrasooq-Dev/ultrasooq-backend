import { BadRequestException } from '@nestjs/common';

jest.mock('src/guards/SuperAdminAuthGuard', () => ({
  SuperAdminAuthGuard: class SuperAdminAuthGuard {},
}));

import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

describe('Category Track A hardening', () => {
  it('returns a real 400 before getMenu touches service/cache/Prisma for missing categoryId', () => {
    const service = { getMenu: jest.fn() } as unknown as CategoryService;
    const controller = new CategoryController(service);

    expect(() => controller.getMenu(undefined as any)).toThrow(BadRequestException);
    expect((service.getMenu as jest.Mock)).not.toHaveBeenCalled();
  });

  it('passes a parsed positive categoryId to getMenu', () => {
    const service = { getMenu: jest.fn().mockReturnValue({ status: true }) } as unknown as CategoryService;
    const controller = new CategoryController(service);

    controller.getMenu('42');

    expect(service.getMenu).toHaveBeenCalledWith(42);
  });
});
