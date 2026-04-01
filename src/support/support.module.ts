import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { WidgetController } from './widget.controller';
import { SupportGateway } from './support.gateway';
import { BotService } from './bot/bot.service';
import { SelfLearningService } from './bot/self-learning.service';
import { SupportTrackingService } from './tracking/support-tracking.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRY', '1h') },
      }),
    }),
  ],
  controllers: [SupportController, WidgetController],
  providers: [
    AuthService,
    SuperAdminAuthGuard,
    SupportService,
    BotService,
    SelfLearningService,
    SupportTrackingService,
    SupportGateway,
  ],
  exports: [SupportService, BotService, SupportGateway],
})
export class SupportModule {}
