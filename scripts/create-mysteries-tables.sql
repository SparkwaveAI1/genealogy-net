-- SQL to create mysteries tables
-- Run this in your Supabase SQL editor

CREATE TABLE mysteries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  core_question text,
  status text DEFAULT 'open',
  confidence text,
  hypothesis_a text,
  hypothesis_b text,
  hypothesis_c text,
  current_theory text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE mystery_evidence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mystery_id uuid REFERENCES mysteries(id) ON DELETE CASCADE,
  content text NOT NULL,
  evidence_type text,
  confidence text,
  flag text,
  source text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE mystery_people (
  mystery_id uuid REFERENCES mysteries(id) ON DELETE CASCADE,
  person_id text REFERENCES people(id) ON DELETE CASCADE,
  role text,
  PRIMARY KEY (mystery_id, person_id)
);

-- Optional: Create indexes for better query performance
CREATE INDEX idx_mystery_evidence_mystery_id ON mystery_evidence(mystery_id);
CREATE INDEX idx_mystery_people_mystery_id ON mystery_people(mystery_id);
CREATE INDEX idx_mystery_people_person_id ON mystery_people(person_id);
