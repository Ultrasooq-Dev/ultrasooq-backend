-- AlterTable
ALTER TABLE "RoomParticipants" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoomParticipants" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- Remove duplicates before adding unique constraint
DELETE FROM "RoomParticipants" a USING "RoomParticipants" b
WHERE a.id > b.id AND a."userId" = b."userId" AND a."roomId" = b."roomId";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RoomParticipants_userId_roomId_key" ON "RoomParticipants"("userId", "roomId");
