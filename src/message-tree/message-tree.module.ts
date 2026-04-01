import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { MessageTreeController } from './message-tree.controller';
import { MessageTreeService } from './message-tree.service';

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
  controllers: [MessageTreeController],
  providers: [AuthService, MessageTreeService],
  exports: [MessageTreeService],
})
export class MessageTreeModule {}
