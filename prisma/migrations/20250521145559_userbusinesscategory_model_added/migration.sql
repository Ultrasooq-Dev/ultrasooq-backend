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
