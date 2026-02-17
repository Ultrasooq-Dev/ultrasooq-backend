/**
 * @file category.module.ts
 * @intent Declares the NestJS module that wires together the Category feature --
 *         controller, service, and authentication providers.
 * @idea  Keeping every category-related concern in one module follows the
 *        NestJS "feature module" pattern, making the category domain
 *        self-contained and easy to import into the root AppModule.
 * @usage Imported by AppModule (or whichever root module) to register the
 *        `/category/*` HTTP routes and their supporting services.
 * @dataflow AppModule imports CategoryModule ->
 *           NestJS IoC container instantiates CategoryController,
 *           CategoryService, AuthService, and JwtService ->
 *           controller delegates to service; guards delegate to AuthService/JwtService.
 * @depends CategoryController  -- handles HTTP routing for categories.
 *          CategoryService     -- business logic / Prisma queries.
 *          AuthService         -- token validation used by route guards.
 *          JwtService          -- JWT signing / verification (peer dep of AuthService).
 * @notes  - AuthService and JwtService are registered here (not imported from
 *           AuthModule) so the guards in CategoryController can resolve them.
 *         - PrismaClient is NOT provided through DI; it is instantiated at
 *           module scope inside CategoryService.
 */
import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [CategoryController],
  providers: [CategoryService, AuthService, JwtService]
})
export class CategoryModule {}
