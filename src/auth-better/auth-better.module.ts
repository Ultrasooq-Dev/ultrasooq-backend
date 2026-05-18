/**
 * @file auth-better.module.ts — Better Auth-aware Nest module
 *
 * Wires `AuthBetterController` (and any future Better Auth-specific
 * controllers) into the Nest DI graph. PrismaService is already global
 * via PrismaModule, so this module needs no providers beyond the
 * controller itself.
 *
 * Note: this is NOT where the Better Auth /api/auth/* handler is mounted —
 * that lives in main.ts via toNodeHandler(auth). This module only hosts
 * Nest-style endpoints that read the Better Auth session.
 */
import { Module, forwardRef } from '@nestjs/common';
import { AuthBetterController } from './auth-better.controller';
import { UserModule } from '../user/user.module';

// UserModule is imported (via forwardRef to dodge any cyclic import in the
// existing module graph) so AuthBetterController can inject UserService and
// call ensureBuyerSubForMaster() after a successful Step 3 trade-role PATCH.
@Module({
  imports: [forwardRef(() => UserModule)],
  controllers: [AuthBetterController],
})
export class AuthBetterModule {}
