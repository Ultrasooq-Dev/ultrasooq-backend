import { IsString, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ChannelConversationsQueryDto {
  @IsString()
  channelId: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;
}
