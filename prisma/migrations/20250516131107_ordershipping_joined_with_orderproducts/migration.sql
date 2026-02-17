-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_orderShippingId_fkey" FOREIGN KEY ("orderShippingId") REFERENCES "OrderShipping"("id") ON DELETE SET NULL ON UPDATE CASCADE;
