/**
 * @file auth.guard.ts — Better Auth session guard
 *
 * Wraps the Better Auth `auth.api.getSession` call so any controller can
 * require a valid Better Auth session cookie / bearer token. On success the
 * guard attaches the resolved user to `req.betterAuthUser` so handlers can
 * read it without re-doing the lookup.
 *
 * Coexists with — but is independent of — the legacy `JwtAuthGuard` in
 * `src/auth/`. New endpoints opting into Better Auth use this guard.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth';

@Injectable()
export class BetterAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session || !session.user) {
        throw new UnauthorizedException('No active Better Auth session');
      }
      // Attach the user (and full session) so the controller can use it.
      req.betterAuthUser = session.user;
      req.betterAuthSession = session.session;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid Better Auth session');
    }
  }
}
