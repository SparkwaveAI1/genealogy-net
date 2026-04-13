# Supabase Schema Update Required

## New Table: document_people

This table is needed to link documents to people identified in them.

```sql
CREATE TABLE IF NOT EXISTS document_people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL, -- Gramps ID (e.g., "I0001")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(document_id, person_id)
);

-- Create index for faster lookups
CREATE INDEX idx_document_people_document ON document_people(document_id);
CREATE INDEX idx_document_people_person ON document_people(person_id);
```

## Usage

When a document is uploaded and analyzed:
1. Claude extracts names from the document
2. System searches Gramps for matching people
3. User confirms which matches are correct
4. Records are created in `document_people` table linking the document to those people

This allows querying:
- All documents mentioning a specific person
- All people mentioned in a specific document
