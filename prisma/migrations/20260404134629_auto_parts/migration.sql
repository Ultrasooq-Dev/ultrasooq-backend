-- CreateTable
CREATE TABLE "scraped_auto_part" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER,
    "partNumber" TEXT NOT NULL,
    "partNumberAlt" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "nameOriginal" TEXT,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "msrp" DECIMAL(10,2),
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "partGroup" TEXT,
    "vehicles" JSONB NOT NULL DEFAULT '[]',
    "fitmentNotes" TEXT,
    "images" JSONB DEFAULT '[]',
    "diagramId" TEXT,
    "diagramPosition" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "brand" TEXT,
    "isGenuine" BOOLEAN NOT NULL DEFAULT true,
    "inStock" BOOLEAN,
    "stockQuantity" INTEGER,
    "leadTime" TEXT,
    "crossReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supersededBy" TEXT,
    "interchangeWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ScrapedProductStatus" NOT NULL DEFAULT 'RAW',
    "translatedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "productId" INTEGER,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraped_auto_part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts_diagram" (
    "id" SERIAL NOT NULL,
    "diagramId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "svgUrl" TEXT,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleYear" INTEGER,
    "vehicleEngine" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "parts" JSONB NOT NULL DEFAULT '[]',
    "sourceUrl" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_diagram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scraped_auto_part_sourceUrl_key" ON "scraped_auto_part"("sourceUrl");

-- CreateIndex
CREATE INDEX "scraped_auto_part_partNumber_idx" ON "scraped_auto_part"("partNumber");

-- CreateIndex
CREATE INDEX "scraped_auto_part_sourcePlatform_status_idx" ON "scraped_auto_part"("sourcePlatform", "status");

-- CreateIndex
CREATE INDEX "scraped_auto_part_category_subcategory_idx" ON "scraped_auto_part"("category", "subcategory");

-- CreateIndex
CREATE INDEX "scraped_auto_part_jobId_idx" ON "scraped_auto_part"("jobId");

-- CreateIndex
CREATE INDEX "scraped_auto_part_productId_idx" ON "scraped_auto_part"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "parts_diagram_diagramId_key" ON "parts_diagram"("diagramId");

-- CreateIndex
CREATE INDEX "parts_diagram_vehicleMake_vehicleModel_idx" ON "parts_diagram"("vehicleMake", "vehicleModel");

-- CreateIndex
CREATE INDEX "parts_diagram_sourcePlatform_idx" ON "parts_diagram"("sourcePlatform");

-- CreateIndex
CREATE INDEX "parts_diagram_category_idx" ON "parts_diagram"("category");

-- AddForeignKey
ALTER TABLE "scraped_auto_part" ADD CONSTRAINT "scraped_auto_part_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "scraping_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraped_auto_part" ADD CONSTRAINT "scraped_auto_part_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
