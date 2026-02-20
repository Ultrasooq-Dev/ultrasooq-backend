/**
 * @file app.controller.ts — Root Health-Check Controller
 *
 * @intent
 *   Provides a simple GET / endpoint that returns a health-check string.
 *   Primarily used to verify the server is running and reachable.
 *
 * @idea
 *   NestJS scaffolds this controller by default. It remains as a lightweight
 *   root-level endpoint that load balancers or monitoring tools can ping.
 *
 * @usage
 *   - Registered in AppModule.controllers.
 *   - Accessible via GET http://<host>:3000/
 *   - Called by health-check probes, browser quick-checks, or curl tests.
 *
 * @dataflow
 *   HTTP GET / → AppController.getHello() → AppService.getHello() → "Hello World!"
 *
 * @depends
 *   - @nestjs/common  (Controller, Get decorators)
 *   - AppService      (injected via constructor — provides the response string)
 *
 * @notes
 *   - No authentication guard is applied — this endpoint is intentionally public.
 *   - If a more detailed health-check is needed (DB connectivity, uptime, etc.),
 *     this controller is the natural place to extend it.
 */

import { Controller, Get, All, Req, Res, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Request, Response } from 'express';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * getHello — Root health-check endpoint.
   * @returns Plain text "Hello World!" confirming the server is alive.
   */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Handle NextAuth routes that shouldn't hit the backend
  // This prevents 404 errors in logs when NextAuth routes accidentally hit the backend
  @All('api/auth/error')
  handleNextAuthError(@Req() req: Request, @Res() res: Response) {
    // This route should be handled by the Next.js frontend, not the backend
    // Return 404 without logging as error since this is expected
    return res.status(HttpStatus.NOT_FOUND).json({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'This endpoint is handled by the frontend NextAuth service',
      path: req.url,
    });
  }

  // Handle other NextAuth callback routes
  @All('api/auth/callback/:provider')
  handleNextAuthCallback(@Req() req: Request, @Res() res: Response) {
    return res.status(HttpStatus.NOT_FOUND).json({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'This endpoint is handled by the frontend NextAuth service',
      path: req.url,
    });
  }
}
