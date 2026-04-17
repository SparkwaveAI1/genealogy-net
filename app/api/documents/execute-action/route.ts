import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'
import { updatePerson, createPerson, getPerson, grampsRequest } from '@/lib/gramps'
import path from 'path'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

// ──────────────────────────────────────────────────────────────────────────
// ARCHITECTURE NOTES:
//
// 1. DOCUMENT STORAGE (Supabase only):
//    - documents table: metadata
//    - document_people table: links documents to people
//    - mystery_evidence table: links documents to mysteries
//    - wiki_pages table: analysis results
//    - citations table: evidence citations
//    These are all Supabase-only and do NOT touch Gramps.
//
// 2. FACT UPDATES (Gramps only, optional):
//    - update_gramps: pushes confirmed facts (birth date, death date, etc.)
//      back to the Gramps tree
//    - This is SEPARATE from document storage
//    - Requires person.handle for Gramps API calls
// ──────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────
// Gramps actions — update genealogy tree with confirmed facts
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parse a date string like "about 1755", "circa 1790", "12 Mar 1847" into
 * Gramps date format: { dateval: [day, month, year, quality] }
 */
function parseDateToGramps(dateStr: string): { dateval: number[] } | null {
  if (!dateStr) return null
  const s = dateStr.toLowerCase().trim()
  
  let quality = 0 // 0=exact, 1=estimated, 2=calculated
  if (s.includes('about') || s.includes('circa') || s.includes('c.') || s.includes('abt')) {
    quality = 1
  }
  
  // Try to extract year
  const yearMatch = s.match(/(\d{3,4})/)
  if (!yearMatch) return null
  const year = parseInt(yearMatch[1])
  
  // Try to extract month
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  let month = 0
  for (let i = 0; i < monthNames.length; i++) {
    if (s.includes(monthNames[i])) { month = i + 1; break }
  }
  
  // Try to extract day
  const dayMatch = s.match(/\b(\d{1,2})\b/)
  const day = month > 0 && dayMatch ? parseInt(dayMatch[1]) : 0
  
  // dateval: [day, month, year, quality] — see Gramps date format
  // Quality: 0=regular, 1=estimated, 2=calculated
  // For "about 1755": [0, 0, 1755, 1]
  // For "12 Mar 1847": [12, 3, 1847, 0]
  return { dateval: [day, month, year, quality] }
}

/**
 * Create or update a person's event (Birth, Death, etc).
 * If the person already has an event of this type, update the date.
 * If not, create a new event and link it to the person.
 */
async function upsertPersonEvent(
  person: any,
  eventType: string,
  dateStr: string,
  documentId?: string,
): Promise<string> {
  const dateObj = parseDateToGramps(dateStr)
  if (!dateObj) {
    console.warn(`[upsertPersonEvent] Could not parse date: "${dateStr}"`)
    return 'skipped (unparseable date)'
  }

  // Search for existing event of this type on this person
  let existingEventHandle: string | null = null
  if (person.event_ref_list) {
    for (const ref of person.event_ref_list) {
      try {
        // NO trailing slash on events endpoint
        const evt = await grampsRequest<any>(`/events/${ref.ref}`)
        const evtType = typeof evt.type === 'string' ? evt.type : evt.type?.string || ''
        if (evtType.toLowerCase() === eventType.toLowerCase()) {
          existingEventHandle = ref.ref
          break
        }
      } catch { /* skip unresolvable refs */ }
    }
  }

  if (existingEventHandle) {
    // Update existing event's date — need full object, no trailing slash
    const existing = await grampsRequest<any>(`/events/${existingEventHandle}`)
    await grampsRequest(`/events/${existingEventHandle}`, {
      method: 'PUT',
      body: JSON.stringify({ ...existing, date: dateObj }),
    })
    console.log(`[upsertPersonEvent] Updated ${eventType} date for ${person.gramps_id}`)
    return `updated ${eventType}`
  } else {
    // Create new event — POST returns transaction list
    const txResult = await grampsRequest<any[]>('/events/', {
      method: 'POST',
      body: JSON.stringify({
        _class: 'Event',
        type: eventType,
        date: dateObj,
        description: `${eventType} (from document analysis)`,
      }),
    })
    const newEventHandle = txResult[0]?.handle
    if (!newEventHandle) throw new Error('Failed to create event: no handle returned')

    // Link event to person — update the full person object
    const updatedRefs = [...(person.event_ref_list || []), { _class: 'EventRef', ref: newEventHandle, role: 'Primary' }]
    await grampsRequest(`/people/${person.handle}`, {
      method: 'PUT',
      body: JSON.stringify({ ...person, event_ref_list: updatedRefs }),
    })
    console.log(`[upsertPersonEvent] Created ${eventType} event and linked to ${person.gramps_id}`)
    return `created ${eventType} event`
  }
}

