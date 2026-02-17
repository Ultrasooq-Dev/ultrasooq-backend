/**
 * @file fees.service.ts
 *
 * @intent
 *   Business-logic layer for the Fees module.  Contains every CRUD operation
 *   for platform fee configurations, including cascading creates, updates,
 *   and hard-deletes across the multi-table fee data model.
 *
 * @idea
 *   Each fee record (Fees) is tied to a marketplace menu (menuId, unique).
 *   Underneath, it holds one or more vendor/consumer detail pairs linked via
 *   the FeesToFeesDetail junction table.  Each detail row can optionally
 *   reference a FeesLocation (country/state/city/town) when the fee is
 *   "non-global."  This service orchestrates the multi-step Prisma
 *   transactions required to keep the entire graph consistent.
 *
 * @usage
 *   Injected into FeesController.  All public methods return a uniform
 *   response envelope: { status: boolean, message: string, data?, error? }.
 *
 * @dataflow
 *   Controller --> FeesService --> PrismaClient --> PostgreSQL
 *
 * @depends
 *   - PrismaClient (module-scoped singleton) -- database access
 *
 * @notes
 *   - PrismaClient is instantiated at module scope (not injected via DI).
 *   - Significant blocks of commented-out code preserve a previous
 *     location-hierarchy model (FeesCountry / FeesState / FeesCity /
 *     FeesTown) and a legacy soft-delete approach.
 *   - deleteLocationFees, deleteLocationByType, addCategoryToFees, and
 *     deleteCategoryToFees are marked "not in use" but remain for
 *     backward compatibility or future re-activation.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';


@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @intent
   *   Create a complete fee configuration: main Fees record, one or more
   *   vendor/consumer FeesDetail pairs with optional FeesLocation records,
   *   and the FeesToFeesDetail junction rows that bind them together.
   *
   * @idea
   *   The caller supplies the full fee tree in a single payload.  The
   *   method validates, creates the parent, then iterates feesDetails to
   *   build each vendor+consumer pair atomically (location first if
   *   non-global, then detail, then junction row).
   *
   * @usage
   *   Called from FeesController.createFees (POST /fees/createFees).
   *   payload shape:
   *     { feeName, feeDescription, policy, feeType, menuId,
   *       feesDetails: [{ vendorDetails: {...}, customerDetails: {...} }] }
   *
   * @dataflow
   *   1. Validate required fields (feeName, feesDetails).
   *   2. Enforce unique menuId across all Fees rows.
   *   3. this.prisma.fees.create  -->  parent Fees row.
   *   4. For each feesDetails entry:
   *      a. If vendor is non-global  -->  this.prisma.feesLocation.create (VENDOR).
   *      b. this.prisma.feesDetail.create (VENDOR).
   *      c. If consumer is non-global  -->  this.prisma.feesLocation.create (CONSUMER).
   *      d. this.prisma.feesDetail.create (CONSUMER).
   *      e. this.prisma.feesToFeesDetail.create (junction linking vendor + consumer).
   *   5. Return created Fees record.
   *
   * @depends  PrismaClient (fees, feesLocation, feesDetail, feesToFeesDetail)
   *
   * @notes
   *   - feeType defaults to 'NONGLOBAL' when not provided.
   *   - No database transaction wrapper -- each insert is independent.
   *   - The success message says "Fetched Successfully" (legacy wording).
   */
  async createFees(payload: any) {
    try {
      const { feeName, feeDescription, policy, feesDetails, feeType, menuId } = payload;

      // Step 1: Validate required fields
      if (!feeName || !feesDetails?.length) {
        return {
          status: false,
          message: "feeName and feesDetails are required.",
          data: [],
        };
      }

      const menuIdExist = await this.prisma.fees.findFirst({
        where: { menuId: menuId }
      });
      if (menuIdExist) {
        return {
          status: false,
          message: "Fees already assigned with the Menu.",
          data: [],
        };
      }

      // Step 2: Create the main fee record
      const fee = await this.prisma.fees.create({
        data: {
          feeName,
          feeDescription,
          policyId: policy || null,
          feeType: feeType || 'NONGLOBAL',
          menuId: menuId
        },
      });

      // Step 3: Process each feeDetail (vendor and consumer)
      for (const detail of feesDetails) {
        const { vendorDetails, customerDetails } = detail;

        // Step 3.1: Create vendor fee detail
        let vendorLocationId = null;
        if (!vendorDetails.isGlobal) {
          const vendorLocation = await this.prisma.feesLocation.create({
            data: {
              feeId: fee.id,
              feeLocationType: 'VENDOR',
              countryId: vendorDetails.location.countryId,
              stateId: vendorDetails.location.stateId,
              cityId: vendorDetails.location.cityId,
              town: vendorDetails.location.town,
            },
          });
          vendorLocationId = vendorLocation.id;
        }

        let vendorDetail = await this.prisma.feesDetail.create({
          data: {
            feeId: fee.id,
            feesType: "VENDOR",
            vendorPercentage: vendorDetails.vendorPercentage,
            vendorMaxCapPerDeal: vendorDetails.vendorMaxCapPerDeal,
            vendorVat: vendorDetails.vendorVat,
            vendorPaymentGateFee: vendorDetails.vendorPaymentGateFee,
            vendorFixFee: vendorDetails.vendorFixFee,
            vendorMaxCapPerMonth: vendorDetails.vendorMaxCapPerMonth,
            isVendorGlobal: vendorDetails.isGlobal,
            vendorLocationId,
          },
        });

        // Step 3.2: Create consumer fee detail
        let consumerLocationId = null;
        if (!customerDetails.isGlobal) {
          const consumerLocation = await this.prisma.feesLocation.create({
            data: {
              feeId: fee.id,
              feeLocationType: 'CONSUMER',
              countryId: customerDetails.location.countryId,
              stateId: customerDetails.location.stateId,
              cityId: customerDetails.location.cityId,
              town: customerDetails.location.town,
            },
          });
          consumerLocationId = consumerLocation.id;
        }

        let consumerDetail = await this.prisma.feesDetail.create({
          data: {
            feeId: fee.id,
            feesType: "CONSUMER",
            consumerPercentage: customerDetails.consumerPercentage,
            consumerMaxCapPerDeal: customerDetails.consumerMaxCapPerDeal,
            consumerVat: customerDetails.consumerVat,
            consumerPaymentGateFee: customerDetails.consumerPaymentGateFee,
            consumerFixFee: customerDetails.consumerFixFee,
            consumerMaxCapPerMonth: customerDetails.consumerMaxCapPerMonth,
            isConsumerGlobal: customerDetails.isGlobal,
            consumerLocationId,
          },
        });

        await this.prisma.feesToFeesDetail.create({
          data: {
            feeId: fee.id,
            vendorDetailId: vendorDetail.id,
            consumerDetailId: consumerDetail.id
          }
        })
      }

      // Step 4: Respond with success
      return {
        status: true,
        message: 'Fetched Successfully',
        data: fee,
      }

    } catch (error) {
      return {
        status: false,
        message: 'Error in createFees',
        error: getErrorMessage(error)
      }
    }
  };


  /**
   * @intent
   *   Retrieve a paginated list of all ACTIVE fees with deeply nested
   *   vendor/consumer details and their location data.
   *
   * @idea
   *   Powers the admin dashboard fee listing.  Supports keyword search on
   *   feeName (case-insensitive, minimum 3 chars) and cursor-less
   *   offset-based pagination.
   *
   * @usage
   *   Called from FeesController.getAllFees (GET /fees/getAllFees).
   *   Query params: page (default 1), limit (default 10), sort (unused --
   *   hardcoded to 'desc'), searchTerm.
   *
   * @dataflow
   *   1. Parse pagination parameters; sanitise searchTerm.
   *   2. this.prisma.fees.findMany with nested includes:
   *        fees_policy
   *        feesToFeesDetail -> vendorDetail -> vendorLocation (country/state/city)
   *                        -> consumerDetail -> consumerLocation (country/state/city)
   *   3. this.prisma.fees.count for totalCount.
   *   4. Return { data, totalCount }.
   *
   * @depends  PrismaClient (fees, feesToFeesDetail, feesDetail, feesLocation)
   *
   * @notes
   *   - The `sort` query param is accepted but not used; sort order is
   *     always 'desc' on createdAt.
   *   - Only records with status === 'ACTIVE' are returned at every
   *     nesting level.
   *   - Commented-out code shows the previous FeesCountry/FeesState/FeesCity
   *     hierarchy includes.
   */
  async getAllFees(req: any, page: any, limit: any, sort: any, searchTerm: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;
      const sortType = 'desc';
      let searchTERM = searchTerm?.length > 2 ? searchTerm : ''

      let getAllFees = await this.prisma.fees.findMany({
        where: {
          status: 'ACTIVE',
          feeName: {
            contains: searchTERM,
            mode: 'insensitive'
          },
        },
        include: {
          fees_policy: {
            where: { status: "ACTIVE" },
          },
          feesToFeesDetail: {
            where: { status: "ACTIVE" },
            include: {
              vendorDetail: {
                where: { status: "ACTIVE" },
                include: {
                  vendorLocation: {
                    where: { status: "ACTIVE" },
                    include: {
                      feesLocation_country: true,
                      feesLocation_state: true,
                      feesLocation_city: true,
                    }
                  }
                }
              },
              consumerDetail: {
                where: { status: "ACTIVE" },
                include: {
                  consumerLocation: {
                    where: { status: "ACTIVE" },
                    include: {
                      feesLocation_country: true,
                      feesLocation_state: true,
                      feesLocation_city: true,
                    }
                  }
                }
              },

            }
          }
          // fees_feesCountry: {
          //   where: { status: "ACTIVE" },
          //   include: {
          //     feesCountry_country: true,
          //     feesCountry_feesState: {
          //       where: { status: "ACTIVE" },
          //       include: {
          //         feesState_state: true,
          //         feesState_feesCity: {
          //           where: { status: "ACTIVE" },
          //           include: {
          //             feesCity_city: true,
          //             feesCity_feesTown: {
          //               where: { status: "ACTIVE" },
          //             }
          //           }
          //         }
          //       }
          //     }
          //   }
          // }
        },
        orderBy: { createdAt: sortType },
        skip, // Offset
        take: pageSize, // Limit
      });

      if (!getAllFees || getAllFees.length === 0) {
        return {
          status: false,
          message: 'No Fees Found',
          data: [],
          totalCount: 0
        }
      }

      let getAllCountryCount = await this.prisma.fees.count({
        where: {
          status: 'ACTIVE',
          feeName: {
            contains: searchTERM,
            mode: 'insensitive'
          }
        },
      });

      return {
        status: true,
        message: 'Fetched Successfully',
        data: getAllFees,
        totalCount: getAllCountryCount
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllFees',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Update an existing fee record and all of its nested vendor/consumer
   *   detail rows and location rows.
   *
   * @idea
   *   Full-tree update: the caller sends the complete fee state (parent
   *   fields + all detail entries) and the method overwrites every
   *   corresponding database row.  Existing detail IDs
   *   (vendorFeesDetailId / consumerFeesDetailId) identify which rows to
   *   update.
   *
   * @usage
   *   Called from FeesController.updateFees (PATCH /fees/updateFees).
   *   payload shape:
   *     { feeId, feeName, feeDescription, policy, feeType, menuId,
   *       feesDetails: [{ vendorDetails: {...}, customerDetails: {...} }] }
   *
   * @dataflow
   *   1. Validate feeId is present.
   *   2. Enforce unique menuId (excluding current fee).
   *   3. this.prisma.fees.update  -->  parent Fees row.
   *   4. For each feesDetails entry:
   *      a. If vendor is non-global and has location --> this.prisma.feesLocation.update.
   *      b. this.prisma.feesDetail.update (vendor).
   *      c. If consumer is non-global and has location --> this.prisma.feesLocation.update.
   *      d. this.prisma.feesDetail.update (consumer).
   *   5. Return updated Fees record.
   *
   * @depends  PrismaClient (fees, feesDetail, feesLocation)
   *
   * @notes
   *   - When a detail switches from non-global to global, vendorLocationId /
   *     consumerLocationId is set to null but the orphaned FeesLocation row
   *     is NOT deleted.
   *   - Details without an existing vendorFeesDetailId / consumerFeesDetailId
   *     are silently skipped (no upsert).
   */
  async updateFees(payload: any) {
    try {
      const { feeId, feeName, feeDescription, policy, feesDetails, feeType, menuId } = payload;

      // Step 1: Validate required fields
      if (!feeId) {
        return {
          status: false,
          message: "feeId is required.",
        };
      }

      const menuIdExist = await this.prisma.fees.findFirst({
        where: { 
          menuId: menuId,
          id: { notIn: [feeId] }
        }
      });
      if (menuIdExist) {
        return {
          status: false,
          message: "Fees already assigned with the Menu",
          data: [],
        };
      }

      // Step 2: Update the main fee record
      const updatedFee = await this.prisma.fees.update({
        where: {
          id: feeId,
        },
        data: {
          feeName: feeName,
          feeDescription: feeDescription,
          policyId: policy,
          feeType: feeType,
          menuId: menuId
        },
      });

      // Step 3: Process and update feeDetails (vendor and consumer)
      for (const detail of feesDetails) {
        const { vendorDetails, customerDetails } = detail;

        // Step 3.1: Update vendor fee details and location
        if (vendorDetails.vendorFeesDetailId) {
          if (!vendorDetails.isGlobal && vendorDetails.location) {
            await this.prisma.feesLocation.update({
              where: { id: vendorDetails.location.vendorLocationId },
              data: {
                countryId: vendorDetails.location.countryId,
                stateId: vendorDetails.location.stateId,
                cityId: vendorDetails.location.cityId,
                town: vendorDetails.location.town,
              },
            });
          }

          await this.prisma.feesDetail.update({
            where: { id: vendorDetails.vendorFeesDetailId },
            data: {
              feesType: "vendor",
              vendorPercentage: vendorDetails.vendorPercentage,
              vendorMaxCapPerDeal: vendorDetails.vendorMaxCapPerDeal,
              vendorVat: vendorDetails.vendorVat,
              vendorPaymentGateFee: vendorDetails.vendorPaymentGateFee,
              vendorFixFee: vendorDetails.vendorFixFee,
              vendorMaxCapPerMonth: vendorDetails.vendorMaxCapPerMonth,
              isVendorGlobal: vendorDetails.isGlobal,
              vendorLocationId: vendorDetails.isGlobal ? null : vendorDetails.location.vendorLocationId,
            },
          });
        }

        // Step 3.2: Update consumer fee details and location
        if (customerDetails.consumerFeesDetailId) {
          if (!customerDetails.isGlobal && customerDetails.location) {
            await this.prisma.feesLocation.update({
              where: { id: customerDetails.location.consumerLocationId },
              data: {
                countryId: customerDetails.location.countryId,
                stateId: customerDetails.location.stateId,
                cityId: customerDetails.location.cityId,
                town: customerDetails.location.town,
              },
            });
          }

          await this.prisma.feesDetail.update({
            where: { id: customerDetails.consumerFeesDetailId },
            data: {
              feesType: "consumer",
              consumerPercentage: customerDetails.consumerPercentage,
              consumerMaxCapPerDeal: customerDetails.consumerMaxCapPerDeal,
              consumerVat: customerDetails.consumerVat,
              consumerPaymentGateFee: customerDetails.consumerPaymentGateFee,
              consumerFixFee: customerDetails.consumerFixFee,
              consumerMaxCapPerMonth: customerDetails.consumerMaxCapPerMonth,
              isConsumerGlobal: customerDetails.isGlobal,
              consumerLocationId: customerDetails.isGlobal ? null : customerDetails.location.consumerLocationId,
            },
          });
        }
      }

      return {
        status: true,
        message: "Fee updated successfully.",
        data: updatedFee,
      };
    } catch (error) {
      return {
        status: false,
        message: "Error in updateFees",
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Partially update a single FeesDetail record, allowing the caller to
   *   change vendor fields, consumer fields, or both without touching
   *   the parent Fees row.
   *
   * @idea
   *   Builds a dynamic update object from the provided vendor/consumer
   *   sub-objects.  Only non-falsy fields are included (using
   *   `|| undefined` to omit zero/null values from the Prisma update).
   *
   * @usage
   *   Called from FeesController.updateFeesDetail (PATCH /fees/updateFeesDetail).
   *   payload shape:
   *     { feesDetailId, vendorDetails?: {...}, customerDetails?: {...} }
   *
   * @dataflow
   *   1. Validate feesDetailId is present.
   *   2. Merge vendorDetails fields into updateData (if provided).
   *   3. Merge customerDetails fields into updateData (if provided).
   *   4. this.prisma.feesDetail.update with the assembled updateData.
   *   5. Return the updated record.
   *
   * @depends  PrismaClient (feesDetail)
   *
   * @notes
   *   - Location objects (vendorLocation / consumerLocation) are added to
   *     updateData but Prisma will NOT create/update a related
   *     FeesLocation row via a plain object -- this appears to be
   *     an incomplete implementation.
   *   - Uses `|| undefined` coercion: falsy values (0, "", false) are
   *     treated the same as missing, which may be intentional to avoid
   *     clearing numeric fields to zero.
   */
  async updateFeesDetail(payload: any) {
    try {
      const { feesDetailId, vendorDetails, customerDetails } = payload;

      // Step 1: Validate required fields
      if (!feesDetailId) {
        return {
          status: false,
          message: "feesDetailId is required.",
        };
      }

      // Step 2: Prepare the data to update
      const updateData: any = {};

      if (vendorDetails) {
        updateData.vendorPercentage = vendorDetails.vendorPercentage || undefined;
        updateData.vendorMaxCapPerDeal = vendorDetails.vendorMaxCapPerDeal || undefined;
        updateData.vendorVat = vendorDetails.vendorVat || undefined;
        updateData.vendorPaymentGateFee = vendorDetails.vendorPaymentGateFee || undefined;
        updateData.vendorFixFee = vendorDetails.vendorFixFee || undefined;
        updateData.vendorMaxCapPerMonth = vendorDetails.vendorMaxCapPerMonth || undefined;
        updateData.isGlobalVendor = vendorDetails.isGlobal || undefined;

        if (!vendorDetails.isGlobal && vendorDetails.location) {
          updateData.vendorLocation = {
            countryId: vendorDetails.location.countryId || undefined,
            stateId: vendorDetails.location.stateId || undefined,
            cityId: vendorDetails.location.cityId || undefined,
            town: vendorDetails.location.town || undefined,
          };
        }
      }

      if (customerDetails) {
        updateData.consumerPercentage = customerDetails.consumerPercentage || undefined;
        updateData.consumerMaxCapPerDeal = customerDetails.consumerMaxCapPerDeal || undefined;
        updateData.consumerVat = customerDetails.consumerVat || undefined;
        updateData.consumerPaymentGateFee = customerDetails.consumerPaymentGateFee || undefined;
        updateData.consumerFixFee = customerDetails.consumerFixFee || undefined;
        updateData.consumerMaxCapPerMonth = customerDetails.consumerMaxCapPerMonth || undefined;
        updateData.isGlobalConsumer = customerDetails.isGlobal || undefined;

        if (!customerDetails.isGlobal && customerDetails.location) {
          updateData.consumerLocation = {
            countryId: customerDetails.location.countryId || undefined,
            stateId: customerDetails.location.stateId || undefined,
            cityId: customerDetails.location.cityId || undefined,
            town: customerDetails.location.town || undefined,
          };
        }
      }

      // Step 3: Update the feesDetail record
      const updatedFeesDetail = await this.prisma.feesDetail.update({
        where: {
          id: feesDetailId,
        },
        data: updateData,
      });

      // Step 4: Return success response
      return {
        status: true,
        message: "FeesDetail updated successfully.",
        data: updatedFeesDetail,
      };
    } catch (error) {
      // Step 5: Handle errors
      return {
        status: false,
        message: "Error in updateFeesDetail",
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Fetch a single fee by its primary key with all nested details,
   *   locations, linked categories, and policy.
   *
   * @idea
   *   Detail-view query for the admin fee editor.  Returns the complete
   *   fee graph in one response so the front-end can populate the full
   *   edit form without additional API calls.
   *
   * @usage
   *   Called from FeesController.getOneFees (GET /fees/getOneFees?feeId=42).
   *
   * @dataflow
   *   1. Parse feeId to integer.
   *   2. this.prisma.fees.findUnique with includes:
   *        fees_feesCategoryConnectTo -> categoryDetail
   *        fees_policy
   *        feesToFeesDetail -> vendorDetail -> vendorLocation (country/state/city)
   *                        -> consumerDetail -> consumerLocation (country/state/city)
   *   3. Return { data: fee } or "Not Found".
   *
   * @depends  PrismaClient (fees + nested relations)
   *
   * @notes
   *   - Unlike getAllFees, this includes fees_feesCategoryConnectTo
   *     with categoryDetail for the category mapping UI.
   *   - Commented-out code shows the former FeesCountry/FeesState/
   *     FeesCity/FeesTown includes.
   */
  async getOneFees(feeId: any) {
    try {
      let feeID = parseInt(feeId);

      let getOneFees = await this.prisma.fees.findUnique({
        where: {
          status: "ACTIVE",
          id: feeID
        },
        include: {
          // fees_feesCountry: {
          //   where: { status: "ACTIVE" },
          //   include: {
          //     feesCountry_country: true,
          //     feesCountry_feesState: {
          //       where: { status: "ACTIVE" },
          //       include: {
          //         feesState_state: true,
          //         feesState_feesCity: {
          //           where: { status: "ACTIVE" },
          //           include: {
          //             feesCity_city: true,
          //             feesCity_feesTown: {
          //               where: { status: "ACTIVE" },
          //             }
          //           }
          //         }
          //       }
          //     }
          //   }
          // }
          fees_feesCategoryConnectTo: {
            include: {
              categoryDetail: {
                where: { status: "ACTIVE" },
              }
            }
          },
          fees_policy: {
            where: { status: "ACTIVE" },
          },
          feesToFeesDetail: {
            where: { status: "ACTIVE" },
            include: {
              vendorDetail: {
                where: { status: "ACTIVE" },
                include: {
                  vendorLocation: {
                    where: { status: "ACTIVE" },
                    include: {
                      feesLocation_country: true,
                      feesLocation_state: true,
                      feesLocation_city: true,
                    }
                  }
                }
              },
              consumerDetail: {
                where: { status: "ACTIVE" },
                include: {
                  consumerLocation: {
                    where: { status: "ACTIVE" },
                    include: {
                      feesLocation_country: true,
                      feesLocation_state: true,
                      feesLocation_city: true,
                    }
                  }
                }
              },

            }
          }
        }
      })

      if (!getOneFees) {
        return {
          status: false,
          message: "Not Found",
          data: []
        }
      }

      return {
        status: true,
        message: "Fetch Successfully",
        data: getOneFees
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error in getOneFees',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Hard-delete a fee and every related record: FeesLocation rows,
   *   FeesToFeesDetail junction rows, FeesDetail rows, and finally the
   *   parent Fees row itself.
   *
   * @idea
   *   Cascading manual delete.  Because foreign-key ON DELETE CASCADE is
   *   not configured in the schema, the service must walk the dependency
   *   graph bottom-up and remove child rows before the parent.
   *
   * @usage
   *   Called from FeesController.deleteFees (DELETE /fees/deleteFees/:feeId).
   *
   * @dataflow
   *   1. Parse feeId.
   *   2. this.prisma.feesDetail.findMany  -->  collect all detail rows for feeId.
   *   3. For each detail: delete vendorLocation and consumerLocation
   *      FeesLocation rows (if they exist).
   *   4. this.prisma.feesToFeesDetail.deleteMany  -->  junction rows.
   *   5. this.prisma.feesDetail.deleteMany  -->  detail rows.
   *   6. this.prisma.fees.delete  -->  parent fee row.
   *   7. Return success.
   *
   * @depends  PrismaClient (feesDetail, feesLocation, feesToFeesDetail, fees)
   *
   * @notes
   *   - Irreversible hard delete.  A commented-out soft-delete variant
   *     (status = "DELETE") exists below this method.
   *   - No transaction wrapper: if a mid-chain delete fails, earlier
   *     deletes are NOT rolled back.
   */
  async deleteFees(feeId: any) {
    try {

      const feeID = parseInt(feeId);
      // First, find all related FeesDetail records for the given feeId
      const feeDetails = await this.prisma.feesDetail.findMany({
        where: {
          feeId: feeID,
        },
      });

      // If there are related FeesDetail records
      if (feeDetails.length > 0) {
        // Loop through the feeDetails and delete the related FeesLocation records
        for (const detail of feeDetails) {
          // Delete the vendorLocation if it exists
          if (detail.vendorLocationId) {
            await this.prisma.feesLocation.delete({
              where: {
                id: detail.vendorLocationId,
              },
            });
          }

          // Delete the consumerLocation if it exists
          if (detail.consumerLocationId) {
            await this.prisma.feesLocation.delete({
              where: {
                id: detail.consumerLocationId,
              },
            });
          }
        }

        // Delete all FeesToFeesDetail records for the given feeId
        await this.prisma.feesToFeesDetail.deleteMany({
          where: {
            feeId: feeID
          }
        })

        // Delete all FeesDetail records for the given feeId
        await this.prisma.feesDetail.deleteMany({
          where: {
            feeId: feeID,
          },
        });
      }

      // Finally, delete the main Fees record
      await this.prisma.fees.delete({
        where: {
          id: feeID,
        },
      });

      return {
        status: true,
        message: 'Fees and related details have been successfully deleted.',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in deleting fees and related details.',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Delete a single FeesToFeesDetail junction row and its associated
   *   vendor detail, consumer detail, and their respective location records.
   *
   * @idea
   *   Removes one vendor+consumer detail pair from a fee.  Walks the
   *   relation graph:  location -> detail -> junction, deleting in
   *   dependency order.  Skips location deletion for global details
   *   (no FeesLocation row exists when isVendorGlobal / isConsumerGlobal
   *   is true).
   *
   * @usage
   *   Called from FeesController.deleteLocation
   *   (DELETE /fees/deleteLocation/:id).
   *   :id is the FeesToFeesDetail primary key.
   *
   * @dataflow
   *   1. Parse id.
   *   2. this.prisma.feesToFeesDetail.findUnique with vendor/consumer includes.
   *   3. If vendorDetail exists:
   *      a. Delete vendorLocation (unless global).
   *      b. Delete vendorDetail.
   *   4. If consumerDetail exists:
   *      a. Delete consumerLocation (unless global).
   *      b. Delete consumerDetail.
   *   5. Delete the FeesToFeesDetail junction row.
   *   6. Return success.
   *
   * @depends  PrismaClient (feesToFeesDetail, feesDetail, feesLocation)
   *
   * @notes
   *   - Hard delete, not soft-delete.
   *   - Returns "not found" if the junction row ID does not exist.
   */
  async deleteLocation(id: any) {
    try {
      let ID = parseInt(id);

      // Step 1: Fetch the FeesToFeesDetail record by ID
      const feesToFeesDetail = await this.prisma.feesToFeesDetail.findUnique({
        where: { id: ID },
        include: {
          vendorDetail: { include: { vendorLocation: true } },
          consumerDetail: { include: { consumerLocation: true } },
        },
      });

      if (!feesToFeesDetail) {
        return {
          status: false,
          message: `FeesToFeesDetail with ID ${ID} not found.`,
          data: [],
        };
      }

      // Step 2: Handle deletion for vendorDetail and its location
      if (feesToFeesDetail.vendorDetail) {
        const vendorDetailId = feesToFeesDetail.vendorDetailId;

        // Check if isVendorGlobal is false (if global, skip deleting location)
        if (!feesToFeesDetail.vendorDetail.isVendorGlobal && feesToFeesDetail.vendorDetail.vendorLocationId) {
          // Delete vendorLocation if it exists
          await this.prisma.feesLocation.delete({
            where: { id: feesToFeesDetail.vendorDetail.vendorLocationId },
          });
        }

        // Delete vendorDetail
        await this.prisma.feesDetail.delete({
          where: { id: vendorDetailId },
        });
      }

      // Step 3: Handle deletion for consumerDetail and its location
      if (feesToFeesDetail.consumerDetail) {
        const consumerDetailId = feesToFeesDetail.consumerDetailId;

        // Check if isConsumerGlobal is false (if global, skip deleting location)
        if (!feesToFeesDetail.consumerDetail.isConsumerGlobal && feesToFeesDetail.consumerDetail.consumerLocationId) {
          // Delete consumerLocation if it exists
          await this.prisma.feesLocation.delete({
            where: { id: feesToFeesDetail.consumerDetail.consumerLocationId },
          });
        }

        // Delete consumerDetail
        await this.prisma.feesDetail.delete({
          where: { id: consumerDetailId },
        });
      }

      // Step 4: Delete the FeesToFeesDetail record itself
      await this.prisma.feesToFeesDetail.delete({
        where: { id: ID },
      });

      return {
        status: true,
        message: "Location fees details successfully deleted.",
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: "Error in deleting location fees details.",
        error: getErrorMessage(error),
      };
    }
  }


  /**
   * @intent
   *   Delete an individual vendor OR consumer FeesDetail record (and its
   *   location + junction row) based on the provided type string.
   *
   * @idea
   *   Unlike deleteLocation (which removes both vendor and consumer as a
   *   pair), this method targets only one side.  It fetches the detail,
   *   deletes the linked location, removes the FeesToFeesDetail junction
   *   row(s) referencing it, and finally deletes the detail itself.
   *
   * @usage
   *   Called from FeesController.deleteLocationFees
   *   (DELETE /fees/deleteLocationFees/:id/:type).
   *   :id is the FeesDetail primary key.
   *   :type is "vendor" or "consumer".
   *
   * @dataflow
   *   Vendor path:
   *     1. this.prisma.feesDetail.findUnique (vendor).
   *     2. Delete vendorLocation if present.
   *     3. this.prisma.feesToFeesDetail.deleteMany where vendorDetailId = id.
   *     4. this.prisma.feesDetail.delete.
   *   Consumer path: mirrors vendor with consumer fields.
   *
   * @depends  PrismaClient (feesDetail, feesLocation, feesToFeesDetail)
   *
   * @notes
   *   - NOT IN USE -- retained for potential future re-activation.
   *   - Returns an error message if type is neither "vendor" nor "consumer".
   */
  // not in use
  async deleteLocationFees(id: any, type: any) {
    try {
      let ID = parseInt(id);

      if (type === "vendor") {
        // Step 1: Fetch the vendor detail by ID
        const vendorDetail = await this.prisma.feesDetail.findUnique({
          where: { id: ID },
          include: { vendorLocation: true, feesDetailVendor: true },
        });

        if (!vendorDetail) {
          return {
            status: false,
            message: `Vendor detail with ID ${ID} not found.`,
            data: [],
          };
        }

        // Step 2: Check and delete associated vendorLocation
        if (vendorDetail.vendorLocationId) {
          await this.prisma.feesLocation.delete({
            where: { id: vendorDetail.vendorLocationId },
          });
        }

        // Step 3: Delete from FeesToFeesDetail
        await this.prisma.feesToFeesDetail.deleteMany({
          where: { vendorDetailId: ID },
        });

        // Step 4: Delete the vendorDetail itself
        await this.prisma.feesDetail.delete({
          where: { id: ID },
        });

        return {
          status: true,
          message: "Vendor detail and associated data successfully deleted.",
          data: [],
        };
      } else if (type === "consumer") {
        // Step 1: Fetch the consumer detail by ID
        const consumerDetail = await this.prisma.feesDetail.findUnique({
          where: { id: ID },
          include: { consumerLocation: true, feesDetailConsumer: true },
        });

        if (!consumerDetail) {
          return {
            status: false,
            message: `Consumer detail with ID ${ID} not found.`,
            data: [],
          };
        }

        // Step 2: Check and delete associated consumerLocation
        if (consumerDetail.consumerLocationId) {
          await this.prisma.feesLocation.delete({
            where: { id: consumerDetail.consumerLocationId },
          });
        }

        // Step 3: Delete from FeesToFeesDetail
        await this.prisma.feesToFeesDetail.deleteMany({
          where: { consumerDetailId: ID },
        });

        // Step 4: Delete the consumerDetail itself
        await this.prisma.feesDetail.delete({
          where: { id: ID },
        });

        return {
          status: true,
          message: "Consumer detail and associated data successfully deleted.",
          data: [],
        };
      } else {
        return {
          status: false,
          message: "Invalid type specified. Use 'vendor' or 'consumer'.",
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: "Error in deleting location fees details.",
        error: getErrorMessage(error),
      };
    }
  }


  /**
   * @intent
   *   Recursively hard-delete a location-hierarchy node and all of its
   *   descendants, walking from COUNTRY down through STATE, CITY, to TOWN.
   *
   * @idea
   *   Legacy method from the previous data model where fees had a four-level
   *   geographic hierarchy (FeesCountry -> FeesState -> FeesCity -> FeesTown).
   *   Given a node ID and its type, it finds all children at the next level,
   *   recursively deletes them, then deletes the current node.
   *
   * @usage
   *   Called from FeesController.deleteLocationByType
   *   (DELETE /fees/deleteLocationByType/:id/:type).
   *   :type is "COUNTRY" | "STATE" | "CITY" | "TOWN".
   *
   * @dataflow
   *   COUNTRY:
   *     1. Find FeesCountry by id.
   *     2. Find all FeesState children -> recurse with type "STATE".
   *     3. Delete FeesCountry.
   *   STATE:
   *     1. Find FeesState by id.
   *     2. Find all FeesCity children -> recurse with type "CITY".
   *     3. Delete FeesState.
   *   CITY:
   *     1. Find FeesCity by id.
   *     2. Find all FeesTown children -> recurse with type "TOWN".
   *     3. Delete FeesCity.
   *   TOWN:
   *     1. Find FeesTown by id -> delete.
   *
   * @depends  PrismaClient (feesCountry, feesState, feesCity, feesTown)
   *
   * @notes
   *   - NOT IN USE -- belongs to the deprecated location-hierarchy model.
   *   - Recursive self-call: this.deleteLocationByType(childId, childType).
   *   - No transaction wrapper; partial deletes are possible on failure.
   */
  // -----------------------------------------------Not in use
  async deleteLocationByType(id: any, type: any) {
    try {
      let ID = parseInt(id);

      if (type === "COUNTRY") {
        // Hard delete FeesCountry
        let feesCountry = await this.prisma.feesCountry.findUnique({
          where: { id: ID },
        });

        if (!feesCountry) {
          return {
            status: false,
            message: "FeesCountry not found",
          };
        }

        // Check and delete associated FeesState
        let feesStates = await this.prisma.feesState.findMany({
          where: { feesCountryId: ID },
        });

        for (let state of feesStates) {
          await this.deleteLocationByType(state.id, "STATE");
        }

        // Hard delete FeesCountry
        await this.prisma.feesCountry.delete({
          where: { id: ID },
        });

        return {
          status: true,
          message: "FeesCountry and its dependencies deleted successfully",
        };
      } else if (type === "STATE") {
        // Hard delete FeesState
        let feesState = await this.prisma.feesState.findUnique({
          where: { id: ID },
        });

        if (!feesState) {
          return {
            status: false,
            message: "FeesState not found",
          };
        }

        // Check and delete associated FeesCity
        let feesCities = await this.prisma.feesCity.findMany({
          where: { feesStateId: ID },
        });

        for (let city of feesCities) {
          await this.deleteLocationByType(city.id, "CITY");
        }

        // Hard delete FeesState
        await this.prisma.feesState.delete({
          where: { id: ID },
        });

        return {
          status: true,
          message: "FeesState and its dependencies deleted successfully",
        };
      } else if (type === "CITY") {
        // Hard delete FeesCity
        let feesCity = await this.prisma.feesCity.findUnique({
          where: { id: ID },
        });

        if (!feesCity) {
          return {
            status: false,
            message: "FeesCity not found",
          };
        }

        // Check and delete associated FeesTown
        let feesTowns = await this.prisma.feesTown.findMany({
          where: { feesCityId: ID },
        });

        for (let town of feesTowns) {
          await this.deleteLocationByType(town.id, "TOWN");
        }

        // Hard delete FeesCity
        await this.prisma.feesCity.delete({
          where: { id: ID },
        });

        return {
          status: true,
          message: "FeesCity and its dependencies deleted successfully",
        };
      } else if (type === "TOWN") {
        // Hard delete FeesTown
        let feesTown = await this.prisma.feesTown.findUnique({
          where: { id: ID },
        });

        if (!feesTown) {
          return {
            status: false,
            message: "FeesTown not found",
          };
        }

        // Hard delete FeesTown
        await this.prisma.feesTown.delete({
          where: { id: ID },
        });

        return {
          status: true,
          message: "FeesTown deleted successfully",
        };
      } else {
        return {
          status: false,
          message: "Invalid type provided",
        };
      }
    } catch (error) {
      return {
        status: false,
        message: "Error in deleteLocationByType",
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Link one or more marketplace categories to an existing fee by
   *   creating FeesCategoryConnectTo junction records.
   *
   * @idea
   *   Iterates the caller-supplied categoryIdList and creates a new
   *   connection row for each category that is not already linked to the
   *   fee (dedup check via findFirst on feeId + categoryId).
   *
   * @usage
   *   Called from FeesController.addCategoryToFees
   *   (POST /fees/addCategoryToFees).
   *   payload shape:
   *     { feeId, categoryIdList: [{ categoryId, categoryLocation }] }
   *
   * @dataflow
   *   1. For each entry in categoryIdList:
   *      a. this.prisma.feesCategoryConnectTo.findFirst  -->  check for existing link.
   *      b. If no duplicate  -->  this.prisma.feesCategoryConnectTo.create.
   *      c. Push new connection to result array.
   *   2. Return all newly created connections (or message if none created).
   *
   * @depends  PrismaClient (feesCategoryConnectTo)
   *
   * @notes
   *   - Marked "not in use" in the controller but the endpoint is still
   *     reachable.
   *   - Duplicate entries are silently skipped (no error returned).
   */
  // not in use
  async addCategoryToFees(payload: any) {
    try {
      let createdConnections = [];
      const feeId = payload.feeId;

      if (payload?.categoryIdList && payload?.categoryIdList.length > 0) {
        for (let i = 0; i < payload.categoryIdList.length; i++) {
          const { categoryId, categoryLocation, } = payload.categoryIdList[i];

          const existingConnection = await this.prisma.feesCategoryConnectTo.findFirst({
            where: {
              feeId: feeId,
              categoryId: categoryId,
            }
          });

          // If no existing connection, create a new one
          if (!existingConnection) {
            const newConnection = await this.prisma.feesCategoryConnectTo.create({
              data: {
                feeId: feeId,
                categoryId: categoryId,
                categoryLocation: categoryLocation,
              }
            });

            // Add the newly created connection to the response array
            createdConnections.push(newConnection);
          }
        }
      }

      return {
        status: true,
        message: 'Process completed successfully',
        data: createdConnections.length > 0 ? createdConnections : 'No new connections created'
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in addCategoryToFees',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   *   Remove a single category-to-fee association by its primary key.
   *
   * @idea
   *   Looks up the FeesCategoryConnectTo row; if it exists, hard-deletes it.
   *   Returns "Not Found" if the ID does not match any record.
   *
   * @usage
   *   Called from FeesController.deleteCategoryToFees
   *   (DELETE /fees/deleteCategoryToFees/:feesCategoryId).
   *
   * @dataflow
   *   1. Parse feesCategoryId to integer.
   *   2. this.prisma.feesCategoryConnectTo.findUnique  -->  existence check.
   *   3. this.prisma.feesCategoryConnectTo.delete  -->  remove the row.
   *   4. Return the deleted record.
   *
   * @depends  PrismaClient (feesCategoryConnectTo)
   *
   * @notes
   *   - Marked "not in use" in the controller but the endpoint is still
   *     reachable.
   *   - Hard delete, not soft-delete.
   */
  // not in use
  async deleteCategoryToFees(feesCategoryId: any) {
    try {
      const feesCategoryID = parseInt(feesCategoryId);

      let exist = await this.prisma.feesCategoryConnectTo.findUnique({
        where: { id: feesCategoryID }
      })

      if (!exist) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      let deleteFeesCategoryConnectTo = await this.prisma.feesCategoryConnectTo.delete({
        where: { id: feesCategoryID }
      });

      return {
        status: true,
        message: 'Deleted Successfully',
        data: deleteFeesCategoryConnectTo
      }
    } catch (error) {
      return {
        status: false,
        message: 'error, in deleteCategoryToFees',
        error: getErrorMessage(error)
      }
    }
  }

}
