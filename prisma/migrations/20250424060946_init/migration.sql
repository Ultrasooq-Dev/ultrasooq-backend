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
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETE', 'HIDDEN');

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
CREATE TYPE "ProductType" AS ENUM ('P', 'R', 'F');

-- CreateEnum
CREATE TYPE "TypeOfProduct" AS ENUM ('BRAND', 'SPAREPART', 'OWNBRAND');

-- CreateEnum
CREATE TYPE "TypeProduct" AS ENUM ('VENDORLOCAL', 'BRAND');

-- CreateEnum
CREATE TYPE "ConsumerType" AS ENUM ('CONSUMER', 'VENDORS', 'EVERYONE');

-- CreateEnum
CREATE TYPE "SellType" AS ENUM ('NORMALSELL', 'BUYGROUP', 'OTHERS', 'EVERYONE');

-- CreateEnum
CREATE TYPE "rFqType" AS ENUM ('P', 'R');

-- CreateEnum
CREATE TYPE "CartType" AS ENUM ('DEFAULT');

-- CreateEnum
CREATE TYPE "RFQCartType" AS ENUM ('DEFAULT', 'P', 'R');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DEFAULT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OrderProductStatus" AS ENUM ('CANCELLED', 'CONFIRMED', 'SHIPPED', 'OFD', 'DELIVERED');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BILLING', 'SHIPPING');

-- CreateEnum
CREATE TYPE "EmiStatus" AS ENUM ('STOPPED', 'ONGOING', 'COMPLETED');

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
    "email" TEXT NOT NULL,
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
    "status" "Status" NOT NULL DEFAULT 'INACTIVE',
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

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQCart" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "rfqProductId" INTEGER,
    "quantity" INTEGER,
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
    "orderProductStatus" "OrderProductStatus" NOT NULL DEFAULT 'CONFIRMED',
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

    CONSTRAINT "OrderProducts_pkey" PRIMARY KEY ("id")
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
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "rfqId" INTEGER NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rfqId" INTEGER NOT NULL,
    "rfqQuotesUserId" INTEGER,
    "userId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,

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
    "openTime" TIMESTAMP,
    "closeTime" TIMESTAMP,
    "breakTimeFrom" TIMESTAMP,
    "breakTimeTo" TIMESTAMP,
    "shippingType" "ShippingType",
    "fromCityId" INTEGER,
    "toCityId" INTEGER,
    "rangeCityId" INTEGER,
    "serviceName" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "image" TEXT,
    "description" TEXT,
    "serviceCostType" "ServiceCostType" NOT NULL,
    "serviceCost" DECIMAL(65,30) NOT NULL,
    "serviceConfirmType" "ServiceConfirmType",
    "serviceFor" "ServiceFor",
    "categoryId" INTEGER NOT NULL,
    "categoryLocation" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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

    CONSTRAINT "ServiceFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_skuNo_key" ON "Product"("skuNo");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachments_uniqueId_key" ON "ChatAttachments"("uniqueId");

-- CreateIndex
CREATE UNIQUE INDEX "RfqQuoteProductPriceRequest_messageId_key" ON "RfqQuoteProductPriceRequest"("messageId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQCart" ADD CONSTRAINT "RFQCart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQCart" ADD CONSTRAINT "RFQCart_rfqProductId_fkey" FOREIGN KEY ("rfqProductId") REFERENCES "RFQProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_productPriceId_fkey" FOREIGN KEY ("productPriceId") REFERENCES "ProductPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Service" ADD CONSTRAINT "Service_fromCityId_fkey" FOREIGN KEY ("fromCityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_toCityId_fkey" FOREIGN KEY ("toCityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_rangeCityId_fkey" FOREIGN KEY ("rangeCityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTag" ADD CONSTRAINT "ServiceTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTag" ADD CONSTRAINT "ServiceTag_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeature" ADD CONSTRAINT "ServiceFeature_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
