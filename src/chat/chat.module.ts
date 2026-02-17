/**
 * @file chat.module.ts
 * @description NestJS module definition for the Chat feature of the Ultrasooq marketplace.
 * This module wires together the controller, service, WebSocket gateway, and supporting
 * providers (S3 file storage, authentication) needed for real-time and REST-based
 * messaging between buyers and sellers.
 *
 * @module ChatModule
 *
 * @dependencies
 * - {@link ChatService}    -- Core business logic for messages, rooms, and attachments.
 * - {@link ChatGateway}    -- Socket.io WebSocket gateway for real-time events.
 * - {@link S3service}      -- AWS S3 wrapper for file upload / presigned-URL generation.
 * - {@link AuthService}    -- Authentication helper used by the gateway and guards.
 * - {@link JwtService}     -- JWT token verification provided by @nestjs/jwt.
 * - {@link ChatController} -- REST endpoints exposed under the `/chat` route prefix.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { S3service } from 'src/user/s3.service';
import { AuthService } from 'src/auth/auth.service';
import { NotificationModule } from '../notification/notification.module';

/**
 * @class ChatModule
 * @description Encapsulates all chat-related providers and controllers into a single
 * NestJS module. Registers the WebSocket gateway alongside REST controllers so that
 * both real-time (Socket.io) and traditional HTTP communication channels are available
 * to clients.
 *
 * @idea Centralise every chat dependency in one module so the rest of the application
 * can import ChatModule without worrying about individual provider registration.
 *
 * @usage Import this module in the root AppModule to enable all chat functionality.
 *
 * @notes
 * - The module does NOT export any providers; chat internals are encapsulated.
 * - S3service is sourced from the `user` feature folder (shared utility).
 */
@Module({
  imports: [
    NotificationModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRY', '1h'),
        },
      }),
    }),
  ],
  providers: [ChatService, ChatGateway, S3service, AuthService],
  controllers: [ChatController],
})
export class ChatModule {}
