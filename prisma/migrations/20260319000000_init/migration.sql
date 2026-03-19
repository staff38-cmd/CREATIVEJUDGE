-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "filePath" TEXT,
    "textContent" TEXT,
    "sourceUrl" TEXT,
    "submittedAt" TEXT NOT NULL,
    "complianceResult" JSONB,
    "customRegulations" TEXT,
    "targetCategory" TEXT,
    "projectId" TEXT,
    "media" TEXT,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyRegulations" TEXT,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "clientId" TEXT,
    "description" TEXT,
    "createdAt" TEXT NOT NULL,
    "sheetUrl" TEXT,
    "ngSheetUrl" TEXT,
    "companyRegulations" TEXT,
    "companyRegulationsFileName" TEXT,
    "companyRegulationsFileContent" TEXT,
    "productDetails" TEXT,
    "productDetailsFileName" TEXT,
    "ngCases" JSONB NOT NULL DEFAULT '[]',
    "allowedCases" JSONB NOT NULL DEFAULT '[]',
    "checkMode" TEXT NOT NULL DEFAULT 'soft',
    "ngSheetFormat" TEXT NOT NULL DEFAULT 'rl',

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrSheetSync" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lastSyncRow" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TEXT,

    CONSTRAINT "CrSheetSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "projectName" TEXT,
    "media" TEXT NOT NULL,
    "crType" TEXT NOT NULL,
    "checkerName" TEXT NOT NULL,
    "reviewerName" TEXT,
    "checkResults" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "ChecklistSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaRegulation" (
    "media" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "MediaRegulation_pkey" PRIMARY KEY ("media")
);

-- CreateIndex
CREATE INDEX "Work_projectId_idx" ON "Work"("projectId");

-- CreateIndex
CREATE INDEX "Work_submittedAt_idx" ON "Work"("submittedAt");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CrSheetSync_projectId_key" ON "CrSheetSync"("projectId");

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrSheetSync" ADD CONSTRAINT "CrSheetSync_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
