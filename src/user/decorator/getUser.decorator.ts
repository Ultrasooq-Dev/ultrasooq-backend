/**
 * @file getUser.decorator.ts — Custom Parameter Decorator to Extract Authenticated User
 *
 * @intent
 *   Provides a clean way for controller methods to access the authenticated user
 *   (or a specific property of the user) from the request object, without
 *   manually accessing `req.user` every time.
 *
 * @idea
 *   NestJS custom parameter decorators abstract repetitive request-parsing logic.
 *   The AuthGuard attaches the decoded JWT user to `req.user`; this decorator
 *   retrieves it (or a specific sub-property) for injection into handler params.
 *
 * @usage
 *   Used in controller method parameters:
 *     @Get('/profile')
 *     getProfile(@GetUser() user)         → returns full user object
 *     getProfile(@GetUser('id') userId)   → returns only user.id
 *
 *   Requires AuthGuard to have run first (so req.user is populated).
 *
 * @dataflow
 *   AuthGuard sets req.user → GetUser decorator reads req.user → injects into handler param
 *
 * @depends
 *   - @nestjs/common (createParamDecorator, ExecutionContext)
 *
 * @notes
 *   - If `key` is provided, returns `request.user[key]` — no null-safety check,
 *     so if req.user is undefined (guard not applied), this will throw.
 *   - This decorator is defined but appears to be rarely used in the codebase;
 *     most controllers access `req.user` directly via `@Request() req`.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (key: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (key) return request.user[key];
    return request.user;
  },
);
