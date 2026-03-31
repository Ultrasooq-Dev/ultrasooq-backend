import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IdentifyDto {
  @ApiProperty({ example: 'device-fingerprint-abc123' })
  @IsString()
  @MinLength(10)
  @MaxLength(100)
  deviceId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsUUID()
  sessionId: string;
}
