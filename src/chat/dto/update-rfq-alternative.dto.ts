import { IsOptional, IsNumber } from 'class-validator';

export class UpdateRfqAlternativeDto {
  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  stock?: number;
}
