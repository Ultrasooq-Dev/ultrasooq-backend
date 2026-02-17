/**
 * @file tag.module.ts — Tag Feature Module (Empty Shell)
 *
 * @intent
 *   Placeholder module for tag management. Tags are labels/keywords that can
 *   be attached to products for categorization and search.
 *
 * @idea
 *   Although this module is empty (no controllers, no providers), it is imported
 *   by AppModule. Tag-related operations (viewTags, createTag) are currently
 *   handled directly by UserService/UserController rather than a dedicated
 *   TagService/TagController.
 *
 * @usage
 *   - Imported by AppModule (root).
 *   - Currently does nothing — tag CRUD lives in UserService.
 *
 * @dataflow
 *   None — this is an empty module.
 *
 * @depends
 *   - @nestjs/common (Module)
 *
 * @notes
 *   - This module has no controllers or providers. All tag operations are in
 *     the User module (UserService.viewTags, UserService.createTag) and are
 *     exposed via UserController routes (/user/viewTags, /user/createTag).
 *   - If tag functionality grows, it should be moved into this module with
 *     its own TagController and TagService.
 */

import { Module } from '@nestjs/common';

@Module({})
export class TagModule {}
