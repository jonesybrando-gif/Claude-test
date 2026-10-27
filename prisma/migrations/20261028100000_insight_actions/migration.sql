-- What the agency did with each AI recommendation
CREATE TABLE "InsightStatus" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InsightStatus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InsightStatus_clientId_fingerprint_key" ON "InsightStatus"("clientId", "fingerprint");
ALTER TABLE "InsightStatus" ADD CONSTRAINT "InsightStatus_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Next steps the agency approves for the client
CREATE TABLE "NextStep" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT,
    "sourceText" TEXT,
    "targetDate" DATE,
    "doneOn" DATE,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NextStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NextStep_clientId_status_idx" ON "NextStep"("clientId", "status");
ALTER TABLE "NextStep" ADD CONSTRAINT "NextStep_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
