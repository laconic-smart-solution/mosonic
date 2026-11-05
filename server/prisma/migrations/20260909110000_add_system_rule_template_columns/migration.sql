-- AlterTable
ALTER TABLE "rules" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rules" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rules" ADD COLUMN "templateCategory" TEXT;

-- CreateIndex
CREATE INDEX "rules_isSystem_isTemplate_status_idx" ON "rules"("isSystem", "isTemplate", "status");
