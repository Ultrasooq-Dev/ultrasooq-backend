-- AddForeignKey
ALTER TABLE "OrderShipping" ADD CONSTRAINT "OrderShipping_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
