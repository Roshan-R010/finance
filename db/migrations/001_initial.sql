-- Initial MySQL schema. Amounts are paise; dates are local business dates.
-- Apply only to a dedicated development database after review.
CREATE TABLE parties (
  id CHAR(36) PRIMARY KEY,
  kind VARCHAR(20) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255), phone VARCHAR(50), address TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT ck_party_kind CHECK (kind IN ('PERSON','ORGANIZATION'))
) ENGINE=InnoDB;
CREATE TABLE loan_accounts (
  id CHAR(36) PRIMARY KEY,
  loan_reference VARCHAR(80) NOT NULL UNIQUE,
  account_type VARCHAR(32) NOT NULL,
  arrangement VARCHAR(40) NOT NULL,
  borrower_party_id CHAR(36), external_manager_party_id CHAR(36),
  owner_party_id CHAR(36) NOT NULL,
  face_paise BIGINT NOT NULL, interest_paise BIGINT NOT NULL, net_cash_paise BIGINT NOT NULL,
  rate_numerator BIGINT NOT NULL, rate_denominator BIGINT NOT NULL,
  rounding_policy VARCHAR(20) NOT NULL, calculation_version INT NOT NULL,
  agreement_date DATE NOT NULL, status VARCHAR(30) NOT NULL,
  version INT NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
  FOREIGN KEY (borrower_party_id) REFERENCES parties(id),
  FOREIGN KEY (external_manager_party_id) REFERENCES parties(id),
  FOREIGN KEY (owner_party_id) REFERENCES parties(id),
  CONSTRAINT ck_loan_amounts CHECK (face_paise > 0 AND interest_paise >= 0 AND net_cash_paise >= 0 AND face_paise = interest_paise + net_cash_paise),
  INDEX idx_loan_type_status (account_type,status), INDEX idx_loan_borrower (borrower_party_id)
) ENGINE=InnoDB;
CREATE TABLE loan_contributions (
  id CHAR(36) PRIMARY KEY, loan_id CHAR(36) NOT NULL, party_id CHAR(36) NOT NULL,
  input_basis VARCHAR(20) NOT NULL, entered_paise BIGINT NOT NULL,
  face_paise BIGINT NOT NULL, net_cash_paise BIGINT NOT NULL, expected_profit_paise BIGINT NOT NULL,
  FOREIGN KEY (loan_id) REFERENCES loan_accounts(id), FOREIGN KEY (party_id) REFERENCES parties(id),
  UNIQUE KEY uq_loan_contributor (loan_id,party_id),
  CONSTRAINT ck_contribution_amounts CHECK (entered_paise >= 0 AND face_paise >= 0 AND net_cash_paise >= 0 AND expected_profit_paise >= 0 AND face_paise = net_cash_paise + expected_profit_paise)
) ENGINE=InnoDB;
CREATE TABLE installments (
  id CHAR(36) PRIMARY KEY, loan_id CHAR(36) NOT NULL, sequence_no INT NOT NULL,
  due_date DATE NOT NULL, amount_paise BIGINT NOT NULL, manually_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  version INT NOT NULL DEFAULT 1,
  FOREIGN KEY (loan_id) REFERENCES loan_accounts(id), UNIQUE KEY uq_installment_sequence (loan_id,sequence_no),
  CONSTRAINT ck_installment_amount CHECK (amount_paise > 0), INDEX idx_installment_due (due_date,loan_id)
) ENGINE=InnoDB;
CREATE TABLE audit_events (
  id CHAR(36) PRIMARY KEY, actor_id CHAR(36) NOT NULL, entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NOT NULL, action VARCHAR(80) NOT NULL, occurred_at DATETIME(3) NOT NULL,
  reason TEXT, metadata JSON, INDEX idx_audit_entity (entity_type,entity_id,occurred_at)
) ENGINE=InnoDB;
