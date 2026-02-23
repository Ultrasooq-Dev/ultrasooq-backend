-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderProductType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "ShippingType" AS ENUM ('DIRECTION', 'RANG');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('BOOKING', 'MOVING');

-- CreateEnum
CREATE TYPE "ServiceConfirmType" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ServiceCostType" AS ENUM ('FLAT', 'HOURLY');

-- CreateEnum
CREATE TYPE "ServiceFor" AS ENUM ('OWNER', 'EVERYONE');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETE', 'HIDDEN', 'WAITING', 'WAITING_FOR_SUPER_ADMIN', 'REJECT');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('UPLOADED', 'UPLOADING', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('UNREAD', 'READ', 'DELETED');

-- CreateEnum
CREATE TYPE "RfqProductPriceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "TypeTrader" AS ENUM ('BUYER', 'FREELANCER', 'COMPANY', 'MEMBER', 'ADMINMEMBER');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('ADMIN', 'USER', 'SUBADMIN');

-- CreateEnum
CREATE TYPE "LoginType" AS ENUM ('MANUAL', 'SOCIAL', 'FACEBOOK', 'GOOGLE');

-- CreateEnum
CREATE TYPE "StatusYesNO" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('P', 'R', 'F', 'D');

-- CreateEnum
CREATE TYPE "TypeOfProduct" AS ENUM ('BRAND', 'SPAREPART', 'OWNBRAND');

-- CreateEnum
CREATE TYPE "TypeProduct" AS ENUM ('VENDORLOCAL', 'BRAND');

-- CreateEnum
CREATE TYPE "ConsumerType" AS ENUM ('CONSUMER', 'VENDORS', 'EVERYONE');

-- CreateEnum
CREATE TYPE "SellType" AS ENUM ('NORMALSELL', 'BUYGROUP', 'OTHERS', 'EVERYONE', 'TRIAL_PRODUCT', 'WHOLESALE_PRODUCT');

-- CreateEnum
CREATE TYPE "rFqType" AS ENUM ('P', 'R');

-- CreateEnum
CREATE TYPE "CartType" AS ENUM ('DEFAULT', 'SERVICE');

-- CreateEnum
CREATE TYPE "RFQCartType" AS ENUM ('DEFAULT', 'P', 'R');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DEFAULT', 'SERVICE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OrderProductStatus" AS ENUM ('CANCELLED', 'CONFIRMED', 'SHIPPED', 'OFD', 'DELIVERED', 'RECEIVED', 'PLACED');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BILLING', 'SHIPPING');

