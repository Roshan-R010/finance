CREATE TABLE "cheques" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "installment_id" UUID NOT NULL,
  "scheduled_date" TEXT NOT NULL,
  "amount_paise" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "presentation_date" TEXT,
  "result_confirmed_on" TEXT,
  "result_confirmed_at" TEXT,
  "result_actor_id" UUID,
  "receipt_id" UUID,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "cheques_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cheques_amount_check" CHECK (amount_paise > 0),
  CONSTRAINT "cheques_status_check" CHECK (status IN ('PENDING','PASSED','BOUNCED'))
);
CREATE UNIQUE INDEX "cheques_installment_id_key" ON "cheques"("installment_id");
CREATE UNIQUE INDEX "cheques_receipt_id_key" ON "cheques"("receipt_id");
CREATE INDEX "cheques_scheduled_date_status_idx" ON "cheques"("scheduled_date","status");
CREATE INDEX "cheques_status_scheduled_date_idx" ON "cheques"("status","scheduled_date");
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_result_actor_id_fkey" FOREIGN KEY ("result_actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cheques" ENABLE ROW LEVEL SECURITY;

-- Existing confirmed payments remain receipts; they are not inferred to be Passed bank results.
-- Only still-open self-managed installments receive a scheduled cheque record.
INSERT INTO "cheques" ("id","account_id","installment_id","scheduled_date","amount_paise","status","created_at","updated_at")
SELECT gen_random_uuid(), i.account_id, i.id, i.due_date, i.amount_paise, 'PENDING', NOW()::text, NOW()::text
FROM "installments" i
JOIN "accounts" a ON a.id=i.account_id
WHERE a.type IN ('SOLO_SELF_MANAGED','JOINT_SELF_MANAGED')
  AND a.status='ACTIVE'
  AND COALESCE((
    SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END)
    FROM "receipts" r WHERE r.installment_id=i.id
  ),0) < i.amount_paise;
