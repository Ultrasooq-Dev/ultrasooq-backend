-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "fromCountryId" INTEGER,
ADD COLUMN     "fromStateId" INTEGER,
ADD COLUMN     "rangeCountryId" INTEGER,
ADD COLUMN     "rangeStateId" INTEGER,
ADD COLUMN     "toCountryId" INTEGER,
ADD COLUMN     "toStateId" INTEGER;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_fromStateId_fkey" FOREIGN KEY ("fromStateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_fromCountryId_fkey" FOREIGN KEY ("fromCountryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_toStateId_fkey" FOREIGN KEY ("toStateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_toCountryId_fkey" FOREIGN KEY ("toCountryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_rangeStateId_fkey" FOREIGN KEY ("rangeStateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_rangeCountryId_fkey" FOREIGN KEY ("rangeCountryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
