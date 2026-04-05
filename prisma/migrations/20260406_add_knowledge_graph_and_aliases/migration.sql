-- Add aliases to Brand
ALTER TABLE "Brand" ADD COLUMN "aliases" JSONB;

-- Add aliases to Category
ALTER TABLE "Category" ADD COLUMN "aliases" JSONB;

-- Add searchTokens to Product
ALTER TABLE "Product" ADD COLUMN "searchTokens" TEXT;

-- CreateTable use_case_mappings
CREATE TABLE "use_case_mappings" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "useCase" VARCHAR(100) NOT NULL,
    "impliedSpecs" JSONB NOT NULL,
    "impliedTags" JSONB,
    "weight" DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "use_case_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable compatibility_rules
CREATE TABLE "compatibility_rules" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "vehicleMake" VARCHAR(100),
    "vehicleModel" VARCHAR(100),
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "deviceBrand" VARCHAR(100),
    "deviceModel" VARCHAR(100),
    "compatType" VARCHAR(20) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "compatibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable accessory_links
CREATE TABLE "accessory_links" (
    "id" SERIAL NOT NULL,
    "sourceCategoryId" INTEGER NOT NULL,
    "accessoryCategoryId" INTEGER NOT NULL,
    "strength" DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    "bidirectional" BOOLEAN NOT NULL DEFAULT false,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accessory_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable term_disambiguations
CREATE TABLE "term_disambiguations" (
    "id" SERIAL NOT NULL,
    "term" VARCHAR(100) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "resolvedMeaning" VARCHAR(200) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "term_disambiguations_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "use_case_mappings_categoryId_idx" ON "use_case_mappings"("categoryId");
CREATE INDEX "use_case_mappings_useCase_idx" ON "use_case_mappings"("useCase");
CREATE UNIQUE INDEX "use_case_mappings_categoryId_useCase_key" ON "use_case_mappings"("categoryId", "useCase");

CREATE INDEX "compatibility_rules_productId_idx" ON "compatibility_rules"("productId");
CREATE INDEX "compatibility_rules_vehicleMake_vehicleModel_idx" ON "compatibility_rules"("vehicleMake", "vehicleModel");
CREATE INDEX "compatibility_rules_deviceBrand_deviceModel_idx" ON "compatibility_rules"("deviceBrand", "deviceModel");

CREATE INDEX "accessory_links_sourceCategoryId_idx" ON "accessory_links"("sourceCategoryId");
CREATE UNIQUE INDEX "accessory_links_sourceCategoryId_accessoryCategoryId_key" ON "accessory_links"("sourceCategoryId", "accessoryCategoryId");

CREATE INDEX "term_disambiguations_term_idx" ON "term_disambiguations"("term");
CREATE INDEX "term_disambiguations_categoryId_idx" ON "term_disambiguations"("categoryId");

-- Foreign Keys
ALTER TABLE "use_case_mappings" ADD CONSTRAINT "use_case_mappings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accessory_links" ADD CONSTRAINT "accessory_links_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accessory_links" ADD CONSTRAINT "accessory_links_accessoryCategoryId_fkey" FOREIGN KEY ("accessoryCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "term_disambiguations" ADD CONSTRAINT "term_disambiguations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