-- CreateEnum
CREATE TYPE "EmiStatus" AS ENUM ('STOPPED', 'ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OrderShippingType" AS ENUM ('PICKUP', 'SELLERDROP', 'THIRDPARTY', 'PLATFORM');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'PAYMENT', 'REFUND', 'COMMISSION', 'BONUS', 'FEE');

-- CreateEnum
CREATE TYPE "WalletReferenceType" AS ENUM ('ORDER', 'PAYMENT', 'TRANSFER', 'COMMISSION', 'REFUND', 'BONUS');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BannerPosition" AS ENUM ('MAIN', 'SIDE_TOP', 'SIDE_BOTTOM', 'FULL_WIDTH', 'POPUP');

-- CreateEnum
CREATE TYPE "SpecDataType" AS ENUM ('TEXT', 'NUMBER', 'SELECT', 'MULTI_SELECT', 'BOOLEAN');

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "addedBy" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "cc" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender" DEFAULT 'MALE',
    "otp" INTEGER,
    "otpValidTime" TIMESTAMP(3),
    "password" TEXT,
    "phoneNumber" TEXT,
    "profilePicture" TEXT,
    "resetPassword" INTEGER NOT NULL DEFAULT 0,
    "status" "Status" NOT NULL DEFAULT 'WAITING',
    "tradeRole" "TypeTrader" NOT NULL DEFAULT 'BUYER',
    "uniqueId" TEXT,
    "identityProof" TEXT,
    "onlineOffline" TEXT,
    "onlineOfflineDateStatus" TIMESTAMP(3),
    "identityProofBack" TEXT,
    "userType" "UserType",
    "loginType" "LoginType" NOT NULL DEFAULT 'MANUAL',
    "userName" TEXT,
    "employeeId" TEXT,
    "userRoleId" INTEGER,
    "userRoleName" TEXT,
    "customerId" TEXT,
    "stripeAccountId" TEXT,
    "addedBy" INTEGER,
    "adminRoleId" INTEGER,
    "userTypeCategoryId" INTEGER,
    "isSubAccount" BOOLEAN NOT NULL DEFAULT false,
    "parentUserId" INTEGER,
    "accountName" TEXT,
    "companyAddress" TEXT,
    "companyName" TEXT,
    "companyPhone" TEXT,
    "companyTaxId" TEXT,
    "companyWebsite" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "masterAccountId" INTEGER,
    "statusNote" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedBy" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterAccount" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "cc" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender" DEFAULT 'MALE',
    "profilePicture" TEXT,
    "lastActiveUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "otp" INTEGER,
    "otpValidTime" TIMESTAMP(3),

    CONSTRAINT "MasterAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" SERIAL NOT NULL,
    "userRoleName" TEXT,
    "addedBy" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRolePermission" (
    "id" SERIAL NOT NULL,
    "userRoleId" INTEGER,
    "permissionId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "postCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER,
    "cc" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "cityId" INTEGER,
    "countryId" INTEGER,
    "stateId" INTEGER,
    "town" TEXT,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPhone" (
    "id" SERIAL NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "userId" INTEGER NOT NULL,
    "cc" TEXT,

    CONSTRAINT "UserPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSocialLink" (
    "id" SERIAL NOT NULL,
    "linkType" TEXT,
    "link" TEXT,
    "status" INTEGER DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UserSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" SERIAL NOT NULL,
    "profileType" TEXT NOT NULL,
    "logo" TEXT,
    "companyName" TEXT,
    "aboutUs" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "yearOfEstablishment" INTEGER,
    "totalNoOfEmployee" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "annualPurchasingVolume" TEXT,
    "cc" TEXT,
    "phoneNumber" TEXT,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfileBusinessType" (
    "id" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "userProfileId" INTEGER NOT NULL,
    "businessTypeId" INTEGER NOT NULL,

    CONSTRAINT "UserProfileBusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranch" (
    "id" SERIAL NOT NULL,
    "userProfileId" INTEGER NOT NULL,
    "mainOffice" INTEGER,
    "profileType" TEXT NOT NULL,
    "branchFrontPicture" TEXT,
    "proofOfAddress" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "countryId" INTEGER,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "contactNumber" TEXT,
    "contactName" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "workingDays" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "cc" TEXT,

    CONSTRAINT "UserBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchBusinessType" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "businessTypeId" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userBranchId" INTEGER NOT NULL,

    CONSTRAINT "UserBranchBusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchTags" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userBranchId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "UserBranchTags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchCategory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "userBranchId" INTEGER,
    "categoryId" INTEGER,
    "categoryLocation" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBranchCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBusinessCategory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "categoryId" INTEGER,
    "categoryLocation" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBusinessCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "userRoleId" INTEGER,
    "addedBy" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tags" (
    "id" SERIAL NOT NULL,
    "tagName" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addedBy" INTEGER,

    CONSTRAINT "Tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "menuId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "type" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" INTEGER,
    "blackList" "StatusYesNO" NOT NULL DEFAULT 'NO',
    "whiteList" "StatusYesNO" NOT NULL DEFAULT 'NO',
    "assignTo" INTEGER,
    "icon" TEXT,
    "connectTo" INTEGER,
    "customer" INTEGER,
    "policy" INTEGER,
    "rfq" INTEGER,
    "store" INTEGER,
    "categoryType" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryConnectTo" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER,
    "categoryLocation" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectTo" INTEGER,
    "connectToLocation" TEXT,
    "connectToType" TEXT,

    CONSTRAINT "CategoryConnectTo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fees" (
    "id" SERIAL NOT NULL,
    "feeName" TEXT,
    "feeDescription" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "policyId" INTEGER,
    "feeType" TEXT,
    "menuId" INTEGER,

    CONSTRAINT "Fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesDetail" (
    "id" SERIAL NOT NULL,
    "feeId" INTEGER,
    "feesType" TEXT,
    "isVendorGlobal" BOOLEAN,
    "isConsumerGlobal" BOOLEAN,
    "vendorPercentage" DECIMAL(65,30),
    "vendorMaxCapPerDeal" DECIMAL(65,30),
    "vendorVat" DECIMAL(65,30),
    "vendorPaymentGateFee" DECIMAL(65,30),
    "vendorFixFee" DECIMAL(65,30),
    "vendorMaxCapPerMonth" BOOLEAN,
    "vendorLocationId" INTEGER,
    "consumerPercentage" DECIMAL(65,30),
    "consumerMaxCapPerDeal" DECIMAL(65,30),
    "consumerVat" DECIMAL(65,30),
    "consumerPaymentGateFee" DECIMAL(65,30),
    "consumerFixFee" DECIMAL(65,30),
    "consumerMaxCapPerMonth" BOOLEAN,
    "consumerLocationId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeesDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesToFeesDetail" (
    "id" SERIAL NOT NULL,
    "feeId" INTEGER,
    "vendorDetailId" INTEGER,
    "consumerDetailId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeesToFeesDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesLocation" (
    "id" SERIAL NOT NULL,
    "countryId" INTEGER,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "town" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feeId" INTEGER,
    "feeLocationType" TEXT,

    CONSTRAINT "FeesLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesCountry" (
    "id" SERIAL NOT NULL,
    "feeId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "countryId" INTEGER,

    CONSTRAINT "FeesCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesState" (
    "id" SERIAL NOT NULL,
    "feeId" INTEGER,
    "feesCountryId" INTEGER,
    "stateId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "countryId" INTEGER,

    CONSTRAINT "FeesState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesCity" (
    "id" SERIAL NOT NULL,
    "feeId" INTEGER,
    "feesCountryId" INTEGER,
    "cityId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feesStateId" INTEGER,
    "countryId" INTEGER,
    "stateId" INTEGER,

    CONSTRAINT "FeesCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesTown" (
    "id" SERIAL NOT NULL,
    "feeId" INTEGER,
    "feesCountryId" INTEGER,
    "feesStateId" INTEGER,
    "feesCityId" INTEGER,
    "town" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cityId" INTEGER,
    "countryId" INTEGER,
    "stateId" INTEGER,

    CONSTRAINT "FeesTown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeesCategoryConnectTo" (
    "id" SERIAL NOT NULL,
    "feeId" INTEGER,
    "categoryId" INTEGER,
    "categoryLocation" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "feesCountryId" INTEGER,

    CONSTRAINT "FeesCategoryConnectTo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy" (
    "id" SERIAL NOT NULL,
    "ruleName" TEXT,
    "rule" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryName" TEXT,
    "parentId" INTEGER,

    CONSTRAINT "policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "productName" TEXT NOT NULL,
    "categoryId" INTEGER,
    "skuNo" TEXT NOT NULL,
    "productPrice" DECIMAL(8,2) NOT NULL,
    "offerPrice" DECIMAL(8,2) NOT NULL,
    "description" TEXT,
    "specification" TEXT,
    "status" "Status" NOT NULL DEFAULT 'INACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brandId" INTEGER,
    "placeOfOriginId" INTEGER,
    "adminId" INTEGER,
    "userId" INTEGER,
    "categoryLocation" TEXT,
    "shortDescription" TEXT,
    "productType" "ProductType",
    "barcode" TEXT,
    "typeOfProduct" "TypeOfProduct",
    "typeProduct" "TypeProduct",
    "productViewCount" INTEGER DEFAULT 0,
    "originalProductId" INTEGER,
    "dropshipVendorId" INTEGER,
    "dropshipMarkup" DECIMAL(8,2),
    "originalVendorId" INTEGER,
    "isDropshipped" BOOLEAN NOT NULL DEFAULT false,
    "customMarketingContent" JSONB,
    "additionalMarketingImages" JSONB,
    "isDropshipable" BOOLEAN NOT NULL DEFAULT false,
    "dropshipCommission" DECIMAL(5,2),
    "dropshipMinMarkup" DECIMAL(5,2),
    "dropshipMaxMarkup" DECIMAL(5,2),
    "dropshipSettings" JSONB,
    "scrapMarkup" DECIMAL(10,2),
    "search_vector" tsvector,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "adminId" INTEGER,
    "productPrice" DECIMAL(8,2) NOT NULL,
    "offerPrice" DECIMAL(8,2) NOT NULL,
    "productPriceBarcode" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consumerDiscount" INTEGER,
    "consumerType" "ConsumerType",
    "deliveryAfter" INTEGER,
    "maxQuantity" INTEGER,
    "minQuantity" INTEGER,
    "sellType" "SellType",
    "stock" INTEGER,
    "timeClose" INTEGER,
    "timeOpen" INTEGER,
    "vendorDiscount" INTEGER,
    "productCondition" TEXT,
    "maxCustomer" INTEGER,
    "maxQuantityPerCustomer" INTEGER,
    "minCustomer" INTEGER,
    "minQuantityPerCustomer" INTEGER,
    "askForPrice" TEXT,
    "askForStock" TEXT,
    "askForSell" TEXT,
    "hideAllSelected" BOOLEAN,
    "enableChat" BOOLEAN,
    "consumerDiscountType" TEXT,
    "vendorDiscountType" TEXT,
    "dateClose" TIMESTAMP(3),
    "dateOpen" TIMESTAMP(3),
    "endTime" TEXT,
    "startTime" TEXT,
    "isCustomProduct" TEXT,
    "productCityId" INTEGER,
    "productCountryId" INTEGER,
    "productStateId" INTEGER,
    "productTown" TEXT,
    "productLatLng" TEXT,
    "menuId" INTEGER,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "productPriceId" INTEGER,
    "object" JSONB,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSellCountry" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "productPriceId" INTEGER,
    "countryName" TEXT,
    "countryId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSellCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSellState" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "productPriceId" INTEGER,
    "stateName" TEXT,
    "stateId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSellState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSellCity" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "productPriceId" INTEGER,
    "cityName" TEXT,
    "cityId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSellCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSellerImage" (
    "id" SERIAL NOT NULL,
    "productPriceId" INTEGER,
    "imageName" TEXT,
    "image" TEXT,
    "videoName" TEXT,
    "video" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSellerImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSpecification" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "adminId" INTEGER,
    "specification" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,

    CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductShortDescription" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "adminId" INTEGER,
    "shortDescription" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShortDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTags" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImages" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "image" TEXT,
    "video" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageName" TEXT,
    "videoName" TEXT,
    "variant" JSONB,

    CONSTRAINT "ProductImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerReward" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "adminId" INTEGER,
    "rewardPercentage" DECIMAL(8,2),
    "minimumOrder" INTEGER,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rewardFixAmount" DECIMAL(8,2),
    "stock" INTEGER,

    CONSTRAINT "SellerReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedLink" (
    "id" SERIAL NOT NULL,
    "sellerRewardId" INTEGER,
    "productId" INTEGER,
    "adminId" INTEGER,
    "generatedLink" TEXT,
    "linkGeneratedBy" INTEGER,
    "myTotalSell" INTEGER,
    "ordersPlaced" INTEGER,
    "totalReward" DECIMAL(8,2),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "description" TEXT,
    "rating" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceReview" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "productPriceId" INTEGER,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "description" TEXT,
    "rating" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adminId" INTEGER,

    CONSTRAINT "ProductPriceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductView" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "productId" INTEGER NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSearch" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "searchTerm" TEXT NOT NULL,
    "productId" INTEGER,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductClick" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "productId" INTEGER NOT NULL,
    "clickSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductQuestion" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "question" TEXT,
    "questionByuserId" INTEGER,
    "answer" TEXT,
    "answerByuserId" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "questionType" "QuestionType",
    "serviceId" INTEGER,
    "userAccountId" INTEGER,

    CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductQuestionAnswer" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "productQuestionId" INTEGER,
    "answer" TEXT,
    "answerByuserId" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "questionType" "QuestionType",
    "serviceId" INTEGER,

    CONSTRAINT "ProductQuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDuplicateRfq" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER,
    "userId" INTEGER,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDuplicateRfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDuplicateFactories" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER,
    "userId" INTEGER,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDuplicateFactories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomizeProduct" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER,
    "buyerId" INTEGER,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fromPrice" DECIMAL(8,2),
    "toPrice" DECIMAL(8,2),

    CONSTRAINT "CustomizeProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomizeProductImage" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "customizeProductId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "link" TEXT,
    "linkType" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomizeProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoriesCart" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "customizeProductId" INTEGER,
    "productId" INTEGER,
    "quantity" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactoriesCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoriesRequest" (
    "id" SERIAL NOT NULL,
    "buyerId" INTEGER,
    "sellerId" INTEGER,
    "RequestNo" TEXT,
    "customizeProductId" INTEGER,
    "productId" INTEGER,
    "quantity" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "cc" TEXT,
    "city" TEXT,
    "country" TEXT,
    "factoriesDate" TIMESTAMP(3),
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "postCode" TEXT,
    "province" TEXT,
    "fromPrice" DECIMAL(8,2),
    "toPrice" DECIMAL(8,2),

    CONSTRAINT "FactoriesRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQProduct" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "adminId" INTEGER,
    "userId" INTEGER,
    "type" "rFqType" NOT NULL DEFAULT 'P',
    "productNote" TEXT,
    "rfqProductName" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RFQProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQProductImages" (
    "id" SERIAL NOT NULL,
    "rfqProductId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "imageName" TEXT,
    "image" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RFQProductImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationList" (
    "id" SERIAL NOT NULL,
    "locationName" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" SERIAL NOT NULL,
    "brandName" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addedBy" INTEGER,
    "brandType" TEXT,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryList" (
    "id" SERIAL NOT NULL,
    "countryName" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "productId" INTEGER,
    "quantity" INTEGER,
    "cartType" "CartType" NOT NULL DEFAULT 'DEFAULT',
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productPriceId" INTEGER,
    "sharedLinkId" INTEGER,
    "object" JSONB,
    "serviceId" INTEGER,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartServiceFeature" (
    "id" SERIAL NOT NULL,
    "cartId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serviceFeatureId" INTEGER NOT NULL,
    "bookingDateTime" TIMESTAMP(3),

    CONSTRAINT "CartServiceFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartProductService" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "cartId" INTEGER NOT NULL,
    "cartType" TEXT,
    "relatedCartId" INTEGER,
    "relatedCartType" TEXT,

    CONSTRAINT "CartProductService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQCart" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "rfqProductId" INTEGER,
    "quantity" INTEGER,
    "productType" VARCHAR(10),
    "rfqCartType" "RFQCartType",
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" INTEGER,
    "offerPrice" DECIMAL(8,2),
    "note" TEXT,
    "offerPriceFrom" DECIMAL(8,2),
    "offerPriceTo" DECIMAL(8,2),

    CONSTRAINT "RFQCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "orderNo" TEXT,
    "paymentMethod" TEXT,
    "totalPrice" DECIMAL(10,2),
    "actualPrice" DECIMAL(10,2),
    "deliveryCharge" DECIMAL(10,2),
    "orderStatus" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "orderDate" TIMESTAMP(3),
    "orderType" "OrderType" NOT NULL DEFAULT 'DEFAULT',
    "couponCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "transactionId" INTEGER,
    "walletTransactionId" INTEGER,
    "totalCashbackToCustomer" DECIMAL(10,2),
    "totalCustomerPay" DECIMAL(10,2),
    "totalDiscount" DECIMAL(10,2),
    "totalPlatformFee" DECIMAL(10,2),
    "paymobOrderId" TEXT,
    "paymentType" TEXT,
    "advanceAmount" DECIMAL(10,2),
    "dueAmount" DECIMAL(10,2),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSaveCardToken" (
    "id" SERIAL NOT NULL,
    "paymobOrderId" INTEGER,
    "saveCardObject" JSONB,
    "token" TEXT,
    "orderId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSaveCardToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderShipping" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER,
    "sellerId" INTEGER,
    "orderShippingType" "OrderShippingType" NOT NULL,
    "serviceId" INTEGER,
    "status" TEXT NOT NULL,
    "shippingDate" TIMESTAMP(3),
    "shippingCharge" DECIMAL(10,2),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "receipt" TEXT,
    "fromTime" TIMESTAMP(3),
    "toTime" TIMESTAMP(3),

    CONSTRAINT "OrderShipping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSeller" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER,
    "orderNo" TEXT,
    "sellerOrderNo" TEXT,
    "amount" DECIMAL(10,2),
    "sellerId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purchasedAmount" DECIMAL(10,2),

    CONSTRAINT "OrderSeller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProducts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "orderId" INTEGER,
    "productId" INTEGER,
    "salePrice" DECIMAL(10,2),
    "purchasePrice" DECIMAL(10,2),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "orderProductDate" TIMESTAMP(3),
    "orderProductStatus" "OrderProductStatus" NOT NULL DEFAULT 'PLACED',
    "orderQuantity" INTEGER,
    "sellerId" INTEGER,
    "cancelReason" TEXT,
    "orderNo" TEXT,
    "orderSellerId" INTEGER,
    "sellerOrderNo" TEXT,
    "productPriceId" INTEGER,
    "breakdown" JSONB,
    "cashbackToCustomer" DECIMAL(10,2),
    "customerPay" DECIMAL(10,2),
    "platformFee" DECIMAL(10,2),
    "sellerReceives" DECIMAL(10,2),
    "object" JSONB,
    "orderProductReceipt" TEXT,
    "orderShippingId" INTEGER,
    "orderProductType" "OrderProductType" NOT NULL DEFAULT 'PRODUCT',
    "serviceFeatures" JSONB,
    "serviceId" INTEGER,

    CONSTRAINT "OrderProducts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProductService" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "orderProductId" INTEGER NOT NULL,
    "orderProductType" TEXT,
    "relatedOrderProductId" INTEGER,

    CONSTRAINT "OrderProductService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAddress" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "cc" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "postCode" TEXT,
    "addressType" "AddressType" NOT NULL DEFAULT 'BILLING',
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cityId" INTEGER,
    "countryId" INTEGER,
    "stateId" INTEGER,
    "town" TEXT,

    CONSTRAINT "OrderAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEMI" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER,
    "emiInstallmentCount" INTEGER,
    "emiInstallmentAmount" DECIMAL(10,2),
    "emiInstallmentAmountCents" INTEGER,
    "emiStartDate" TIMESTAMP(3),
    "emiInstallmentsPaid" INTEGER,
    "emiStatus" "EmiStatus" NOT NULL DEFAULT 'ONGOING',
    "nextEmiDueDate" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderEMI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicForm" (
    "id" SERIAL NOT NULL,
    "formData" TEXT,
    "formName" TEXT,
    "productId" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "DynamicForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicFormElement" (
    "id" SERIAL NOT NULL,
    "keyName" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "formId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "typeField" TEXT,

    CONSTRAINT "DynamicFormElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicFormCategory" (
    "id" SERIAL NOT NULL,
    "formId" INTEGER,
    "categoryId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryLocation" TEXT,

    CONSTRAINT "DynamicFormCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuoteAddress" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "cc" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "postCode" TEXT,
    "rfqDate" TIMESTAMP(3),
    "countryId" INTEGER,
    "stateId" INTEGER,
    "cityId" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfqQuoteAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuotes" (
    "id" SERIAL NOT NULL,
    "buyerID" INTEGER,
    "rfqQuoteAddressId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfqQuotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuotesProducts" (
    "id" SERIAL NOT NULL,
    "rfqQuotesId" INTEGER,
    "rfqProductId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "offerPrice" DECIMAL(8,2),
    "note" TEXT,
    "quantity" INTEGER,
    "productType" VARCHAR(10),
    "offerPriceFrom" DECIMAL(8,2),
    "offerPriceTo" DECIMAL(8,2),

    CONSTRAINT "RfqQuotesProducts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuotesUsers" (
    "id" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "rfqQuotesId" INTEGER,
    "buyerID" INTEGER,
    "sellerID" INTEGER,
    "offerPrice" DECIMAL(10,2),
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userAccountBuyerId" INTEGER,
    "userAccountSellerId" INTEGER,

    CONSTRAINT "RfqQuotesUsers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" SERIAL NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "userId" INTEGER,
    "productId" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "rfqId" INTEGER,
    "orderProductId" INTEGER,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rfqId" INTEGER,
    "rfqQuotesUserId" INTEGER,
    "userId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "orderProductId" INTEGER,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachments" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" DOUBLE PRECISION NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "messageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uniqueId" TEXT,
    "presignedUrl" TEXT,

    CONSTRAINT "ChatAttachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuoteProductPriceRequest" (
    "id" SERIAL NOT NULL,
    "rfqQuoteId" INTEGER NOT NULL,
    "rfqQuoteProductId" INTEGER NOT NULL,
    "rfqQuotesUserId" INTEGER NOT NULL,
    "messageId" INTEGER NOT NULL,
    "sellerId" INTEGER,
    "buyerId" INTEGER,
    "requestedById" INTEGER NOT NULL,
    "approvedById" INTEGER,
    "rejectedById" INTEGER,
    "requestedPrice" DOUBLE PRECISION NOT NULL,
    "status" "RfqProductPriceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfqQuoteProductPriceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqSuggestedProduct" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "rfqQuoteProductId" INTEGER NOT NULL,
    "suggestedProductId" INTEGER NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "rfqQuotesUserId" INTEGER NOT NULL,
    "offerPrice" DECIMAL(8,2),
    "quantity" INTEGER,
    "isSelectedByBuyer" BOOLEAN NOT NULL DEFAULT false,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RfqSuggestedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomParticipants" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomParticipants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER,
    "userId" INTEGER,
    "productId" INTEGER,
    "formName" TEXT,
    "formData" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER,
    "userId" INTEGER,
    "formId" INTEGER,
    "keyName" TEXT,
    "value" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Countries" (
    "id" SERIAL NOT NULL,
    "sortname" TEXT,
    "name" TEXT,
    "phoneCode" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "States" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "countryId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "States_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cities" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "stateId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentErrorLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "paymentIntentId" TEXT,
    "payload" JSONB,
    "location" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPermission" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "addedBy" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AdminPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" SERIAL NOT NULL,
    "adminRoleName" TEXT,
    "addedBy" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRolePermission" (
    "id" SERIAL NOT NULL,
    "adminRoleId" INTEGER,
    "adminPermissionId" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AdminRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "adminRoleId" INTEGER,
    "addedBy" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpCenter" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "userEmail" TEXT,
    "query" TEXT,
    "response" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionPaymob" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "orderId" INTEGER,
    "transactionStatus" TEXT,
    "paymobTransactionId" TEXT,
    "amountCents" INTEGER,
    "success" BOOLEAN,
    "paymobObject" JSONB,
    "merchantOrderId" INTEGER,
    "paymobOrderId" INTEGER,
    "transactionType" TEXT,
    "type" TEXT,
    "amount" DECIMAL(10,2),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionPaymob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "workingDays" TEXT NOT NULL,
    "offDays" TEXT,
    "renewEveryWeek" BOOLEAN NOT NULL DEFAULT false,
    "oneTime" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TIMESTAMP(6),
    "closeTime" TIMESTAMP(6),
    "breakTimeFrom" TIMESTAMP(6),
    "breakTimeTo" TIMESTAMP(6),
    "shippingType" "ShippingType",
    "fromCityId" INTEGER,
    "toCityId" INTEGER,
    "rangeCityId" INTEGER,
    "serviceName" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "description" TEXT,
    "serviceConfirmType" "ServiceConfirmType",
    "serviceFor" "ServiceFor",
    "categoryId" INTEGER NOT NULL,
    "categoryLocation" TEXT,
    "status" "Status" NOT NULL DEFAULT 'INACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerPerPeiod" INTEGER,
    "eachCustomerTime" INTEGER,
    "sellerId" INTEGER NOT NULL,
    "countryId" INTEGER,
    "stateId" INTEGER,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTag" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceFeature" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "serviceCost" DECIMAL(65,30) NOT NULL,
    "serviceCostType" "ServiceCostType" NOT NULL,

    CONSTRAINT "ServiceFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceImage" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,

    CONSTRAINT "ServiceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageSetting" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "setting" JSONB,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "userAccountId" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "frozenBalance" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" SERIAL NOT NULL,
    "walletId" INTEGER NOT NULL,
    "transactionType" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balanceBefore" DECIMAL(15,2) NOT NULL,
    "balanceAfter" DECIMAL(15,2) NOT NULL,
    "referenceId" TEXT,
    "referenceType" "WalletReferenceType",
    "description" TEXT,
    "metadata" JSONB,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransfer" (
    "id" SERIAL NOT NULL,
    "fromWalletId" INTEGER NOT NULL,
    "toWalletId" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "transferFee" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "description" TEXT,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletSettings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "autoWithdraw" BOOLEAN NOT NULL DEFAULT false,
    "withdrawLimit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "dailyLimit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "monthlyLimit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "notificationPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WalletSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExistingProduct" (
    "id" SERIAL NOT NULL,
    "productName" TEXT NOT NULL,
    "categoryId" INTEGER,
    "brandId" INTEGER,
    "description" TEXT,
    "specification" TEXT,
    "shortDescription" TEXT,
    "productType" "ProductType",
    "typeOfProduct" "TypeOfProduct",
    "typeProduct" "TypeProduct",
    "placeOfOriginId" INTEGER,
    "barcode" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adminId" INTEGER,
    "categoryLocation" TEXT,
    "offerPrice" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "productPrice" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "productViewCount" INTEGER DEFAULT 0,
    "skuNo" TEXT NOT NULL DEFAULT ('SKU_'::text || (EXTRACT(epoch FROM now()))::text),
    "userId" INTEGER,

    CONSTRAINT "ExistingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExistingProductTags" (
    "id" SERIAL NOT NULL,
    "existingProductId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExistingProductTags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "link" VARCHAR(500),
    "icon" VARCHAR(100),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExistingProductImages" (
    "id" SERIAL NOT NULL,
    "existingProductId" INTEGER NOT NULL,
    "image" TEXT,
    "video" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageName" TEXT,
    "videoName" TEXT,
    "variant" JSONB,

    CONSTRAINT "ExistingProductImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "image" VARCHAR(500) NOT NULL,
    "link" VARCHAR(500),
    "buttonText" VARCHAR(100) DEFAULT 'Shop Now',
    "position" "BannerPosition" NOT NULL DEFAULT 'MAIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "targetUrl" VARCHAR(500),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_log" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "userId" INTEGER,
    "requestId" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "errorStack" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category_map" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_category_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_keyword" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_tag" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_category_map" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_category_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_template" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dataType" "SpecDataType" NOT NULL DEFAULT 'TEXT',
    "unit" TEXT,
    "options" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "groupName" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spec_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_spec_value" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "specTemplateId" INTEGER NOT NULL,
    "value" TEXT,
    "numericValue" DECIMAL(12,4),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_spec_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_log" (
    "id" SERIAL NOT NULL,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseMs" INTEGER,
    "details" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_parentUserId_idx" ON "User"("parentUserId");

-- CreateIndex
CREATE INDEX "User_masterAccountId_idx" ON "User"("masterAccountId");

-- CreateIndex
CREATE INDEX "User_userRoleId_idx" ON "User"("userRoleId");

-- CreateIndex
CREATE INDEX "User_adminRoleId_idx" ON "User"("adminRoleId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_tradeRole_idx" ON "User"("tradeRole");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MasterAccount_email_key" ON "MasterAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MasterAccount_lastActiveUserId_key" ON "MasterAccount"("lastActiveUserId");

-- CreateIndex
CREATE INDEX "UserRolePermission_userRoleId_idx" ON "UserRolePermission"("userRoleId");

-- CreateIndex
CREATE INDEX "UserRolePermission_permissionId_idx" ON "UserRolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");

-- CreateIndex
CREATE INDEX "UserAddress_cityId_idx" ON "UserAddress"("cityId");

-- CreateIndex
CREATE INDEX "UserAddress_countryId_idx" ON "UserAddress"("countryId");

-- CreateIndex
CREATE INDEX "UserAddress_stateId_idx" ON "UserAddress"("stateId");

-- CreateIndex
CREATE INDEX "UserPhone_userId_idx" ON "UserPhone"("userId");

-- CreateIndex
CREATE INDEX "UserSocialLink_userId_idx" ON "UserSocialLink"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfileBusinessType_userId_idx" ON "UserProfileBusinessType"("userId");

-- CreateIndex
CREATE INDEX "UserProfileBusinessType_userProfileId_idx" ON "UserProfileBusinessType"("userProfileId");

-- CreateIndex
CREATE INDEX "UserProfileBusinessType_businessTypeId_idx" ON "UserProfileBusinessType"("businessTypeId");

-- CreateIndex
CREATE INDEX "UserBranch_countryId_idx" ON "UserBranch"("countryId");

-- CreateIndex
CREATE INDEX "UserBranch_stateId_idx" ON "UserBranch"("stateId");

-- CreateIndex
CREATE INDEX "UserBranch_cityId_idx" ON "UserBranch"("cityId");

-- CreateIndex
CREATE INDEX "UserBranch_userId_idx" ON "UserBranch"("userId");

-- CreateIndex
CREATE INDEX "UserBranchBusinessType_userBranchId_idx" ON "UserBranchBusinessType"("userBranchId");

-- CreateIndex
CREATE INDEX "UserBranchBusinessType_businessTypeId_idx" ON "UserBranchBusinessType"("businessTypeId");

-- CreateIndex
CREATE INDEX "UserBranchTags_userBranchId_idx" ON "UserBranchTags"("userBranchId");

-- CreateIndex
CREATE INDEX "UserBranchTags_tagId_idx" ON "UserBranchTags"("tagId");

-- CreateIndex
CREATE INDEX "UserBranchCategory_userBranchId_idx" ON "UserBranchCategory"("userBranchId");

-- CreateIndex
CREATE INDEX "UserBranchCategory_categoryId_idx" ON "UserBranchCategory"("categoryId");

-- CreateIndex
CREATE INDEX "UserBusinessCategory_userId_idx" ON "UserBusinessCategory"("userId");

-- CreateIndex
CREATE INDEX "UserBusinessCategory_categoryId_idx" ON "UserBusinessCategory"("categoryId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "TeamMember_userRoleId_idx" ON "TeamMember"("userRoleId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_menuId_idx" ON "Category"("menuId");

-- CreateIndex
CREATE INDEX "CategoryConnectTo_categoryId_idx" ON "CategoryConnectTo"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryConnectTo_connectTo_idx" ON "CategoryConnectTo"("connectTo");

-- CreateIndex
CREATE UNIQUE INDEX "Product_skuNo_key" ON "Product"("skuNo");

-- CreateIndex
CREATE INDEX "Product_categoryId_status_deletedAt_idx" ON "Product"("categoryId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_userId_status_idx" ON "Product"("userId", "status");

-- CreateIndex
CREATE INDEX "Product_status_deletedAt_createdAt_idx" ON "Product"("status", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Product_adminId_idx" ON "Product"("adminId");

-- CreateIndex
CREATE INDEX "Product_originalProductId_idx" ON "Product"("originalProductId");

-- CreateIndex
CREATE INDEX "Product_dropshipVendorId_idx" ON "Product"("dropshipVendorId");

-- CreateIndex
CREATE INDEX "Product_originalVendorId_idx" ON "Product"("originalVendorId");

-- CreateIndex
CREATE INDEX "ProductPrice_productId_status_idx" ON "ProductPrice"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductPrice_adminId_status_idx" ON "ProductPrice"("adminId", "status");

-- CreateIndex
CREATE INDEX "ProductPrice_menuId_idx" ON "ProductPrice"("menuId");

-- CreateIndex
CREATE INDEX "ProductPrice_productCountryId_idx" ON "ProductPrice"("productCountryId");

-- CreateIndex
CREATE INDEX "ProductPrice_productStateId_idx" ON "ProductPrice"("productStateId");

-- CreateIndex
CREATE INDEX "ProductPrice_productCityId_idx" ON "ProductPrice"("productCityId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_productPriceId_idx" ON "ProductVariant"("productPriceId");

-- CreateIndex
CREATE INDEX "ProductSellCountry_productId_idx" ON "ProductSellCountry"("productId");

-- CreateIndex
CREATE INDEX "ProductSellCountry_countryId_idx" ON "ProductSellCountry"("countryId");

-- CreateIndex
CREATE INDEX "ProductSellState_productId_idx" ON "ProductSellState"("productId");

-- CreateIndex
CREATE INDEX "ProductSellState_stateId_idx" ON "ProductSellState"("stateId");

-- CreateIndex
CREATE INDEX "ProductSellCity_productId_idx" ON "ProductSellCity"("productId");

-- CreateIndex
CREATE INDEX "ProductSellCity_cityId_idx" ON "ProductSellCity"("cityId");

-- CreateIndex
CREATE INDEX "ProductSellerImage_productPriceId_idx" ON "ProductSellerImage"("productPriceId");

-- CreateIndex
CREATE INDEX "ProductSpecification_productId_idx" ON "ProductSpecification"("productId");

-- CreateIndex
CREATE INDEX "ProductShortDescription_productId_idx" ON "ProductShortDescription"("productId");

-- CreateIndex
CREATE INDEX "ProductTags_productId_idx" ON "ProductTags"("productId");

-- CreateIndex
CREATE INDEX "ProductTags_tagId_idx" ON "ProductTags"("tagId");

-- CreateIndex
CREATE INDEX "ProductImages_productId_idx" ON "ProductImages"("productId");

-- CreateIndex
CREATE INDEX "SellerReward_productId_idx" ON "SellerReward"("productId");

-- CreateIndex
CREATE INDEX "SharedLink_productId_idx" ON "SharedLink"("productId");

-- CreateIndex
CREATE INDEX "SharedLink_linkGeneratedBy_idx" ON "SharedLink"("linkGeneratedBy");

-- CreateIndex
CREATE INDEX "ProductReview_productId_idx" ON "ProductReview"("productId");

-- CreateIndex
CREATE INDEX "ProductReview_userId_idx" ON "ProductReview"("userId");

-- CreateIndex
CREATE INDEX "ProductPriceReview_productPriceId_idx" ON "ProductPriceReview"("productPriceId");

-- CreateIndex
CREATE INDEX "ProductPriceReview_userId_idx" ON "ProductPriceReview"("userId");

-- CreateIndex
CREATE INDEX "ProductPriceReview_productId_idx" ON "ProductPriceReview"("productId");

-- CreateIndex
CREATE INDEX "ProductView_userId_idx" ON "ProductView"("userId");

-- CreateIndex
CREATE INDEX "ProductView_deviceId_idx" ON "ProductView"("deviceId");

-- CreateIndex
CREATE INDEX "ProductView_productId_idx" ON "ProductView"("productId");

-- CreateIndex
CREATE INDEX "ProductView_lastViewedAt_idx" ON "ProductView"("lastViewedAt");

-- CreateIndex
CREATE INDEX "ProductView_viewCount_idx" ON "ProductView"("viewCount");

-- CreateIndex
CREATE UNIQUE INDEX "ProductView_userId_productId_key" ON "ProductView"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductView_deviceId_productId_key" ON "ProductView"("deviceId", "productId");

-- CreateIndex
CREATE INDEX "ProductSearch_userId_idx" ON "ProductSearch"("userId");

-- CreateIndex
CREATE INDEX "ProductSearch_deviceId_idx" ON "ProductSearch"("deviceId");

-- CreateIndex
CREATE INDEX "ProductSearch_searchTerm_idx" ON "ProductSearch"("searchTerm");

-- CreateIndex
CREATE INDEX "ProductSearch_productId_idx" ON "ProductSearch"("productId");

-- CreateIndex
CREATE INDEX "ProductSearch_clicked_idx" ON "ProductSearch"("clicked");

-- CreateIndex
CREATE INDEX "ProductSearch_createdAt_idx" ON "ProductSearch"("createdAt");

-- CreateIndex
CREATE INDEX "ProductClick_userId_idx" ON "ProductClick"("userId");

-- CreateIndex
CREATE INDEX "ProductClick_deviceId_idx" ON "ProductClick"("deviceId");

-- CreateIndex
CREATE INDEX "ProductClick_productId_idx" ON "ProductClick"("productId");

-- CreateIndex
CREATE INDEX "ProductClick_clickSource_idx" ON "ProductClick"("clickSource");

-- CreateIndex
CREATE INDEX "ProductClick_createdAt_idx" ON "ProductClick"("createdAt");

-- CreateIndex
CREATE INDEX "ProductQuestion_productId_idx" ON "ProductQuestion"("productId");

-- CreateIndex
CREATE INDEX "ProductQuestion_questionByuserId_idx" ON "ProductQuestion"("questionByuserId");

-- CreateIndex
CREATE INDEX "ProductQuestionAnswer_productQuestionId_idx" ON "ProductQuestionAnswer"("productQuestionId");

-- CreateIndex
CREATE INDEX "CustomizeProduct_productId_idx" ON "CustomizeProduct"("productId");

-- CreateIndex
CREATE INDEX "CustomizeProduct_sellerId_idx" ON "CustomizeProduct"("sellerId");

-- CreateIndex
CREATE INDEX "CustomizeProduct_buyerId_idx" ON "CustomizeProduct"("buyerId");

-- CreateIndex
CREATE INDEX "CustomizeProductImage_customizeProductId_idx" ON "CustomizeProductImage"("customizeProductId");

-- CreateIndex
CREATE INDEX "FactoriesCart_customizeProductId_idx" ON "FactoriesCart"("customizeProductId");

-- CreateIndex
CREATE INDEX "FactoriesCart_productId_idx" ON "FactoriesCart"("productId");

-- CreateIndex
CREATE INDEX "FactoriesCart_userId_idx" ON "FactoriesCart"("userId");

-- CreateIndex
CREATE INDEX "FactoriesRequest_customizeProductId_idx" ON "FactoriesRequest"("customizeProductId");

-- CreateIndex
CREATE INDEX "FactoriesRequest_buyerId_idx" ON "FactoriesRequest"("buyerId");

-- CreateIndex
CREATE INDEX "FactoriesRequest_sellerId_idx" ON "FactoriesRequest"("sellerId");

-- CreateIndex
CREATE INDEX "RFQProduct_productId_idx" ON "RFQProduct"("productId");

-- CreateIndex
CREATE INDEX "RFQProduct_userId_idx" ON "RFQProduct"("userId");

-- CreateIndex
CREATE INDEX "RFQProductImages_rfqProductId_idx" ON "RFQProductImages"("rfqProductId");

-- CreateIndex
CREATE INDEX "Cart_userId_status_idx" ON "Cart"("userId", "status");

-- CreateIndex
CREATE INDEX "Cart_deviceId_idx" ON "Cart"("deviceId");

-- CreateIndex
CREATE INDEX "Cart_productId_idx" ON "Cart"("productId");

-- CreateIndex
CREATE INDEX "Cart_productPriceId_idx" ON "Cart"("productPriceId");

-- CreateIndex
CREATE INDEX "Cart_serviceId_idx" ON "Cart"("serviceId");

-- CreateIndex
CREATE INDEX "CartServiceFeature_cartId_idx" ON "CartServiceFeature"("cartId");

-- CreateIndex
CREATE INDEX "CartServiceFeature_serviceFeatureId_idx" ON "CartServiceFeature"("serviceFeatureId");

-- CreateIndex
CREATE INDEX "CartProductService_cartId_idx" ON "CartProductService"("cartId");

-- CreateIndex
CREATE INDEX "RFQCart_userId_idx" ON "RFQCart"("userId");

-- CreateIndex
CREATE INDEX "RFQCart_rfqProductId_idx" ON "RFQCart"("rfqProductId");

-- CreateIndex
CREATE INDEX "RFQCart_productId_idx" ON "RFQCart"("productId");

-- CreateIndex
CREATE INDEX "Order_userId_orderStatus_createdAt_idx" ON "Order"("userId", "orderStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_orderStatus_idx" ON "Order"("orderStatus");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "OrderShipping_orderId_idx" ON "OrderShipping"("orderId");

-- CreateIndex
CREATE INDEX "OrderShipping_sellerId_idx" ON "OrderShipping"("sellerId");

-- CreateIndex
CREATE INDEX "OrderSeller_orderId_idx" ON "OrderSeller"("orderId");

-- CreateIndex
CREATE INDEX "OrderSeller_sellerId_idx" ON "OrderSeller"("sellerId");

-- CreateIndex
CREATE INDEX "OrderProducts_sellerId_status_idx" ON "OrderProducts"("sellerId", "status");

-- CreateIndex
CREATE INDEX "OrderProducts_orderId_idx" ON "OrderProducts"("orderId");

-- CreateIndex
CREATE INDEX "OrderProducts_productId_idx" ON "OrderProducts"("productId");

-- CreateIndex
CREATE INDEX "OrderProducts_sellerId_idx" ON "OrderProducts"("sellerId");

-- CreateIndex
CREATE INDEX "OrderProducts_productPriceId_idx" ON "OrderProducts"("productPriceId");

-- CreateIndex
CREATE INDEX "OrderProducts_orderShippingId_idx" ON "OrderProducts"("orderShippingId");

-- CreateIndex
CREATE INDEX "OrderProducts_orderProductStatus_idx" ON "OrderProducts"("orderProductStatus");

-- CreateIndex
CREATE INDEX "OrderProductService_orderProductId_idx" ON "OrderProductService"("orderProductId");

-- CreateIndex
CREATE INDEX "OrderAddress_orderId_idx" ON "OrderAddress"("orderId");

-- CreateIndex
CREATE INDEX "DynamicFormElement_formId_idx" ON "DynamicFormElement"("formId");

-- CreateIndex
CREATE INDEX "DynamicFormElement_parentId_idx" ON "DynamicFormElement"("parentId");

-- CreateIndex
CREATE INDEX "DynamicFormCategory_formId_idx" ON "DynamicFormCategory"("formId");

-- CreateIndex
CREATE INDEX "DynamicFormCategory_categoryId_idx" ON "DynamicFormCategory"("categoryId");

-- CreateIndex
CREATE INDEX "RfqQuoteAddress_countryId_idx" ON "RfqQuoteAddress"("countryId");

-- CreateIndex
CREATE INDEX "RfqQuoteAddress_stateId_idx" ON "RfqQuoteAddress"("stateId");

-- CreateIndex
CREATE INDEX "RfqQuoteAddress_cityId_idx" ON "RfqQuoteAddress"("cityId");

-- CreateIndex
CREATE INDEX "RfqQuotes_buyerID_idx" ON "RfqQuotes"("buyerID");

-- CreateIndex
CREATE INDEX "RfqQuotes_rfqQuoteAddressId_idx" ON "RfqQuotes"("rfqQuoteAddressId");

-- CreateIndex
CREATE INDEX "RfqQuotesProducts_rfqQuotesId_idx" ON "RfqQuotesProducts"("rfqQuotesId");

-- CreateIndex
CREATE INDEX "RfqQuotesProducts_rfqProductId_idx" ON "RfqQuotesProducts"("rfqProductId");

-- CreateIndex
CREATE INDEX "RfqQuotesUsers_rfqQuotesId_idx" ON "RfqQuotesUsers"("rfqQuotesId");

-- CreateIndex
CREATE INDEX "RfqQuotesUsers_buyerID_idx" ON "RfqQuotesUsers"("buyerID");

-- CreateIndex
CREATE INDEX "RfqQuotesUsers_sellerID_idx" ON "RfqQuotesUsers"("sellerID");

-- CreateIndex
CREATE INDEX "Wishlist_userId_idx" ON "Wishlist"("userId");

-- CreateIndex
CREATE INDEX "Wishlist_productId_idx" ON "Wishlist"("productId");

-- CreateIndex
CREATE INDEX "Room_creatorId_idx" ON "Room"("creatorId");

-- CreateIndex
CREATE INDEX "Message_roomId_createdAt_idx" ON "Message"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_userId_roomId_idx" ON "Message"("userId", "roomId");

-- CreateIndex
CREATE INDEX "Message_rfqQuotesUserId_idx" ON "Message"("rfqQuotesUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachments_uniqueId_key" ON "ChatAttachments"("uniqueId");

-- CreateIndex
CREATE INDEX "ChatAttachments_messageId_idx" ON "ChatAttachments"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "RfqQuoteProductPriceRequest_messageId_key" ON "RfqQuoteProductPriceRequest"("messageId");

-- CreateIndex
CREATE INDEX "RfqQuoteProductPriceRequest_rfqQuoteId_idx" ON "RfqQuoteProductPriceRequest"("rfqQuoteId");

-- CreateIndex
CREATE INDEX "RfqQuoteProductPriceRequest_rfqQuoteProductId_idx" ON "RfqQuoteProductPriceRequest"("rfqQuoteProductId");

-- CreateIndex
CREATE INDEX "RfqQuoteProductPriceRequest_rfqQuotesUserId_idx" ON "RfqQuoteProductPriceRequest"("rfqQuotesUserId");

-- CreateIndex
CREATE INDEX "RfqSuggestedProduct_rfqQuoteProductId_idx" ON "RfqSuggestedProduct"("rfqQuoteProductId");

-- CreateIndex
CREATE INDEX "RfqSuggestedProduct_vendorId_idx" ON "RfqSuggestedProduct"("vendorId");

-- CreateIndex
CREATE INDEX "RfqSuggestedProduct_rfqQuotesUserId_idx" ON "RfqSuggestedProduct"("rfqQuotesUserId");

-- CreateIndex
CREATE INDEX "RfqSuggestedProduct_messageId_idx" ON "RfqSuggestedProduct"("messageId");

-- CreateIndex
CREATE INDEX "RoomParticipants_userId_idx" ON "RoomParticipants"("userId");

-- CreateIndex
CREATE INDEX "RoomParticipants_roomId_idx" ON "RoomParticipants"("roomId");

-- CreateIndex
CREATE INDEX "AdminRolePermission_adminRoleId_idx" ON "AdminRolePermission"("adminRoleId");

-- CreateIndex
CREATE INDEX "AdminRolePermission_adminPermissionId_idx" ON "AdminRolePermission"("adminPermissionId");

-- CreateIndex
CREATE INDEX "AdminMember_userId_idx" ON "AdminMember"("userId");

-- CreateIndex
CREATE INDEX "AdminMember_adminRoleId_idx" ON "AdminMember"("adminRoleId");

-- CreateIndex
CREATE INDEX "HelpCenter_userId_idx" ON "HelpCenter"("userId");

-- CreateIndex
CREATE INDEX "Service_sellerId_idx" ON "Service"("sellerId");

-- CreateIndex
CREATE INDEX "Service_categoryId_idx" ON "Service"("categoryId");

-- CreateIndex
CREATE INDEX "Service_countryId_idx" ON "Service"("countryId");

-- CreateIndex
CREATE INDEX "Service_stateId_idx" ON "Service"("stateId");

-- CreateIndex
CREATE INDEX "ServiceTag_serviceId_idx" ON "ServiceTag"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceTag_tagId_idx" ON "ServiceTag"("tagId");

-- CreateIndex
CREATE INDEX "ServiceFeature_serviceId_idx" ON "ServiceFeature"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceImage_serviceId_idx" ON "ServiceImage"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PageSetting_slug_key" ON "PageSetting"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSession_accessToken_key" ON "AccountSession"("accessToken");

-- CreateIndex
CREATE INDEX "AccountSession_userId_idx" ON "AccountSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_userAccountId_currencyCode_key" ON "Wallet"("userId", "userAccountId", "currencyCode");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_status_idx" ON "WalletTransaction"("walletId", "status");

-- CreateIndex
CREATE INDEX "WalletTransaction_referenceType_referenceId_idx" ON "WalletTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "WalletTransfer_fromWalletId_idx" ON "WalletTransfer"("fromWalletId");

-- CreateIndex
CREATE INDEX "WalletTransfer_toWalletId_idx" ON "WalletTransfer"("toWalletId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletSettings_userId_key" ON "WalletSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExistingProduct_skuNo_key" ON "ExistingProduct"("skuNo");

-- CreateIndex
CREATE INDEX "ExistingProduct_categoryId_idx" ON "ExistingProduct"("categoryId");

-- CreateIndex
CREATE INDEX "ExistingProduct_brandId_idx" ON "ExistingProduct"("brandId");

-- CreateIndex
CREATE INDEX "ExistingProduct_adminId_idx" ON "ExistingProduct"("adminId");

-- CreateIndex
CREATE INDEX "ExistingProduct_userId_idx" ON "ExistingProduct"("userId");

-- CreateIndex
CREATE INDEX "ExistingProductTags_existingProductId_idx" ON "ExistingProductTags"("existingProductId");

-- CreateIndex
CREATE INDEX "ExistingProductTags_tagId_idx" ON "ExistingProductTags"("tagId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ExistingProductImages_existingProductId_idx" ON "ExistingProductImages"("existingProductId");

-- CreateIndex
CREATE INDEX "banner_position_idx" ON "banner"("position");

-- CreateIndex
CREATE INDEX "banner_isActive_idx" ON "banner"("isActive");

-- CreateIndex
CREATE INDEX "banner_priority_idx" ON "banner"("priority");

-- CreateIndex
CREATE INDEX "banner_startDate_endDate_idx" ON "banner"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "banner_isActive_position_idx" ON "banner"("isActive", "position");

-- CreateIndex
CREATE INDEX "system_log_level_idx" ON "system_log"("level");

-- CreateIndex
CREATE INDEX "system_log_createdAt_idx" ON "system_log"("createdAt");

-- CreateIndex
CREATE INDEX "system_log_userId_idx" ON "system_log"("userId");

-- CreateIndex
CREATE INDEX "system_log_requestId_idx" ON "system_log"("requestId");

-- CreateIndex
CREATE INDEX "system_log_context_idx" ON "system_log"("context");

-- CreateIndex
CREATE INDEX "product_category_map_productId_idx" ON "product_category_map"("productId");

-- CreateIndex
CREATE INDEX "product_category_map_categoryId_idx" ON "product_category_map"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_map_productId_categoryId_key" ON "product_category_map"("productId", "categoryId");

-- CreateIndex
CREATE INDEX "category_keyword_keyword_idx" ON "category_keyword"("keyword");

-- CreateIndex
CREATE INDEX "category_keyword_categoryId_idx" ON "category_keyword"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "category_keyword_categoryId_keyword_key" ON "category_keyword"("categoryId", "keyword");

-- CreateIndex
CREATE INDEX "category_tag_categoryId_idx" ON "category_tag"("categoryId");

-- CreateIndex
CREATE INDEX "category_tag_tagId_idx" ON "category_tag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "category_tag_categoryId_tagId_key" ON "category_tag"("categoryId", "tagId");

-- CreateIndex
CREATE INDEX "service_category_map_serviceId_idx" ON "service_category_map"("serviceId");

-- CreateIndex
CREATE INDEX "service_category_map_categoryId_idx" ON "service_category_map"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "service_category_map_serviceId_categoryId_key" ON "service_category_map"("serviceId", "categoryId");

-- CreateIndex
CREATE INDEX "spec_template_categoryId_isFilterable_idx" ON "spec_template"("categoryId", "isFilterable");

-- CreateIndex
CREATE INDEX "spec_template_categoryId_sortOrder_idx" ON "spec_template"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "spec_template_categoryId_key_key" ON "spec_template"("categoryId", "key");

-- CreateIndex
CREATE INDEX "product_spec_value_specTemplateId_value_idx" ON "product_spec_value"("specTemplateId", "value");

-- CreateIndex
CREATE INDEX "product_spec_value_specTemplateId_numericValue_idx" ON "product_spec_value"("specTemplateId", "numericValue");

-- CreateIndex
CREATE INDEX "product_spec_value_productId_idx" ON "product_spec_value"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_spec_value_productId_specTemplateId_key" ON "product_spec_value"("productId", "specTemplateId");

-- CreateIndex
CREATE INDEX "system_health_log_component_checkedAt_idx" ON "system_health_log"("component", "checkedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "MasterAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_userTypeCategoryId_fkey" FOREIGN KEY ("userTypeCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterAccount" ADD CONSTRAINT "MasterAccount_lastActiveUserId_fkey" FOREIGN KEY ("lastActiveUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRolePermission" ADD CONSTRAINT "UserRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRolePermission" ADD CONSTRAINT "UserRolePermission_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPhone" ADD CONSTRAINT "UserPhone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSocialLink" ADD CONSTRAINT "UserSocialLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfileBusinessType" ADD CONSTRAINT "UserProfileBusinessType_businessTypeId_fkey" FOREIGN KEY ("businessTypeId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfileBusinessType" ADD CONSTRAINT "UserProfileBusinessType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfileBusinessType" ADD CONSTRAINT "UserProfileBusinessType_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchBusinessType" ADD CONSTRAINT "UserBranchBusinessType_businessTypeId_fkey" FOREIGN KEY ("businessTypeId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchBusinessType" ADD CONSTRAINT "UserBranchBusinessType_userBranchId_fkey" FOREIGN KEY ("userBranchId") REFERENCES "UserBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchTags" ADD CONSTRAINT "UserBranchTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchTags" ADD CONSTRAINT "UserBranchTags_userBranchId_fkey" FOREIGN KEY ("userBranchId") REFERENCES "UserBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchCategory" ADD CONSTRAINT "UserBranchCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchCategory" ADD CONSTRAINT "UserBranchCategory_userBranchId_fkey" FOREIGN KEY ("userBranchId") REFERENCES "UserBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBusinessCategory" ADD CONSTRAINT "UserBusinessCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_policy_fkey" FOREIGN KEY ("policy") REFERENCES "policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_rfq_fkey" FOREIGN KEY ("rfq") REFERENCES "Fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_store_fkey" FOREIGN KEY ("store") REFERENCES "Fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryConnectTo" ADD CONSTRAINT "CategoryConnectTo_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryConnectTo" ADD CONSTRAINT "CategoryConnectTo_connectTo_fkey" FOREIGN KEY ("connectTo") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fees" ADD CONSTRAINT "Fees_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fees" ADD CONSTRAINT "Fees_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesDetail" ADD CONSTRAINT "FeesDetail_consumerLocationId_fkey" FOREIGN KEY ("consumerLocationId") REFERENCES "FeesLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesDetail" ADD CONSTRAINT "FeesDetail_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "Fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesDetail" ADD CONSTRAINT "FeesDetail_vendorLocationId_fkey" FOREIGN KEY ("vendorLocationId") REFERENCES "FeesLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesToFeesDetail" ADD CONSTRAINT "FeesToFeesDetail_consumerDetailId_fkey" FOREIGN KEY ("consumerDetailId") REFERENCES "FeesDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesToFeesDetail" ADD CONSTRAINT "FeesToFeesDetail_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "Fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesToFeesDetail" ADD CONSTRAINT "FeesToFeesDetail_vendorDetailId_fkey" FOREIGN KEY ("vendorDetailId") REFERENCES "FeesDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesLocation" ADD CONSTRAINT "FeesLocation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesLocation" ADD CONSTRAINT "FeesLocation_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesLocation" ADD CONSTRAINT "FeesLocation_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesCountry" ADD CONSTRAINT "FeesCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesCountry" ADD CONSTRAINT "FeesCountry_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "Fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesState" ADD CONSTRAINT "FeesState_feesCountryId_fkey" FOREIGN KEY ("feesCountryId") REFERENCES "FeesCountry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesState" ADD CONSTRAINT "FeesState_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesCity" ADD CONSTRAINT "FeesCity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesCity" ADD CONSTRAINT "FeesCity_feesStateId_fkey" FOREIGN KEY ("feesStateId") REFERENCES "FeesState"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesTown" ADD CONSTRAINT "FeesTown_feesCityId_fkey" FOREIGN KEY ("feesCityId") REFERENCES "FeesCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesCategoryConnectTo" ADD CONSTRAINT "FeesCategoryConnectTo_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeesCategoryConnectTo" ADD CONSTRAINT "FeesCategoryConnectTo_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "Fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy" ADD CONSTRAINT "policy_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_placeOfOriginId_fkey" FOREIGN KEY ("placeOfOriginId") REFERENCES "CountryList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_originalProductId_fkey" FOREIGN KEY ("originalProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_dropshipVendorId_fkey" FOREIGN KEY ("dropshipVendorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_originalVendorId_fkey" FOREIGN KEY ("originalVendorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productCityId_fkey" FOREIGN KEY ("productCityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productCountryId_fkey" FOREIGN KEY ("productCountryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productStateId_fkey" FOREIGN KEY ("productStateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSellCountry" ADD CONSTRAINT "ProductSellCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSellCountry" ADD CONSTRAINT "ProductSellCountry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSellState" ADD CONSTRAINT "ProductSellState_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSellState" ADD CONSTRAINT "ProductSellState_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSellCity" ADD CONSTRAINT "ProductSellCity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSellCity" ADD CONSTRAINT "ProductSellCity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSellerImage" ADD CONSTRAINT "ProductSellerImage_productPriceId_fkey" FOREIGN KEY ("productPriceId") REFERENCES "ProductPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShortDescription" ADD CONSTRAINT "ProductShortDescription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTags" ADD CONSTRAINT "ProductTags_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTags" ADD CONSTRAINT "ProductTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImages" ADD CONSTRAINT "ProductImages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerReward" ADD CONSTRAINT "SellerReward_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_linkGeneratedBy_fkey" FOREIGN KEY ("linkGeneratedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceReview" ADD CONSTRAINT "ProductPriceReview_productPriceId_fkey" FOREIGN KEY ("productPriceId") REFERENCES "ProductPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceReview" ADD CONSTRAINT "ProductPriceReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSearch" ADD CONSTRAINT "ProductSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSearch" ADD CONSTRAINT "ProductSearch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductClick" ADD CONSTRAINT "ProductClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductClick" ADD CONSTRAINT "ProductClick_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_answerByuserId_fkey" FOREIGN KEY ("answerByuserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_questionByuserId_fkey" FOREIGN KEY ("questionByuserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestionAnswer" ADD CONSTRAINT "ProductQuestionAnswer_answerByuserId_fkey" FOREIGN KEY ("answerByuserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestionAnswer" ADD CONSTRAINT "ProductQuestionAnswer_productQuestionId_fkey" FOREIGN KEY ("productQuestionId") REFERENCES "ProductQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizeProduct" ADD CONSTRAINT "CustomizeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomizeProductImage" ADD CONSTRAINT "CustomizeProductImage_customizeProductId_fkey" FOREIGN KEY ("customizeProductId") REFERENCES "CustomizeProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoriesCart" ADD CONSTRAINT "FactoriesCart_customizeProductId_fkey" FOREIGN KEY ("customizeProductId") REFERENCES "CustomizeProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoriesCart" ADD CONSTRAINT "FactoriesCart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoriesRequest" ADD CONSTRAINT "FactoriesRequest_customizeProductId_fkey" FOREIGN KEY ("customizeProductId") REFERENCES "CustomizeProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQProduct" ADD CONSTRAINT "RFQProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQProductImages" ADD CONSTRAINT "RFQProductImages_rfqProductId_fkey" FOREIGN KEY ("rfqProductId") REFERENCES "RFQProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_productPriceId_fkey" FOREIGN KEY ("productPriceId") REFERENCES "ProductPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartServiceFeature" ADD CONSTRAINT "CartServiceFeature_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartServiceFeature" ADD CONSTRAINT "CartServiceFeature_serviceFeatureId_fkey" FOREIGN KEY ("serviceFeatureId") REFERENCES "ServiceFeature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartProductService" ADD CONSTRAINT "CartProductService_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartProductService" ADD CONSTRAINT "CartProductService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartProductService" ADD CONSTRAINT "CartProductService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQCart" ADD CONSTRAINT "RFQCart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQCart" ADD CONSTRAINT "RFQCart_rfqProductId_fkey" FOREIGN KEY ("rfqProductId") REFERENCES "RFQProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipping" ADD CONSTRAINT "OrderShipping_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_orderShippingId_fkey" FOREIGN KEY ("orderShippingId") REFERENCES "OrderShipping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_productPriceId_fkey" FOREIGN KEY ("productPriceId") REFERENCES "ProductPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductService" ADD CONSTRAINT "OrderProductService_orderProductId_fkey" FOREIGN KEY ("orderProductId") REFERENCES "OrderProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductService" ADD CONSTRAINT "OrderProductService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductService" ADD CONSTRAINT "OrderProductService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAddress" ADD CONSTRAINT "OrderAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicFormElement" ADD CONSTRAINT "DynamicFormElement_formId_fkey" FOREIGN KEY ("formId") REFERENCES "DynamicForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicFormElement" ADD CONSTRAINT "DynamicFormElement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DynamicFormElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicFormCategory" ADD CONSTRAINT "DynamicFormCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicFormCategory" ADD CONSTRAINT "DynamicFormCategory_formId_fkey" FOREIGN KEY ("formId") REFERENCES "DynamicForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteAddress" ADD CONSTRAINT "RfqQuoteAddress_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteAddress" ADD CONSTRAINT "RfqQuoteAddress_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteAddress" ADD CONSTRAINT "RfqQuoteAddress_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotes" ADD CONSTRAINT "RfqQuotes_rfqQuoteAddressId_fkey" FOREIGN KEY ("rfqQuoteAddressId") REFERENCES "RfqQuoteAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotesProducts" ADD CONSTRAINT "RfqQuotesProducts_rfqProductId_fkey" FOREIGN KEY ("rfqProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotesProducts" ADD CONSTRAINT "RfqQuotesProducts_rfqQuotesId_fkey" FOREIGN KEY ("rfqQuotesId") REFERENCES "RfqQuotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotesUsers" ADD CONSTRAINT "RfqQuotesUsers_buyerID_fkey" FOREIGN KEY ("buyerID") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotesUsers" ADD CONSTRAINT "RfqQuotesUsers_rfqQuotesId_fkey" FOREIGN KEY ("rfqQuotesId") REFERENCES "RfqQuotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotesUsers" ADD CONSTRAINT "RfqQuotesUsers_sellerID_fkey" FOREIGN KEY ("sellerID") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_rfqQuotesUserId_fkey" FOREIGN KEY ("rfqQuotesUserId") REFERENCES "RfqQuotesUsers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachments" ADD CONSTRAINT "ChatAttachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_rfqQuoteId_fkey" FOREIGN KEY ("rfqQuoteId") REFERENCES "RfqQuotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_rfqQuoteProductId_fkey" FOREIGN KEY ("rfqQuoteProductId") REFERENCES "RfqQuotesProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_rfqQuotesUserId_fkey" FOREIGN KEY ("rfqQuotesUserId") REFERENCES "RfqQuotesUsers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSuggestedProduct" ADD CONSTRAINT "RfqSuggestedProduct_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSuggestedProduct" ADD CONSTRAINT "RfqSuggestedProduct_rfqQuoteProductId_fkey" FOREIGN KEY ("rfqQuoteProductId") REFERENCES "RfqQuotesProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSuggestedProduct" ADD CONSTRAINT "RfqSuggestedProduct_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSuggestedProduct" ADD CONSTRAINT "RfqSuggestedProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSuggestedProduct" ADD CONSTRAINT "RfqSuggestedProduct_rfqQuotesUserId_fkey" FOREIGN KEY ("rfqQuotesUserId") REFERENCES "RfqQuotesUsers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipants" ADD CONSTRAINT "RoomParticipants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipants" ADD CONSTRAINT "RoomParticipants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_adminPermissionId_fkey" FOREIGN KEY ("adminPermissionId") REFERENCES "AdminPermission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMember" ADD CONSTRAINT "AdminMember_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMember" ADD CONSTRAINT "AdminMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpCenter" ADD CONSTRAINT "HelpCenter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_fromCityId_fkey" FOREIGN KEY ("fromCityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_rangeCityId_fkey" FOREIGN KEY ("rangeCityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_toCityId_fkey" FOREIGN KEY ("toCityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTag" ADD CONSTRAINT "ServiceTag_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTag" ADD CONSTRAINT "ServiceTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeature" ADD CONSTRAINT "ServiceFeature_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceImage" ADD CONSTRAINT "ServiceImage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSession" ADD CONSTRAINT "AccountSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletSettings" ADD CONSTRAINT "WalletSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_placeOfOriginId_fkey" FOREIGN KEY ("placeOfOriginId") REFERENCES "CountryList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProductTags" ADD CONSTRAINT "ExistingProductTags_existingProductId_fkey" FOREIGN KEY ("existingProductId") REFERENCES "ExistingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProductTags" ADD CONSTRAINT "ExistingProductTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProductImages" ADD CONSTRAINT "ExistingProductImages_existingProductId_fkey" FOREIGN KEY ("existingProductId") REFERENCES "ExistingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_log" ADD CONSTRAINT "system_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category_map" ADD CONSTRAINT "product_category_map_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category_map" ADD CONSTRAINT "product_category_map_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_keyword" ADD CONSTRAINT "category_keyword_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_tag" ADD CONSTRAINT "category_tag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_tag" ADD CONSTRAINT "category_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_category_map" ADD CONSTRAINT "service_category_map_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_category_map" ADD CONSTRAINT "service_category_map_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_template" ADD CONSTRAINT "spec_template_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_spec_value" ADD CONSTRAINT "product_spec_value_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_spec_value" ADD CONSTRAINT "product_spec_value_specTemplateId_fkey" FOREIGN KEY ("specTemplateId") REFERENCES "spec_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