/**
 * Update Gramps tree with confirmed facts from document analysis.
 * This ONLY updates the Gramps database, NOT Supabase.
 * Use link_document_person to save document-person relationships to Supabase.
 */
async function executeUpdateGramps(payload: {
  action_id?: string
  action_type?: string
  description?: string
  target?: { type: string; id: string; name: string }
  changes?: Record<string, any>
  source_fact?: string
  document_id: string
  linked_person?: { gramps_id: string; name: string } | null
}): Promise<{ success: boolean; error?: string; gramps_id?: string }> {
  try {
    // Resolve gramps_id from either target or linked_person
    const gramps_id = payload.target?.id || payload.linked_person?.gramps_id
    if (!gramps_id) {
      return { success: false, error: 'No gramps_id provided (neither target.id nor linked_person.gramps_id)' }
    }

    const changes = payload.changes || {}

    // Fetch current person object with handle
    // IMPORTANT: Gramps API requires person.handle for all PUT operations
    const person = await getPerson(gramps_id)

    // Build structured update — convert AI-friendly fields to Gramps API format
    const updateData: Record<string, any> = {}

    // Handle birth_date → create or update Birth event
    if (changes.birth_date) {
      // Gramps stores dates on events, not directly on the person
      // We need to find or create a Birth event and link it
      await upsertPersonEvent(person, 'Birth', changes.birth_date, payload.document_id)
    }

    // Handle death_date → create or update Death event
    if (changes.death_date) {
      await upsertPersonEvent(person, 'Death', changes.death_date, payload.document_id)
    }

    // Handle name changes
    if (changes.first_name || changes.surname) {
      const primaryName = { ...person.primary_name }
      if (changes.first_name) primaryName.first_name = changes.first_name
      if (changes.surname) {
        primaryName.surname_list = [{ surname: changes.surname }]
      }
      updateData.primary_name = primaryName
    }

    // Handle gender
    if (changes.gender) {
      const genderMap: Record<string, number> = { male: 1, female: 2, unknown: 0 }
      updateData.gender = genderMap[changes.gender.toLowerCase()] ?? (person as any).gender
    }

    // Only update person record if we have direct field changes (name, gender, etc.)
    // Note: Date changes are handled via events above
    if (Object.keys(updateData).length > 0) {
      // Use person.handle for PUT request
      const merged = { ...person, ...updateData }
      await grampsRequest(`/people/${person.handle}`, {
        method: 'PUT',
        body: JSON.stringify(merged),
      })
    }

    // Add citation to Supabase (this links the document evidence to the person)
    if (payload.document_id) {
      try {
        await supabaseService.from('citations').insert({
          document_id: payload.document_id,
          person_id: gramps_id,
          fact: payload.source_fact || payload.description || 'Document analysis',
          confidence: 'probable',
        })
      } catch (citeErr) {
        console.warn('[ExecuteAction] citation insert failed:', citeErr)
      }
    }

    return { success: true, gramps_id }
  } catch (error: any) {
    console.error('[ExecuteAction] update_gramps error:', error)
    return { success: false, error: error.message }
  }
}

