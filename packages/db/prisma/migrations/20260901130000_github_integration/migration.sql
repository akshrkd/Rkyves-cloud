-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubRepoLink" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "webhookId" INTEGER,
    "webhookSecret" TEXT NOT NULL,

    CONSTRAINT "GitHubRepoLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallation_organizationId_key" ON "GitHubInstallation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubRepoLink_serviceId_key" ON "GitHubRepoLink"("serviceId");

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubRepoLink" ADD CONSTRAINT "GitHubRepoLink_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
