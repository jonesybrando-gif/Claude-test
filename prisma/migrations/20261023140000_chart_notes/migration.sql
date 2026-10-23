-- Additive only: notes pinned to dates on a client's charts.
CREATE TABLE "ChartNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "taggedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChartNote_clientId_date_idx" ON "ChartNote"("clientId", "date");

ALTER TABLE "ChartNote" ADD CONSTRAINT "ChartNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
