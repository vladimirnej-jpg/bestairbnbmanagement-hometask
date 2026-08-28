ALTER TABLE "Showcase"
ADD COLUMN "draftSyncIntentKey" TEXT,
ADD COLUMN "draftSyncIntentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Showcase_draftSyncIntentKey_key"
ON "Showcase"("draftSyncIntentKey");
