import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'
import { updatePerson, createPerson, getPerson } from '@/lib/gramps'
import path from 'path'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

// ──────────────────────────────────────────────────────────────────────────
// Gramps actions — these already work over HTTP
// ──────────────────────────────────────────────────────────────────────────

async function executeUpdateGramps(payload: {
  gramps_id: string
  changes: Record<string, any>
  source_fact?: string
  document_id: string
}): Promise<{ success: boolean; error?: string; gramps_id?: string }> {
  try {
    const { gramps_id, changes } = payload

    // Fetch current person to merge changes
    const current = await getPerson(gramps_id)

    // Build update payload — merge with existing data
    const updated = { ...current, ...changes }

    await updatePerson(gramps_id, updated)

    // Also add citation if document_id provided
    if (payload.document_id) {
      try {
        await supabaseService.from('citations').insert({
          document_id: payload.document_id,
          person_id: gramps_id,
          fact: payload.source_fact || 'Document analysis',
          confidence: 'probable',
        })
      } catch (citeErr) {
        console.warn('[ExecuteAction] citation insert failed:', citeErr)
      }
    }

    return { success: true, gramps_id }
  } catch (error: any) {
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
// Mystery linking — already works (Supabase only)
// ──────────────────────────────────────────────────────────────────────────

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
        result = await executeUpdateGramps(payload)
        break
      case 'create_gramps':
        result = await executeCreateGramps(payload)
        break
      case 'update_wiki':
        result = await executeUpdateWiki(payload)
        break
      case 'link_mystery':
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
