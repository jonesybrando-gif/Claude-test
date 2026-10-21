-- CreateTable
CREATE TABLE "ClientLabel" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'neutral',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClientToClientLabel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ClientToClientLabel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientLabel_agencyId_name_key" ON "ClientLabel"("agencyId", "name");

-- CreateIndex
CREATE INDEX "_ClientToClientLabel_B_index" ON "_ClientToClientLabel"("B");

-- AddForeignKey
ALTER TABLE "ClientLabel" ADD CONSTRAINT "ClientLabel_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientToClientLabel" ADD CONSTRAINT "_ClientToClientLabel_A_fkey" FOREIGN KEY ("A") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientToClientLabel" ADD CONSTRAINT "_ClientToClientLabel_B_fkey" FOREIGN KEY ("B") REFERENCES "ClientLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
