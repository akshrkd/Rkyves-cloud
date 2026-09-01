-- AlterTable
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "runtimeLogs" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServiceMetricSnapshot" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "workerId" TEXT,
    "cpuPercent" DOUBLE PRECISION,
    "memoryMb" INTEGER,
    "diskGb" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceMetricSnapshot_serviceId_recordedAt_idx" ON "ServiceMetricSnapshot"("serviceId", "recordedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceMetricSnapshot_workerId_recordedAt_idx" ON "ServiceMetricSnapshot"("workerId", "recordedAt");
