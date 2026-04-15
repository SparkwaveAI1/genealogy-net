import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'
import { updatePerson, createPerson, getPerson, getToken } from '@/lib/gramps'
import fs from 'fs'
import path from 'path'

const WIKI_WIKI = '/root/genealogy-wiki/wiki'
const WIKI_INDEX = '/root/genealogy-wiki/index.md'
const WIKI_LOG = '/root/genealogy-wiki/log.md'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

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

async function executeUpdateWiki(payload: {
  document_id: string
  wiki_raw_path: string
  analysis: any
  linked_person?: { gramps_id: string; name: string } | null
}): Promise<{ success: boolean; error?: string; wiki_path?: string }> {
  try {
    const { wiki_raw_path, analysis, linked_person } = payload
    const ext = path.extname(wiki_raw_path)
    const baseName = path.basename(wiki_raw_path, ext).replace(/\.[^.]+$/, '')
    const slug = slugify(baseName)
    const wikiSrcPath = `/root/genealogy-wiki/wiki/sources/${slug}.md`

    const a = analysis.document_analysis
    const allNames = [
      linked_person?.name,
      ...(a.direct_evidence || []).map((e: any) => e.subject).filter(Boolean),
      ...(a.indirect_evidence || []).map((e: any) => e.subject).filter(Boolean),
    ].filter(Boolean)
    const keyPeople = Array.from(new Set(allNames.filter(Boolean))) as string[]

    const frontmatter = [
      '---',
      `title: "${(analysis.summary || slug).slice(0, 80).replace(/"/g, '\\"')}"`,
      `type: ${a.record_type || 'document'}`,
      `date: "${a.date_of_record || ''}"`,
      `location: "${a.location || ''}"`,
      `key_people: [${keyPeople.map((n: string) => `"${n}"`).join(', ')}]`,
      `gramps_ids: [${linked_person ? `"${linked_person.gramps_id}"` : ''}]`,
      `confidence: ${a.direct_evidence?.length > 0 ? 'confirmed' : 'probable'}`,
      `source_file: "${wiki_raw_path}"`,
      `scenario: ${a.scenario}`,
      `source_classification: ${a.source_classification}`,
      `information_type: ${a.information_type}`,
      '---',
    ].join('\n')

    const content = `${frontmatter}\n\n# ${slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n## Summary\n${analysis.summary || 'No summary available.'}\n\n## GPS Analysis\n\n### Direct Evidence\n${(a.direct_evidence || []).map((e: any) => `- **${e.fact}** (${e.confidence}) — "${e.quote}" [${e.subject}]`).join('\n') || '_None identified._'}\n\n### Indirect Evidence\n${(a.indirect_evidence || []).map((e: any) => `- **${e.inference}** (${e.confidence}) — ${e.supporting_detail} [${e.subject}]`).join('\n') || '_None identified._'}\n\n### FAN Clues\n${(a.fan_clues || []).map((f: any) => `- **${f.name}**: ${f.relationship_hint} — ${f.context}`).join('\n') || '_None identified._'}\n\n### Conflicts/Flags\n${(a.conflicts || []).map((c: any) => `- **${c.issue}**: ${c.detail}`).join('\n') || '_None._'}\n\n### Follow-Up Records\n${(a.follow_up_records || []).map((r: any, i: number) => `${i + 1}. ${r}`).join('\n') || '_None suggested._'}\n\n## Proposed Actions (from analysis)\n${(analysis.proposed_actions || []).map((act: any) => `- [${act.action_type}] ${act.description} — ${act.confidence}`).join('\n')}\n`

    fs.writeFileSync(wikiSrcPath, content)

    // Update index
    try {
      let index = fs.readFileSync(WIKI_INDEX, 'utf-8')
      const today = new Date().toISOString().slice(0, 10)
      const newEntry = `| ${slug.replace(/-/g, ' ')} | ${today} | ${a.record_type || 'document'} | [source](wiki/sources/${slug}.md) |`
      if (!index.includes(newEntry)) {
        if (index.includes('## Sources')) {
          // Find the Sources table header line and insert after it
          const tableHeaderMatch = index.match(/(\| --- \+ \[source\]\(wiki\/sources\/.*\.md\) \|\n)/)
          if (tableHeaderMatch) {
            index = index.replace(tableHeaderMatch[0], tableHeaderMatch[0] + newEntry + '\n')
          }
        } else {
          index += '\n## Sources\n\n| Title | Date | Type | Link |\n| --- | --- | --- | --- |\n' + newEntry + '\n'
        }
        fs.writeFileSync(WIKI_INDEX, index)
      }
    } catch (e) {
      console.warn('[Wiki] index update failed:', e)
    }

    // Append to log
    try {
      const logEntry = `\n## ${new Date().toISOString()} — Document Analysis\n\n- **File:** ${path.basename(wiki_raw_path)}\n- **Analysis:** ${analysis.summary?.slice(0, 200) || 'See source page'}\n- **Proposed actions:** ${(analysis.proposed_actions || []).length}\n- **Wiki page:** wiki/sources/${slug}.md\n`
      fs.appendFileSync(WIKI_LOG, logEntry)
    } catch (e) {
      console.warn('[Wiki] log append failed:', e)
    }

    return { success: true, wiki_path: wikiSrcPath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

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

export async function POST(req: NextRequest) {
  try {
    const { action_type, payload } = await req.json()

    if (!action_type || !payload) {
      return NextResponse.json({ error: 'action_type and payload are required' }, { status: 400 })
    }

    let result: { success: boolean; error?: string; gramps_id?: string; wiki_path?: string }

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
