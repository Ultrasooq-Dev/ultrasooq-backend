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

-- CreateIndex
CREATE UNIQUE INDEX "PageSetting_slug_key" ON "PageSetting"("slug");
