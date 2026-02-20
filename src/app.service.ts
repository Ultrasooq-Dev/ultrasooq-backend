/**
 * @file app.service.ts — Root Application Service
 *
 * @intent
 *   Provides the business logic for the root-level AppController. Currently
 *   only serves a "Hello World!" string for the health-check endpoint.
 *
 * @idea
 *   NestJS separates controllers (HTTP handling) from services (business logic).
 *   Even for trivial operations, this pattern is maintained for consistency and
 *   testability.
 *
 * @usage
 *   - Registered in AppModule.providers.
 *   - Injected into AppController via its constructor.
 *   - Called by AppController.getHello().
 *
 * @dataflow
 *   AppController.getHello() → AppService.getHello() → returns "Hello World!"
 *
 * @depends
 *   - @nestjs/common  (Injectable decorator)
 *
 * @notes
 *   - This is the default NestJS scaffold service. It has no dependencies on
 *     the database or any other service.
 *   - Could be extended to return version info, uptime, or system status.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /**
   * getHello — Returns a simple greeting / health-check string.
   * @returns "Hello World!" — indicates the app is running.
   */
  getHello(): string {
    return 'Hello World!';
  }
}
