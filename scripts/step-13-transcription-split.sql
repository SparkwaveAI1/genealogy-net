-- Step 13: Split transcription from analysis
-- Run this in your Supabase SQL editor
--
-- This migration:
-- 1. Adds a transcription column to store verbatim extracted document text
-- 2. Deletes all existing testing data (clean slate for production use)
--
-- After this change:
-- - transcription: holds verbatim extracted text only
-- - raw_text: holds GPS analysis output only (no more "EXTRACTED TEXT:" prefix)

-- ============================================================================
-- STEP 1: Add transcription column
-- ============================================================================
-- This is the actual schema change. Separates verbatim OCR/text extraction
-- from AI-generated GPS analysis summary.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS transcription TEXT;

-- ============================================================================
-- STEP 2: Delete all testing data (clean slate)
-- ============================================================================
-- All data in this database is from April 2026 testing. Scott confirmed
-- expendable on 2026-04-29. FK constraints require specific delete order.
--
-- Schema introspection on 2026-05-02 found:
-- - mystery_evidence: 1 orphan row (mystery_id IS NULL)
-- - mysteries: 2 duplicate "Robert Benjamin Johnson" test rows
-- - wiki_pages: 2 test pages linked to test documents
-- - events: 47 rows with document_id FK (NO ACTION constraint)
-- - documents: 18 test uploads
--
-- CASCADE FKs (auto-deleted with documents): attachments, extracted_relationships,
-- document_locations, extraction_files, document_name_registry, citations

-- (a) mystery_evidence: 1 orphan test row with NULL mystery_id
--     No FK dependency; can delete first
DELETE FROM mystery_evidence;

-- (b) mysteries: 2 duplicate test rows ("Parents of Robert Benjamin Johnson")
--     mystery_evidence.mystery_id references this, but we already deleted that
DELETE FROM mysteries;

-- (c) wiki_pages: 2 test pages created during document analysis testing
--     document_id FK is SET NULL, but we're nuking them entirely
DELETE FROM wiki_pages;

-- (d) events: 47 test rows derived from test document analysis
--     document_id FK is NO ACTION — must delete BEFORE documents or DELETE fails
DELETE FROM events;

-- (e) documents: 18 test uploads (Looney pension tests, duplicate PDFs, etc.)
--     CASCADE FKs auto-delete: attachments (0), extracted_relationships (0),
--     document_locations (0), extraction_files (0), document_name_registry (0),
--     citations (0) — all currently empty but handled automatically
DELETE FROM documents;

-- ============================================================================
-- STEP 3: Manual storage bucket cleanup required
-- ============================================================================
-- This SQL migration cannot delete files from Supabase Storage.
-- After running this migration, manually delete files from Supabase Storage:
--
--   Option A (Dashboard):
--     1. Go to Supabase Dashboard > Storage > documents bucket
--     2. Delete contents of raw/ directory
--
--   Option B (CLI):
--     supabase storage rm -r 'documents/raw/*'
--
-- The 18 deleted document records reference files like:
--   raw/2026-04-15-looney-war.txt
--   raw/2026-04-15-test-looney.txt
--   etc.
