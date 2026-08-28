ALTER TABLE "ProcessingRun" ADD COLUMN "orchestrationRunId" TEXT;

CREATE INDEX "ProcessingRun_orchestrationRunId_idx"
ON "ProcessingRun"("orchestrationRunId");
