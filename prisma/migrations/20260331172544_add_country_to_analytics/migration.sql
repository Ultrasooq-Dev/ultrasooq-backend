-- AlterTable
ALTER TABLE "analytics_event" ADD COLUMN     "country" VARCHAR(3);

-- AlterTable
ALTER TABLE "visitor_session" ADD COLUMN     "country" VARCHAR(3);
