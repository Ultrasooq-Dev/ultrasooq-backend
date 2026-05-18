-- Sync DB to current schema after PR #5 (multi-account model) + dead-table cleanup.
--
-- Adds:
--   - User.lastActiveAccountId  (persists last-active sub-account for restore-on-login)
--   - User.email NULL           (org sub-accounts of COMPANY/FREELANCER keep email=NULL)
--
-- Drops dead analytics/log tables not referenced by any model:
--   AnalyticsDailyRollup, ErrorLog, OrderEvent, PerformanceMetric, VisitorSession

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAccountId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- DropTable
DROP TABLE "AnalyticsDailyRollup";

-- DropTable
DROP TABLE "ErrorLog";

-- DropTable
DROP TABLE "OrderEvent";

-- DropTable
DROP TABLE "PerformanceMetric";

-- DropTable
DROP TABLE "VisitorSession";
