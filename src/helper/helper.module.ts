/**
 * HelperModule
 *
 * @intent   Provides shared helper/utility services.
 * @idea     Encapsulates cross-cutting helper functions used by multiple modules.
 * @usage    Imported by AppModule. HelperService also directly provided in
 *           UserModule, ProductModule, etc.
 * @depends  @nestjs/common, HelperService, AuthService, JwtService
 * @notes    Same re-provision pattern as other modules (AuthService, JwtService
 *           provided locally).
 */
import { Module } from '@nestjs/common';
import { HelperService } from './helper.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  providers: [HelperService, AuthService, JwtService]
})
export class HelperModule {}
