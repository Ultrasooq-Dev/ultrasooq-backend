import { IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScrapeListDto {
  @ApiProperty({ 
    description: 'URL to scrape product listings from',
    example: 'https://www.amazon.in/s?k=ddr4+32gb&i=electronics&crid=3DWWI5D7QDKS3&sprefix=%2Celectronics%2C332&ref=nb_sb_ss_recent_2_0_recent'
  })
  @IsNotEmpty()
  @IsString()
  @IsUrl()
  url: string;
}
