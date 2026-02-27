CREATE TABLE "SntExpense" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "createdById" INTEGER NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "purpose" TEXT NOT NULL,
  "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SntExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SntExpenseAttachment" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "expenseId" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SntExpenseAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SntExpense_tenantId_spentAt_idx" ON "SntExpense"("tenantId", "spentAt");
CREATE INDEX "SntExpenseAttachment_expenseId_createdAt_idx" ON "SntExpenseAttachment"("expenseId", "createdAt");
CREATE INDEX "SntExpenseAttachment_tenantId_createdAt_idx" ON "SntExpenseAttachment"("tenantId", "createdAt");

ALTER TABLE "SntExpense"
  ADD CONSTRAINT "SntExpense_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SntExpense"
  ADD CONSTRAINT "SntExpense_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SntExpenseAttachment"
  ADD CONSTRAINT "SntExpenseAttachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SntExpenseAttachment"
  ADD CONSTRAINT "SntExpenseAttachment_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "SntExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
