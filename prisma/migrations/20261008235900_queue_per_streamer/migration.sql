-- Cada streamer pasa a tener su propia cola y su propio historial.

-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN "streamerId" TEXT;
ALTER TABLE "HistoryItem" ADD COLUMN "streamerId" TEXT;

-- Lo que ya había pertenecía a una única cola compartida: se le asigna al
-- streamer más antiguo. Si todavía no existe ninguno, no hay a quién dárselo y
-- se descarta, porque la columna no admite nulos.
UPDATE "QueueItem"
SET "streamerId" = (
  SELECT "id" FROM "User" WHERE "role" = 'streamer' ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "streamerId" IS NULL;

UPDATE "HistoryItem"
SET "streamerId" = (
  SELECT "id" FROM "User" WHERE "role" = 'streamer' ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "streamerId" IS NULL;

DELETE FROM "QueueItem" WHERE "streamerId" IS NULL;
DELETE FROM "HistoryItem" WHERE "streamerId" IS NULL;

ALTER TABLE "QueueItem" ALTER COLUMN "streamerId" SET NOT NULL;
ALTER TABLE "HistoryItem" ALTER COLUMN "streamerId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "QueueItem_streamerId_position_idx" ON "QueueItem"("streamerId", "position");

-- CreateIndex
CREATE INDEX "HistoryItem_streamerId_playedAt_idx" ON "HistoryItem"("streamerId", "playedAt");

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_streamerId_fkey" FOREIGN KEY ("streamerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryItem" ADD CONSTRAINT "HistoryItem_streamerId_fkey" FOREIGN KEY ("streamerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
