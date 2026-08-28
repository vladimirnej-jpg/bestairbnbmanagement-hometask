CREATE TYPE "UserRole" AS ENUM ('OPS', 'MONITOR');
CREATE TYPE "LifecycleStatus" AS ENUM ('INCOMING', 'SCHEDULED_INITIAL_APPOINTMENT', 'WARM', 'GONE_COLD');
CREATE TYPE "QualificationStatus" AS ENUM ('NEEDS_INFO', 'NEEDS_REVIEW', 'QUALIFIED', 'OUT_OF_ZONE');
CREATE TYPE "ShowcaseStatus" AS ENUM ('NOT_READY', 'READY', 'BLOCKED', 'DRAFT_CREATED', 'FAILED');
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'USER');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "MatchType" AS ENUM ('EXACT_ADDRESS', 'CONTACT_HISTORY', 'AMBIGUOUS');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactName" TEXT,
    "lifecycleStatus" "LifecycleStatus" NOT NULL DEFAULT 'INCOMING',
    "qualificationStatus" "QualificationStatus" NOT NULL DEFAULT 'NEEDS_INFO',
    "qualificationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadMessage" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadProperty" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "rawAddress" TEXT NOT NULL,
    "normalizedStreet" TEXT,
    "normalizedHouseNumber" TEXT,
    "normalizedCity" TEXT,
    "normalizedPostcode" TEXT,
    "canonicalAddress" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "masterPropertyId" TEXT,
    "manuallyConfirmedAt" TIMESTAMP(3),
    CONSTRAINT "LeadProperty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterProperty" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google-sheets',
    "externalId" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "normalizedStreet" TEXT,
    "normalizedHouseNumber" TEXT,
    "normalizedCity" TEXT,
    "normalizedPostcode" TEXT,
    "contactEmail" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isMissing" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MasterProperty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyMatchCandidate" (
    "id" TEXT NOT NULL,
    "leadPropertyId" TEXT NOT NULL,
    "masterPropertyId" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyMatchCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceZone" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google-sheets',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "normalizedCity" TEXT,
    "postcodePrefixes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isMissing" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ServiceZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'google-sheets',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isMissing" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZoneService" (
    "id" TEXT NOT NULL,
    "serviceZoneId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ZoneService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterDataSyncRun" (
    "id" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "propertyCount" INTEGER NOT NULL DEFAULT 0,
    "zoneCount" INTEGER NOT NULL DEFAULT 0,
    "serviceCount" INTEGER NOT NULL DEFAULT 0,
    "assignmentCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MasterDataSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_leases" (
    "lease_key" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sync_leases_pkey" PRIMARY KEY ("lease_key")
);

CREATE TABLE "Showcase" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "ShowcaseStatus" NOT NULL DEFAULT 'NOT_READY',
    "blockingReason" TEXT,
    "structuredContent" JSONB,
    "renderedHtml" TEXT,
    "gmailDraftId" TEXT,
    "manuallyEditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Showcase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessingRun" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorDetails" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "tokenUsage" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessingRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LifecycleEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatus" "LifecycleStatus",
    "toStatus" "LifecycleStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Lead_gmailThreadId_key" ON "Lead"("gmailThreadId");
CREATE INDEX "Lead_lifecycleStatus_updatedAt_idx" ON "Lead"("lifecycleStatus", "updatedAt");
CREATE INDEX "Lead_qualificationStatus_updatedAt_idx" ON "Lead"("qualificationStatus", "updatedAt");
CREATE UNIQUE INDEX "LeadMessage_gmailMessageId_key" ON "LeadMessage"("gmailMessageId");
CREATE INDEX "LeadMessage_leadId_receivedAt_idx" ON "LeadMessage"("leadId", "receivedAt");
CREATE UNIQUE INDEX "LeadProperty_leadId_key" ON "LeadProperty"("leadId");
CREATE INDEX "LeadProperty_normalizedPostcode_normalizedStreet_normalized_idx" ON "LeadProperty"("normalizedPostcode", "normalizedStreet", "normalizedHouseNumber");
CREATE UNIQUE INDEX "MasterProperty_source_externalId_key" ON "MasterProperty"("source", "externalId");
CREATE INDEX "MasterProperty_normalizedPostcode_normalizedStreet_normaliz_idx" ON "MasterProperty"("normalizedPostcode", "normalizedStreet", "normalizedHouseNumber");
CREATE INDEX "PropertyMatchCandidate_leadPropertyId_reviewStatus_idx" ON "PropertyMatchCandidate"("leadPropertyId", "reviewStatus");
CREATE UNIQUE INDEX "ServiceZone_source_externalId_key" ON "ServiceZone"("source", "externalId");
CREATE INDEX "ServiceZone_isActive_idx" ON "ServiceZone"("isActive");
CREATE UNIQUE INDEX "Service_source_externalId_key" ON "Service"("source", "externalId");
CREATE INDEX "Service_isActive_idx" ON "Service"("isActive");
CREATE UNIQUE INDEX "ZoneService_serviceZoneId_serviceId_key" ON "ZoneService"("serviceZoneId", "serviceId");
CREATE INDEX "ZoneService_serviceZoneId_isActive_idx" ON "ZoneService"("serviceZoneId", "isActive");
CREATE INDEX "MasterDataSyncRun_status_startedAt_idx" ON "MasterDataSyncRun"("status", "startedAt");
CREATE INDEX "sync_leases_expires_at_idx" ON "sync_leases"("expires_at");
CREATE UNIQUE INDEX "Showcase_leadId_key" ON "Showcase"("leadId");
CREATE INDEX "ProcessingRun_leadId_status_createdAt_idx" ON "ProcessingRun"("leadId", "status", "createdAt");
CREATE INDEX "LifecycleEvent_leadId_timestamp_idx" ON "LifecycleEvent"("leadId", "timestamp");

ALTER TABLE "LeadMessage" ADD CONSTRAINT "LeadMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadProperty" ADD CONSTRAINT "LeadProperty_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadProperty" ADD CONSTRAINT "LeadProperty_masterPropertyId_fkey" FOREIGN KEY ("masterPropertyId") REFERENCES "MasterProperty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyMatchCandidate" ADD CONSTRAINT "PropertyMatchCandidate_leadPropertyId_fkey" FOREIGN KEY ("leadPropertyId") REFERENCES "LeadProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyMatchCandidate" ADD CONSTRAINT "PropertyMatchCandidate_masterPropertyId_fkey" FOREIGN KEY ("masterPropertyId") REFERENCES "MasterProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZoneService" ADD CONSTRAINT "ZoneService_serviceZoneId_fkey" FOREIGN KEY ("serviceZoneId") REFERENCES "ServiceZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZoneService" ADD CONSTRAINT "ZoneService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterDataSyncRun" ADD CONSTRAINT "MasterDataSyncRun_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Showcase" ADD CONSTRAINT "Showcase_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessingRun" ADD CONSTRAINT "ProcessingRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleEvent" ADD CONSTRAINT "LifecycleEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleEvent" ADD CONSTRAINT "LifecycleEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
