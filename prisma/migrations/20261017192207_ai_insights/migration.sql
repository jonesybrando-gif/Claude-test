-- CreateTable
CREATE TABLE "public"."AiInsight" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "rangeFrom" TEXT NOT NULL,
    "rangeTo" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInsight_clientId_kind_createdAt_idx" ON "public"."AiInsight"("clientId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AiInsight" ADD CONSTRAINT "AiInsight_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
