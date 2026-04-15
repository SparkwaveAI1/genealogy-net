-- Create wiki_pages table for storing wiki source pages in Supabase
-- This replaces the filesystem-based wiki on Hetzner VPS

CREATE TABLE IF NOT EXISTS wiki_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  page_type text DEFAULT 'source',       -- 'source', 'person', 'place', 'mystery', 'concept'
  content text,                          -- full markdown content
  frontmatter jsonb,                     -- structured metadata (key_people, gramps_ids, confidence, etc.)
  storage_path text,                     -- original file path in Supabase Storage (for reference)
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_slug ON wiki_pages(slug);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_document_id ON wiki_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_page_type ON wiki_pages(page_type);
