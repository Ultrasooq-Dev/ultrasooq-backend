import { Module } from '@nestjs/common';
import { ExternalDropshipController } from './external-dropship.controller';
import { ExternalDropshipService } from './external-dropship.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';

@Module({
  controllers: [ExternalDropshipController],
  providers: [
    ExternalDropshipService,
    UserService,
    AuthService,
    JwtService,
    NotificationService,
    S3service,
    HelperService,
  ],
})
export class ExternalDropshipModule {}
