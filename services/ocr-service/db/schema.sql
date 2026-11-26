-- ============================================================================
-- Project Arrow · R3 Representative OCR & Activity Data Schema (PostgreSQL)
-- Compatible with Supabase / PostgreSQL 15+
-- ============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ocr_drafts
-- Stores every OCR extraction in PENDING_REVIEW until a human confirms/rejects.
-- Policy: No unconfirmed OCR value enters confirmed_utility_bills.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocr_drafts (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id                 VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 evidence fingerprint
    property_id                 VARCHAR(64),                 -- Hotel / site identifier
    document_type               VARCHAR(32) NOT NULL,        -- electricity_bill, water_bill, lpg_receipt, generator_fuel, meter_reading
    status                      VARCHAR(32) NOT NULL DEFAULT 'pending_review',
    overall_confidence          NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
    requires_human_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
    fields                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    low_confidence_fields       JSONB NOT NULL DEFAULT '[]'::jsonb,
    quality_assessment          JSONB,
    raw_full_text               TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ocr_drafts_status CHECK (
        status IN ('pending', 'draft', 'pending_review', 'flagged_for_review', 'confirmed', 'rejected', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_ocr_drafts_status ON ocr_drafts (status);
CREATE INDEX IF NOT EXISTS idx_ocr_drafts_document_type ON ocr_drafts (document_type);
CREATE INDEX IF NOT EXISTS idx_ocr_drafts_created_at ON ocr_drafts (created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. confirmed_utility_bills
-- Immutable ledger of human-verified utility bills ready for GHG calculation
-- and Polygon Amoy anchoring.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS confirmed_utility_bills (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id             UUID REFERENCES ocr_drafts (id) ON DELETE RESTRICT,
    document_id          VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 evidence hash
    property_id          VARCHAR(64),
    document_type        VARCHAR(32) NOT NULL,
    account_number       VARCHAR(64),
    billing_period       VARCHAR(64),
    units_kwh            NUMERIC(14, 4),
    units_m3             NUMERIC(14, 4),
    quantity_kg_or_liters NUMERIC(14, 4),
    fuel_type            VARCHAR(32),
    total_amount_lkr     NUMERIC(14, 2),
    verified_fields      JSONB NOT NULL DEFAULT '{}'::jsonb,
    was_amended          BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_by         VARCHAR(128) NOT NULL,
    confirmed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ledger_anchor_tx     VARCHAR(128),                -- Optional blockchain tx hash
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confirmed_bills_type ON confirmed_utility_bills (document_type);
CREATE INDEX IF NOT EXISTS idx_confirmed_bills_period ON confirmed_utility_bills (billing_period);
CREATE INDEX IF NOT EXISTS idx_confirmed_bills_confirmed_at ON confirmed_utility_bills (confirmed_at DESC);

-- ----------------------------------------------------------------------------
-- 3. manual_activity_entries
-- Stores manual sub-meter readings, LPG cylinder refills, Scope 3 activities,
-- and legacy TTVC Excel workbook imports.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_activity_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_hash    VARCHAR(64) NOT NULL,            -- SHA-256 of payload / imported file
    property_id      VARCHAR(64),
    entry_source     VARCHAR(32) NOT NULL DEFAULT 'manual', -- manual | excel_import
    category         VARCHAR(64) NOT NULL,            -- sub_meter_electricity, sub_meter_water, lpg_refill, waste_haulage, outsourced_laundry, guest_transport
    scope            VARCHAR(16) NOT NULL,            -- Scope 1 | Scope 2 | Scope 3
    quantity         NUMERIC(14, 4) NOT NULL,
    unit             VARCHAR(32) NOT NULL,            -- kWh, m3, kg, km, cylinders
    activity_date    DATE NOT NULL,
    reference_label  VARCHAR(128),                    -- e.g. cylinder size, meter name, workbook filename
    notes            TEXT,
    submitted_by     VARCHAR(128) NOT NULL,
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status      VARCHAR(24) NOT NULL DEFAULT 'synced',

    CONSTRAINT chk_manual_source CHECK (entry_source IN ('manual', 'excel_import')),
    CONSTRAINT chk_manual_scope CHECK (scope IN ('Scope 1', 'Scope 2', 'Scope 3'))
);

CREATE INDEX IF NOT EXISTS idx_manual_entries_category ON manual_activity_entries (category);
CREATE INDEX IF NOT EXISTS idx_manual_entries_date ON manual_activity_entries (activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_manual_entries_submitted_at ON manual_activity_entries (submitted_at DESC);

-- ----------------------------------------------------------------------------
-- 4. audit_logs
-- Append-only audit trail for every HITL review, amendment, manual entry,
-- and Excel import action.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type    VARCHAR(48) NOT NULL,              -- ocr_draft, confirmed_utility_bill, manual_activity_entry
    entity_id      VARCHAR(128) NOT NULL,
    action         VARCHAR(48) NOT NULL,              -- extracted, approved, amended, rejected, manual_submitted, excel_imported
    actor_id       VARCHAR(128) NOT NULL,
    evidence_hash  VARCHAR(64),
    previous_state JSONB,
    new_state      JSONB,
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