async function executeCreateGramps(payload: {
  name: string
  changes: Record<string, any>
  source_fact?: string
  document_id: string
}): Promise<{ success: boolean; error?: string; gramps_id?: string }> {
  try {
    // Parse name into first_name and surname
    const parts = payload.name.trim().split(/\s+/)
    const first_name = parts[0] || ''
    const surname_list = parts.length > 1 ? [{ surname: parts[parts.length - 1] }] : []

    const result = await createPerson({
      primary_name: { first_name, surname_list },
      birth_date: payload.changes?.birth_date,
      death_date: payload.changes?.death_date,
    })
    const newGrampsId = result.gramps_id

    // Link document citation
    if (payload.document_id && newGrampsId) {
      try {
        await supabaseService.from('citations').insert({
          document_id: payload.document_id,
          person_id: newGrampsId,
          fact: payload.source_fact || 'New person from document analysis',
          confidence: 'probable',
        })
      } catch { /* ignore */ }
    }

    return { success: true, gramps_id: newGrampsId }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Wiki action — writes to Supabase wiki_pages table (replaces filesystem)
// ──────────────────────────────────────────────────────────────────────────

async function executeUpdateWiki(payload: {
  document_id: string
  storage_path: string
  analysis: any
  linked_person?: { gramps_id: string; name: string } | null
}): Promise<{ success: boolean; error?: string; wiki_slug?: string }> {
  try {
    const { storage_path, analysis, linked_person } = payload
    const ext = path.extname(storage_path)
    const baseName = path.basename(storage_path, ext).replace(/\.[^.]+$/, '')
    const slug = slugify(baseName)

    const a = analysis.document_analysis
    const allNames = [
      linked_person?.name,
      ...(a.direct_evidence || []).map((e: any) => e.subject).filter(Boolean),
      ...(a.indirect_evidence || []).map((e: any) => e.subject).filter(Boolean),
    ].filter(Boolean)
    const keyPeople = Array.from(new Set(allNames.filter(Boolean))) as string[]

    const frontmatter = {
      title: (analysis.summary || slug).slice(0, 80),
      type: a.record_type || 'document',
      date: a.date_of_record || null,
      location: a.location || null,
      key_people: keyPeople,
      gramps_ids: linked_person ? [linked_person.gramps_id] : [],
      confidence: a.direct_evidence?.length > 0 ? 'confirmed' : 'probable',
      source_file: storage_path,
      scenario: a.scenario,
      source_classification: a.source_classification,
      information_type: a.information_type,
    }

    const content = [
      `# ${slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      ``,
      `## Summary`,
      analysis.summary || 'No summary available.',
      ``,
      `## GPS Analysis`,
      ``,
      `### Direct Evidence`,
      ...(a.direct_evidence || []).map((e: any) =>
        `- **${e.fact}** (${e.confidence}) — "${e.quote}" [${e.subject}]`
      ) || ['_None identified._'],
      ``,
      `### Indirect Evidence`,
      ...(a.indirect_evidence || []).map((e: any) =>
        `- **${e.inference}** (${e.confidence}) — ${e.supporting_detail} [${e.subject}]`
      ) || ['_None identified._'],
      ``,
      `### FAN Clues`,
      ...(a.fan_clues || []).map((f: any) =>
        `- **${f.name}**: ${f.relationship_hint} — ${f.context}`
      ) || ['_None identified._'],
      ``,
      `### Conflicts/Flags`,
      ...(a.conflicts || []).map((c: any) =>
        `- **${c.issue}**: ${c.detail}`
      ) || ['_None._'],
      ``,
      `### Follow-Up Records`,
      ...(a.follow_up_records || []).map((r: any, i: number) =>
        `${i + 1}. ${r}`
      ) || ['_None suggested._'],
      ``,
      `## Proposed Actions (from analysis)`,
      ...(analysis.proposed_actions || []).map((act: any) =>
        `- [${act.action_type}] ${act.description} — ${act.confidence}`
      ),
    ].join('\n')

    // Upsert wiki page in Supabase
    const { data: wikiData, error: wikiError } = await supabaseService
      .from('wiki_pages')
      .upsert({
        slug,
        title: frontmatter.title,
        page_type: a.record_type || 'document',
        content,
        frontmatter,
        storage_path: storage_path,
        document_id: payload.document_id,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'slug',
      })
      .select('id, slug')
      .single()

    if (wikiError) {
      console.error('[ExecuteAction] wiki_pages upsert error:', wikiError)
      return { success: false, error: wikiError.message }
    }

    return { success: true, wiki_slug: slug }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Supabase-only actions — document linking (no Gramps involvement)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Link a document to a person in Supabase.
 * This creates a document_people record for research tracking.
 * This does NOT update Gramps. Use update_gramps to push facts to the tree.
 */
async function executeLinkDocumentPerson(payload: {
  document_id: string
  gramps_ids: string[]
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!payload.gramps_ids || payload.gramps_ids.length === 0) {
      return { success: false, error: 'No gramps_ids provided' }
    }

    // Create document_people records for each person
    const records = payload.gramps_ids.map(gramps_id => ({
      document_id: payload.document_id,
      person_id: gramps_id,
      role: 'subject',
    }))

    const { error } = await supabaseService
      .from('document_people')
      .insert(records)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Link a document to a mystery in Supabase.
 * This creates a mystery_evidence record for research tracking.
 * This does NOT update Gramps.
 */
async function executeLinkMystery(payload: {
  document_id: string
  mystery_id: string
  evidence_text: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseService
      .from('mystery_evidence')
      .insert({
        mystery_id: payload.mystery_id,
        document_id: payload.document_id,
        content: payload.evidence_text,
        flag: 'analyzed',
        source: 'document_analysis',
      })

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { action_type, payload } = await req.json()

    if (!action_type || !payload) {
      return NextResponse.json({ error: 'action_type and payload are required' }, { status: 400 })
    }

    let result: { success: boolean; error?: string; gramps_id?: string; wiki_slug?: string }

    switch (action_type) {
      case 'update_gramps':
        // Update Gramps tree with confirmed facts (birth date, death date, etc.)
        result = await executeUpdateGramps(payload)
        break
      case 'create_gramps':
        // Create a new person in Gramps tree
        result = await executeCreateGramps(payload)
        break
      case 'update_wiki':
        // Save analysis results to wiki_pages table in Supabase
        result = await executeUpdateWiki(payload)
        break
      case 'link_document_person':
        // Link document to people in Supabase (document_people table)
        result = await executeLinkDocumentPerson(payload)
        break
      case 'link_mystery':
        // Link document to mystery in Supabase (mystery_evidence table)
        result = await executeLinkMystery(payload)
        break
      default:
        return NextResponse.json({ error: `Unknown action_type: ${action_type}` }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[ExecuteAction] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
