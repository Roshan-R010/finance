-- DropForeignKey
ALTER TABLE "cheques" DROP CONSTRAINT "cheques_account_id_fkey";

-- DropForeignKey
ALTER TABLE "cheques" DROP CONSTRAINT "cheques_installment_id_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_cheque_id_fkey";

-- DropIndex
DROP INDEX "receipts_cheque_id_key";

-- AlterTable
ALTER TABLE "receipts" DROP COLUMN "cheque_id";

-- DropTable
DROP TABLE "cheques";

-- CreateTable
CREATE TABLE "installment_decisions" (
    "installment_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_on" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "installment_decisions_pkey" PRIMARY KEY ("installment_id")
);

-- AddForeignKey
ALTER TABLE "installment_decisions" ADD CONSTRAINT "installment_decisions_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_decisions" ADD CONSTRAINT "installment_decisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "installment_decisions" ADD CONSTRAINT "installment_decisions_decision_check" CHECK (decision IN ('PAID','UNPAID'));
ALTER TABLE "installment_decisions" ENABLE ROW LEVEL SECURITY;
