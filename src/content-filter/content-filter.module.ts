import { Module } from '@nestjs/common';
import { ContentFilterService } from './content-filter.service';
import { ContentFilterController } from './content-filter.controller';
import { ContentFilterPipe } from './pipes/content-filter.pipe';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ContentFilterController],
  providers: [ContentFilterService, ContentFilterPipe],
  exports: [ContentFilterService, ContentFilterPipe],
})
export class ContentFilterModule {}
