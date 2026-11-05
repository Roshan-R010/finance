-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "roles" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "arrangement" TEXT NOT NULL,
    "borrower_id" UUID,
    "manager_id" UUID,
    "face_paise" BIGINT NOT NULL,
    "interest_paise" BIGINT NOT NULL,
    "net_paise" BIGINT NOT NULL,
    "rate_text" TEXT NOT NULL,
    "rounding_policy" TEXT NOT NULL,
    "agreement_date" TEXT NOT NULL,
    "funded_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "input_basis" TEXT NOT NULL,
    "entered_paise" BIGINT NOT NULL,
    "face_paise" BIGINT NOT NULL,
    "net_paise" BIGINT NOT NULL,
    "profit_paise" BIGINT NOT NULL,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "due_date" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "manually_overridden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheques" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "cheque_date" TEXT NOT NULL,
    "deposit_date" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "deposited_at" TEXT,
    "cleared_at" TEXT,
    "bounced_at" TEXT,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "installment_id" UUID,
    "cheque_id" UUID,
    "source" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "received_date" TEXT NOT NULL,
    "external_ref" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "reversal_of" UUID,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "paid_date" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,

    CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_keys" (
    "key" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "response_json" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "request_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_reference_key" ON "accounts"("reference");

-- CreateIndex
CREATE INDEX "accounts_type_arrangement_idx" ON "accounts"("type", "arrangement");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_account_id_party_id_key" ON "contributions"("account_id", "party_id");

-- CreateIndex
CREATE INDEX "installments_due_date_account_id_idx" ON "installments"("due_date", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "installments_account_id_sequence_no_key" ON "installments"("account_id", "sequence_no");

-- CreateIndex
CREATE INDEX "cheques_deposit_date_status_idx" ON "cheques"("deposit_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cheques_account_id_number_key" ON "cheques"("account_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_cheque_id_key" ON "receipts"("cheque_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_reversal_of_key" ON "receipts"("reversal_of");

-- CreateIndex
CREATE INDEX "receipts_account_id_installment_id_idx" ON "receipts"("account_id", "installment_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reversal_of_fkey" FOREIGN KEY ("reversal_of") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Financial invariants and Supabase Data API protection. The app connects server-side with Postgres credentials.
ALTER TABLE "parties" ADD CONSTRAINT "parties_kind_check" CHECK (kind IN ('PERSON','ORGANIZATION'));
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_amounts_check" CHECK (face_paise > 0 AND interest_paise >= 0 AND net_paise >= 0 AND face_paise = interest_paise + net_paise);
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_amounts_check" CHECK (entered_paise >= 0 AND face_paise >= 0 AND net_paise >= 0 AND profit_paise >= 0 AND face_paise = net_paise + profit_paise);
ALTER TABLE "installments" ADD CONSTRAINT "installments_amount_check" CHECK (amount_paise > 0);
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_amount_check" CHECK (amount_paise > 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_amount_check" CHECK (amount_paise > 0);
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_amount_check" CHECK (amount_paise > 0);
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "installments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cheques" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "distributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "request_keys" ENABLE ROW LEVEL SECURITY;
