-- ============================================
-- NOTIFICATION SYSTEM - DATABASE MIGRATION
-- ============================================
-- 
-- IMPORTANT: This migration is for reference only.
-- The Notification model has been added to Prisma schema.
-- Run: npx prisma migrate dev --name add_notification_model
-- 
-- ============================================

-- The Notification model is now in schema.prisma
-- Run Prisma migration to create the table:
-- npx prisma migrate dev --name add_notification_model

-- Or if you prefer raw SQL, here's the equivalent:

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "data" JSONB,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "link" VARCHAR(500),
  "icon" VARCHAR(100),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_type_idx" ON "Notification"("type");
CREATE INDEX IF NOT EXISTS "Notification_read_idx" ON "Notification"("read");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

