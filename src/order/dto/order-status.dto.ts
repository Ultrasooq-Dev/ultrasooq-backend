import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const ORDER_PRODUCT_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'SHIPPED',
  'OFD',
  'DELIVERED',
  'RECEIVED',
  'CANCELLED',
] as const;

export type OrderProductStatusValue = (typeof ORDER_PRODUCT_STATUSES)[number];

export class UpdateOrderProductStatusDto {
  @IsNotEmpty()
  @IsInt()
  orderProductId: number;

  @IsNotEmpty()
  @IsIn(ORDER_PRODUCT_STATUSES)
  status: OrderProductStatusValue;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderShippingDto {
  @IsNotEmpty()
  @IsInt()
  orderShippingId: number;

  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'SHIPPED', 'OFD', 'DELIVERED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  receipt?: string;
}
