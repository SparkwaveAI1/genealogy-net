export interface Person {
  id: string
  surname?: string
  given_name?: string
  name_variants?: string
  suffix?: string
  title?: string
  designation?: string
  occupation?: string
  birth_year?: number
  birth_year_type?: 'exact' | 'circa' | 'before' | 'after'
  birth_date_confidence?: 'confirmed' | 'probable' | 'possible' | 'hypothetical'
  birthplace_code?: string
  birthplace_detail?: string
  death_year?: number
  death_year_type?: 'exact' | 'circa' | 'before' | 'after'
  death_date_confidence?: 'confirmed' | 'probable' | 'possible' | 'hypothetical'
  death_place_code?: string
  death_place_detail?: string
  burial_place?: string
  burial_notes?: string
  religion?: string
  religion_notes?: string
  confidence?: 'confirmed' | 'probable' | 'possible' | 'hypothetical'
  dna_group?: string
  dna_status?: string
  first_documented_date?: string
  bio?: string
  created_at?: string
  updated_at?: string
  bio_status?: string
  confirmed_event_count?: number
  probable_event_count?: number
  possible_event_count?: number
  confirmed_count?: number
  probable_count?: number
  possible_count?: number
  auto_created?: boolean
  needs_review?: boolean
  brick_wall?: boolean
  creation_source?: string
  creation_reason?: string
  ahnentafel?: number
  first_documented?: string
  first_documented_text?: string
  workspace_id?: string
}

export interface Event {
  id: string
  person_id: string
  event_type: 'birth' | 'death' | 'marriage' | 'baptism' | 'burial' | 'census' | 'immigration' | 'other'
  event_date?: string
  location_id?: string
  description?: string
  source_id?: string
  created_at?: string
  updated_at?: string
}

export interface Location {
  id: string
  name: string
  locality?: string
  city?: string
  county?: string
  state?: string
  country?: string
  latitude?: number
  longitude?: number
  created_at?: string
  updated_at?: string
}

export interface Source {
  id: string
  title: string
  author?: string
  publication_date?: string
  repository?: string
  call_number?: string
  url?: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface FamilyRelationship {
  id: string
  person_id: string
  related_person_id: string
  relationship_type: 'parent' | 'child' | 'spouse' | 'sibling' | 'father' | 'mother'
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface Document {
  id: string
  person_id?: string
  source_id?: string
  title: string
  document_type?: 'certificate' | 'photo' | 'letter' | 'will' | 'deed' | 'other'
  file_url?: string
  description?: string
  document_date?: string
  created_at?: string
  updated_at?: string
}

export interface DnaMatch {
  id: string
  person_id: string
  match_name: string
  relationship?: string
  shared_cm?: number
  shared_segments?: number
  testing_company?: 'ancestry' | '23andme' | 'myheritage' | 'ftdna' | 'other'
  notes?: string
  created_at?: string
  updated_at?: string
}
