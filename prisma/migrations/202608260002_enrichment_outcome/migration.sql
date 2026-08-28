CREATE TYPE "EnrichmentStatus" AS ENUM ('NOT_ATTEMPTED', 'SUCCEEDED', 'NOT_FOUND', 'FAILED');

ALTER TABLE "LeadProperty"
  ADD COLUMN "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
  ADD COLUMN "enrichmentSource" TEXT,
  ADD COLUMN "enrichmentErrorCode" TEXT,
  ADD COLUMN "enrichedAt" TIMESTAMP(3);
