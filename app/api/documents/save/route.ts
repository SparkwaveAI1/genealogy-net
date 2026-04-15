import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

const WIKI_RAW = '/root/genealogy-wiki/raw'
const WIKI_SOURCES = '/root/genealogy-wiki/wiki/sources'
const WIKI_INDEX = '/root/genealogy-wiki/index.md'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function fileToWiki(data: Buffer, ext: string, slug: string): { rawPath: string; sourcePath: string } {
  const today = new Date().toISOString().slice(0, 10)
  const rawPath = `${WIKI_RAW}/${today}-${slug}.${ext}`
  const sourcePath = `${WIKI_SOURCES}/${slug}.md`

  // Write raw file
  fs.writeFileSync(rawPath, data)

  // Create source page
  const frontmatter = [
    '---',
    `title: "${slug.replace(/-/g, ' ')}"`,
    `type: document`,
    `date: "${new Date().toISOString()}"`,
    'key_people: []',
    'gramps_ids: []',
    'confidence: probable',
    `source_file: "${rawPath}"`,
    '---',
  ].join('\n')

  const content = `${frontmatter}\n\n# ${slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\nDocument uploaded via GRIP.\n`

  fs.writeFileSync(sourcePath, content)

  // Update index.md — append to sources table if section exists
  try {
    let index = fs.readFileSync(WIKI_INDEX, 'utf-8')
    const newEntry = `| ${slug.replace(/-/g, ' ')} | ${today} | document | [source](wiki/sources/${slug}.md) |`
    if (!index.includes(newEntry)) {
      if (index.includes('## Sources')) {
        index = index.replace(/(\| --- \+ \[source\]\(wiki\/sources\/.*\.md\) \|\n)/, `${newEntry}\n`)
      } else {
        index += `\n## Sources\n\n| Title | Date | Type | Link |\n| --- | --- | --- | --- |\n${newEntry}\n`
      }
      fs.writeFileSync(WIKI_INDEX, index)
    }
  } catch (e) {
    console.warn('[Wiki] index.md update failed:', e)
  }

  // Append to log.md
  try {
    const logPath = '/root/genealogy-wiki/log.md'
    const logEntry = `\n## ${new Date().toISOString()} — Document Ingest\n\n- **File:** ${slug}.${ext}\n- **Raw:** ${rawPath}\n- **Source page:** wiki/sources/${slug}.md\n`
    fs.appendFileSync(logPath, logEntry)
  } catch (e) {
    console.warn('[Wiki] log.md append failed:', e)
  }

  return { rawPath, sourcePath }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const contextType = formData.get('context_type') as string // 'person' | 'mystery' | 'none'
    const contextId = formData.get('context_id') as string     // gramps_id or mystery UUID
    const contextName = formData.get('context_name') as string  // display name
    const documentType = formData.get('document_type') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log('[Document/Save] File:', file.name, 'context:', contextType, contextId)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = path.extname(file.name).replace('.', '') || 'bin'
    const baseName = path.basename(file.name, path.extname(file.name))
    const slug = slugify(baseName)

    // File to wiki
    const { rawPath, sourcePath } = fileToWiki(buffer, ext, slug)

    // Save to Supabase
    const { data: docData, error: docError } = await supabaseService
      .from('documents')
      .insert([
        {
          title: file.name,
          document_type: documentType || 'other',
          description: `Uploaded${contextName ? ` for ${contextName}` : ''}`,
          document_date: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (docError) {
      console.error('[Document/Save] Supabase error:', docError)
      return NextResponse.json({ error: docError.message }, { status: 500 })
    }

    const documentId = docData.id

    // Link to person if context is person
    if (contextType === 'person' && contextId) {
      const { error: linkError } = await supabaseService
        .from('document_people')
        .insert([{ document_id: documentId, person_id: contextId }])
      if (linkError) console.warn('[Document/Save] person link error:', linkError.message)
    }

    // Link to mystery if context is mystery
    if (contextType === 'mystery' && contextId) {
      const { error: mysteryError } = await supabaseService
        .from('mystery_evidence')
        .insert([{
          mystery_id: contextId,
          content: `Document uploaded: ${file.name}`,
          source: rawPath,
          flag: 'unverified',
        }])
      if (mysteryError) console.warn('[Document/Save] mystery link error:', mysteryError.message)
    }

    return NextResponse.json({
      success: true,
      document_id: documentId,
      wiki_raw: rawPath,
      wiki_source: sourcePath,
      message: `Saved${contextName ? ` for ${contextName}` : ''}`,
    })
  } catch (error: any) {
    console.error('[Document/Save] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
