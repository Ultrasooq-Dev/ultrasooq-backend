/**
 * @file policy.service.ts
 *
 * @intent
 *   Contains all business logic and Prisma database operations for the
 *   policy domain -- CRUD for platform policies that follow a parent-child
 *   hierarchy (e.g., "Tax" as parent, "GST" / "VAT" as children).
 *
 * @idea
 *   Each public method wraps its logic in try/catch and returns a uniform
 *   response shape: { status, message, data?, totalCount?, error? }.
 *   The PrismaClient instance is created at module scope (singleton for
 *   this service file) rather than being injected through NestJS DI.
 *
 * @usage
 *   Injected into PolicyController via NestJS DI:
 *     constructor(private readonly policyService: PolicyService) {}
 *
 * @dataflow
 *   PolicyController -> PolicyService method -> PrismaClient -> PostgreSQL
 *
 * @depends
 *   - PrismaClient  : auto-generated Prisma ORM client for database access
 *   - @nestjs/common : Injectable decorator
 *
 * @notes
 *   - "rule" fields contain JSON-stringified Plate/Slate rich-text editor
 *     content (e.g., '[{"children":[{"text":"..."}],"type":"p","id":"..."}]').
 *   - Soft deletion is used: status is set to "DELETE" and deletedAt is
 *     populated instead of removing the row.
 *   - The default pageSize of 10 000 000 when no limit is supplied effectively
 *     disables pagination.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';


@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @intent
   *   Create a new policy.  Supports two modes:
   *     1. New root + child  -- when `payload.categoryName` is provided.
   *     2. New child only    -- when `payload.parentId` is provided.
   *
   * @idea
   *   Mode 1: First creates a root policy using `categoryName` as its label,
   *   then immediately creates a child policy beneath it using `ruleName` as
   *   the child's categoryName.  Both share the same `rule` content.
   *   Mode 2: Creates a single child policy under the specified `parentId`.
   *
   * @usage
   *   // Mode 1 -- new category with its first sub-policy:
   *   createPolicy({ categoryName: "Tax", ruleName: "GST", rule: "<json>" })
   *
   *   // Mode 2 -- add a sub-policy to existing parent (id 50):
   *   createPolicy({ parentId: 50, ruleName: "VAT", rule: "<json>" })
   *
   * @dataflow
   *   payload -> branch on categoryName|parentId -> this.prisma.policy.create (1 or 2 inserts) -> response
   *
   * @depends
   *   - this.prisma.policy.create
   *
   * @notes
   *   - The two `if` blocks are NOT mutually exclusive; if both categoryName
   *     and parentId are supplied, both branches execute.
   *   - Returns an empty `data: []` regardless of created records; the
   *     created entities are not included in the response.
   *   - `rule` is stored as a raw string (JSON-stringified Plate/Slate content).
   */
  async createPolicy(payload: any) {
    try {

      // Example payload for Mode 1 (root + child):
      // {
      //   "ruleName": "GST DEPERTMENT",
      //   "rule": "[{\"children\":[{\"text\":\"Tax depertment\"}],\"type\":\"p\",\"id\":\"k8wlu\"}]",
      //   "categoryName": "Tax depertment"
      // }


      // Example payload for Mode 2 (child under existing parent):
      // {
      //     "ruleName": "VAT DEPERTMENT",
      //     "rule": "[{\"children\":[{\"text\":\"Tax department\"}],\"type\":\"p\",\"id\":\"k8wlu\"}]",
      //     "parentId": 50
      // }

      // --- Mode 1: categoryName present -> create root policy, then nest a child under it ---
      if (payload.categoryName) {
        let createPolicy = await this.prisma.policy.create({
          data: {
            rule: payload.rule,
            categoryName: payload.categoryName,
          }
        });
        let createsub = await this.prisma.policy.create({
          data: {
            rule: payload.rule,
            categoryName: payload.ruleName,
            parentId: createPolicy.id
          }
        })
      }

      // --- Mode 2: parentId present -> create child policy under that parent ---
      if (payload.parentId){
        let createsub = await this.prisma.policy.create({
          data: {
            rule: payload.rule,
            categoryName: payload.ruleName,
            parentId: payload.parentId
          }
        })
      }

      return {
        status: true,
        message: 'Created Successfully',
        data: []
      }
    } catch (error) {
      return {
        status: false,
        message: 'error, in createPolicy',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Fetch a paginated, searchable list of root-level (parentId === null)
   *   active policies, each with their active children included.
   *
   * @idea
   *   Combines Prisma `findMany` with `count` to return both a page of
   *   results and the total number of matching records. Search is
   *   case-insensitive on `categoryName` and only activates when the
   *   search term is longer than 2 characters.
   *
   * @usage
   *   getAllPolicy(req, 1, 20, 'desc', 'tax')
   *
   * @dataflow
   *   params -> parse page/limit -> this.prisma.policy.findMany (root + children)
   *          -> this.prisma.policy.count (same filter) -> response
   *
   * @depends
   *   - this.prisma.policy.findMany
   *   - this.prisma.policy.count
   *
   * @notes
   *   - Default pageSize is 10 000 000 when `limit` is not provided,
   *     effectively disabling pagination.
   *   - Only root policies (parentId: null) are fetched; child policies
   *     appear via the `children` relation include.
   *   - The `sort` parameter is accepted but not used; sort order is
   *     hardcoded to 'desc' by createdAt.
   *   - The success response message is "Created Successfully" -- a known
   *     copy-paste artefact from the create endpoint.
   */
  async getAllPolicy(req: any, page: any, limit: any, sort: any, searchTerm: any) {
    try {
      // --- Parse and default pagination parameters ---
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10000000;
      const skip = (Page - 1) * pageSize;
      const sortType = 'desc';

      // --- Build search filter; ignore short search terms (<=2 chars) ---
      let searchTERM = searchTerm?.length > 2 ? searchTerm : ''

      // --- Fetch root-level active policies with active children ---
      let getAllPolicy = await this.prisma.policy.findMany({
        where: {
          status: 'ACTIVE',
          categoryName: {
            contains: searchTERM,
            mode: 'insensitive'
          },
          parentId: null
          // OR: [
          //   { parentId: null }, // Root policies
          // ]
        },
        include: {
          children: {
            where: {
              status: "ACTIVE"
            }
          }
        },
        orderBy: { createdAt: sortType },
        skip, // Offset
        take: pageSize, // Limit
      });

      // --- Handle empty result ---
      if (!getAllPolicy) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
          page: 0,
          limit: 0
        }
      }

      // --- Count total matching records for pagination metadata ---
      let getAllCountryCount = await this.prisma.policy.count({
        where: {
          status: 'ACTIVE',
          categoryName: {
            contains: searchTERM,
            mode: 'insensitive'
          },
          parentId: null
        }
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: getAllPolicy,
        totalCount: getAllCountryCount
      }
    } catch (error) {
      return {
        status: false,
        message: 'error, in getAllPolicy',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Return all root-level (main) active policies without pagination.
   *
   * @idea
   *   Provides a lightweight list of top-level policy categories suitable for
   *   dropdowns, navigation menus, or any UI that needs the full set without
   *   paging. Children are NOT included in the result.
   *
   * @usage
   *   getAllMainPolicy()
   *
   * @dataflow
   *   this.prisma.policy.findMany (status ACTIVE, parentId null) -> response
   *
   * @depends
   *   - this.prisma.policy.findMany
   *
   * @notes
   *   - No search, sort, or pagination parameters.
   *   - totalCount is derived from the array length of the returned records
   *     rather than a separate count query.
   */
  async getAllMainPolicy() {
    try {
      // --- Fetch all active root-level policies (no children included) ---
      let getAllMainPolicy = await this.prisma.policy.findMany({
        where: {
          status: 'ACTIVE',
          parentId: null
        },
      });

      // --- Handle empty result ---
      if (!getAllMainPolicy) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
          page: 0,
          limit: 0
        }
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllMainPolicy,
        totalCount: getAllMainPolicy.length
      }
    } catch (error) {
      return {
        status: false,
        message: 'error, in getAllMainPolicy',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Update an existing policy's editable fields (ruleName, rule, categoryName).
   *
   * @idea
   *   Accepts the target record's ID (`policyId`) alongside the fields to
   *   overwrite.  Uses Prisma's `update` which will throw if the record is
   *   not found, caught by the outer try/catch.
   *
   * @usage
   *   updatePolicy({ policyId: 42, ruleName: "Updated Name", rule: "<json>", categoryName: "Tax" })
   *
   * @dataflow
   *   payload -> this.prisma.policy.update (by id) -> updated record -> response
   *
   * @depends
   *   - this.prisma.policy.update
   *
   * @notes
   *   - All three fields (ruleName, rule, categoryName) are passed to the
   *     update data object; if any are undefined they will be set to
   *     undefined in Prisma which leaves the column unchanged.
   *   - The updated record is returned in the response `data` field.
   */
  async updatePolicy(payload: any) {
    try {
      let updatePolicy = await this.prisma.policy.update({
        where: {
          id: payload.policyId
        },
        data: {
          ruleName: payload.ruleName,
          rule: payload.rule,
          categoryName: payload.categoryName,
        }
      });

      return {
        status: true,
        message: 'Updated Successfully',
        data: updatePolicy
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error in updatePolicy',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Retrieve a single policy by its ID, including all active child
   *   sub-policies.
   *
   * @idea
   *   Used for detail / edit views where the full policy tree (one level
   *   deep) is needed.  Returns a 404-style response when no matching
   *   record is found.
   *
   * @usage
   *   getOnePolicy(42)   // policyId can arrive as string from query params
   *
   * @dataflow
   *   policyId (string|number) -> parseInt -> this.prisma.policy.findUnique (include children) -> response
   *
   * @depends
   *   - this.prisma.policy.findUnique
   *
   * @notes
   *   - `policyId` is parsed to an integer to handle string query-param input.
   *   - Only ACTIVE children are included via the `where` filter on the
   *     `children` relation.
   */
  async getOnePolicy(policyId: any) {
    try {
      let policyID = parseInt(policyId)

      let getPolicy = await this.prisma.policy.findUnique({
        where: {
          id: policyID
        },
        include: {
          children: {
            where: {
              status: "ACTIVE"
            }
          }
        },
      });

      if (!getPolicy) {
        return {
          status: false,
          message: 'Policy Not Found'
        }
      }

      return {
        status: true,
        message: 'Policy Found',
        data: getPolicy
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error in getOnePolicy',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Soft-delete a policy by setting its status to "DELETE" and recording
   *   the deletion timestamp, rather than physically removing the row.
   *
   * @idea
   *   Preserves the record for auditing and potential recovery.  The policy
   *   will no longer appear in active queries because all list endpoints
   *   filter by status === 'ACTIVE'.
   *
   * @usage
   *   deletePolicy(42)   // policyId can arrive as string from route param
   *
   * @dataflow
   *   policyId -> parseInt -> this.prisma.policy.findUnique (existence check)
   *            -> this.prisma.policy.update (set status + deletedAt) -> response
   *
   * @depends
   *   - this.prisma.policy.findUnique
   *   - this.prisma.policy.update
   *
   * @notes
   *   - Does NOT cascade to children; child sub-policies remain active
   *     unless individually deleted.
   *   - `deletedAt` is set to `new Date()` (server time at invocation).
   *   - If the policy is already soft-deleted, this method will still
   *     overwrite status and deletedAt again (no idempotency guard).
   */
  async deletePolicy(policyId: any) {
    try {
      // Parse policyId as an integer
      const policyID = parseInt(policyId);

      // Check if the policy exists
      const policy = await this.prisma.policy.findUnique({
        where: { id: policyID },
      });

      if (!policy) {
        return {
          status: false,
          message: 'Policy not found',
        };
      }

      // Update the policy to mark it as deleted by setting deletedAt to current date
      await this.prisma.policy.update({
        where: { id: policyID },
        data: {
          deletedAt: new Date(),
          status: "DELETE"
        },
      });

      return {
        status: true,
        message: 'Deleted Successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in deletePolicy',
        error: getErrorMessage(error),
      };
    }
  }
}
