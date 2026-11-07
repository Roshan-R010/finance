CREATE TABLE "cash_cutover" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "started_at" TEXT NOT NULL,
  "effective_date" TEXT NOT NULL,
  "actor_id" UUID NOT NULL,
  CONSTRAINT "cash_cutover_singleton" CHECK (id = 1)
);

CREATE TABLE "cash_movements" (
  "id" UUID NOT NULL PRIMARY KEY,
  "event_key" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "notes" TEXT,
  "source_id" UUID,
  "effective_date" TEXT NOT NULL,
  "managed_in_paise" BIGINT NOT NULL DEFAULT 0,
  "managed_out_paise" BIGINT NOT NULL DEFAULT 0,
  "reversal_of" UUID UNIQUE,
  "created_at" TEXT NOT NULL,
  "actor_id" UUID NOT NULL,
  CONSTRAINT "cash_managed_in_nonnegative" CHECK (managed_in_paise >= 0),
  CONSTRAINT "cash_managed_out_nonnegative" CHECK (managed_out_paise >= 0),
  CONSTRAINT "cash_movement_not_both_directions" CHECK (managed_in_paise = 0 OR managed_out_paise = 0),
  CONSTRAINT "cash_movement_reversal_fk" FOREIGN KEY ("reversal_of") REFERENCES "cash_movements"("id")
);

CREATE TABLE "cash_allocations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "movement_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "owned_delta_paise" BIGINT NOT NULL,
  "managed_delta_paise" BIGINT NOT NULL,
  CONSTRAINT "cash_allocations_movement_fk" FOREIGN KEY ("movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT,
  CONSTRAINT "cash_allocations_party_fk" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT,
  CONSTRAINT "cash_allocations_movement_party_key" UNIQUE ("movement_id", "party_id")
);

CREATE INDEX "cash_movements_effective_date_created_at_idx" ON "cash_movements"("effective_date", "created_at");
CREATE INDEX "cash_allocations_party_id_idx" ON "cash_allocations"("party_id");
