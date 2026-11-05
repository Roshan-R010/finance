ALTER TABLE "parties" ADD COLUMN "address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "parties" ADD COLUMN "contact_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "parties" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "parties" ADD COLUMN "organization_id" UUID;
ALTER TABLE "parties" ADD CONSTRAINT "parties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "parties_organization_id_idx" ON "parties"("organization_id");
