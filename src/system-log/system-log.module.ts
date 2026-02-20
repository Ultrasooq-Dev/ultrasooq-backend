import { Module } from '@nestjs/common';
import { SystemLogService } from './system-log.service';
import { SystemLogController } from './system-log.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SystemLogController],
  providers: [SystemLogService],
  exports: [SystemLogService],
})
export class SystemLogModule {}

