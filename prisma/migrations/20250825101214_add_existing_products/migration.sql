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
    "addedBy" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_placeOfOriginId_fkey" FOREIGN KEY ("placeOfOriginId") REFERENCES "CountryList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProductTags" ADD CONSTRAINT "ExistingProductTags_existingProductId_fkey" FOREIGN KEY ("existingProductId") REFERENCES "ExistingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProductTags" ADD CONSTRAINT "ExistingProductTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
