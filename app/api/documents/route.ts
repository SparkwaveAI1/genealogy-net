import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { supabase } from '@/lib/supabase'

// DEPRECATED: This route now calls Hermes instead of Anthropic directly.
// Legacy path kept for backward compatibility during rollout.
// TODO: Remove direct Anthropic call after Hermes path is verified.

const HERMES_BIN = '/root/.local/bin/hermes'
const GRAMPS_API = process.env.GRAMPS_API_URL || 'http://178.156.250.119/api'

interface HermesIntakeResult {
  summary?: string
  analysis?: string
  proposed_actions?: any[]
  wiki_filed?: boolean
  gramps_updated?: string[]
  mysteries_informed?: string[]
  error?: string
}

/**
 * Spawn Hermes CLI with document intake skill and return parsed JSON result.
 */
async function spawnHermesIntake(
  prompt: string,
  fileName: string,
  fileType: string,
  base64: string,
  timeoutMs = 180_000,
): Promise<HermesIntakeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      'chat',
      '-q', prompt,
      '--provider', 'minimax',
      '-t', 'terminal,file,web,search,skills',
      '--skills', 'document-intake',
      '--source', 'grip-document',
      '--quiet',
      '--file', fileName,
      '--file-type', fileType,
      '--file-base64', base64,
    ]

    console.log('[Hermes] Spawning:', HERMES_BIN, args.join(' '))

    const proc = spawn(HERMES_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HERMES_HOME: '/root/.hermes',
        TERM: 'dumb',
      },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      console.error('[Hermes] Spawn error:', err.message)
      reject(new Error(`Hermes spawn error: ${err.message}`))
    })

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error(`Hermes timed out after ${timeoutMs / 1000}s`))
    }, timeoutMs)

    proc.on('close', (code) => {
      clearTimeout(timer)
      console.log('[Hermes] Exit code:', code)
      if (code !== 0 && !stdout) {
        console.error('[Hermes] stderr:', stderr)
        reject(new Error(`Hermes exited with code ${code}`))
        return
      }

      // Extract JSON from output — look for JSON block at end
      try {
        const result = parseHermesOutput(stdout)
        resolve(result)
      } catch (err) {
        console.error('[Hermes] Failed to parse output:', err)
        // Fallback: return raw stdout as summary
        resolve({
          summary: stdout.substring(0, 1000),
          analysis: stdout,
          proposed_actions: [],
          wiki_filed: false,
          gramps_updated: [],
          mysteries_informed: [],
        })
      }
    })
  })
}

/**
 * Extract JSON object from Hermes stdout.
 * Looks for the last {...} or [...] block in the output.
 */
function parseHermesOutput(stdout: string): HermesIntakeResult {
  // Try to find a JSON object ( {...} ) at the end of output
  const lines = stdout.split('\n')
  const jsonLines: string[] = []
  let inJson = false
  let braceCount = 0

  // Search from the end for a JSON object
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!inJson && (line.startsWith('{') || line.startsWith('['))) {
      inJson = true
    }
    if (inJson) {
      jsonLines.unshift(lines[i])
      if (line.includes('{')) braceCount += (line.match(/{/g) || []).length
      if (line.includes('}')) braceCount -= (line.match(/}/g) || []).length
      if (braceCount === 0 && inJson) break
    }
  }

  if (jsonLines.length > 0) {
    const jsonStr = jsonLines.join('\n')
    return JSON.parse(jsonStr)
  }

  // Try regex fallback
  const objMatch = stdout.match(/\{[\s\S]*\}/)
  if (objMatch) {
    return JSON.parse(objMatch[0])
  }

  throw new Error('No JSON found in Hermes output')
}

/**
 * Get Gramps JWT token.
 */
async function getGrampsToken(): Promise<string> {
  const res = await fetch(`${GRAMPS_API}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.GRAMPS_USERNAME || 'scott',
      password: process.env.GRAMPS_PASSWORD || 'claw1234',
    }),
  })
  const data = await res.json()
  return data.access_token || ''
}

/**
 * Search Gramps for people matching the given names.
 */
async function searchGrampsPeople(
  individuals: Array<{ name: string; dates?: string; places?: string; role?: string }>,
  token: string,
): Promise<any[]> {
  if (!individuals || individuals.length === 0) return []

  try {
    const res = await fetch(`${GRAMPS_API}/people/?page=1&pagesize=500`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const allPeople: any[] = await res.json()

    const matches: any[] = []
    for (const ind of individuals) {
      const name = ind.name.toLowerCase()
      const parts = name.split(' ').filter((p) => p.length > 1)

      const found = allPeople
        .filter((p: any) => {
          const first = (p.primary_name?.first_name || '').toLowerCase()
          const surname = (p.primary_name?.surname_list?.[0]?.surname || '').toLowerCase()
          const full = `${first} ${surname}`
          return parts.every((part) => full.includes(part))
        })
        .slice(0, 5)
        .map((p: any) => ({
          gramps_id: p.gramps_id,
          name: `${p.primary_name?.first_name || ''} ${p.primary_name?.surname_list?.[0]?.surname || ''}`.trim(),
          handle: p.handle,
        }))

      if (found.length > 0) {
        matches.push({
          extracted_name: ind.name,
          extracted_dates: ind.dates || null,
          extracted_places: ind.places || null,
          candidates: found,
        })
      }
    }
    return matches
  } catch (err) {
    console.error('[Gramps] Search error:', err)
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[Document] Upload started')

    const formData = await req.formData()
    const file = formData.get('file') as File
    const individual_context = formData.get('individual_context') as string
    const document_type = formData.get('document_type') as string
    const processing_instructions = formData.get('processing_instructions') as string
    const mystery_id = formData.get('mystery_id') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log('[Document] File:', file.name, file.type, file.size, 'bytes')

    // Determine file category for Hermes
    const isImage = file.type.startsWith('image/')
    const isPDF = file.type === 'application/pdf'
    const isText =
      file.type === 'text/plain' ||
      file.type === 'text/markdown' ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md')

    // Read buffer and encode base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')

    // Build the prompt for Hermes
    let fileNote = ''
    if (isText) {
      const text = buffer.toString('utf-8')
      fileNote = `\n--- FILE CONTENT ---\n${text.slice(0, 8000)}\n--- END FILE CONTENT ---\n`
    } else if (isImage) {
      fileNote = `\n[Image file attached: ${file.name} — Hermes will analyze via vision tool]\n`
    } else if (isPDF) {
      fileNote = `\n[PDF file attached: ${file.name} — Hermes will extract text via pdftotext]\n`
    } else {
      fileNote = `\n[File attached: ${file.name} (${file.type}) — supported types: text, image, PDF]\n`
    }

    const context = `
Document intake request from GRIP.

File: ${file.name}
Document type: ${document_type || 'unknown'}
Mystery ID: ${mystery_id || 'none'}
Individual context: ${individual_context || 'none'}
Processing instructions: ${processing_instructions || 'none'}
${fileNote}
Load the document_intake skill and follow its full workflow. Present proposed actions as a checklist for user confirmation, then execute confirmed actions. File the raw document to the wiki, create a source page, and write any confirmed facts back to Gramps.
`.trim()

    // Spawn Hermes for analysis
    console.log('[Document] Spawning Hermes for analysis...')
    let hermesResult: HermesIntakeResult
    try {
      hermesResult = await spawnHermesIntake(context, file.name, file.type, base64, 180_000)
      console.log('[Document] Hermes result received')
    } catch (hermesErr: any) {
      console.error('[Document] Hermes error:', hermesErr.message)
      return NextResponse.json(
        { success: false, error: `Hermes analysis failed: ${hermesErr.message}` },
        { status: 500 },
      )
    }

    // Save document record to Supabase
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert([
        {
          title: file.name,
          document_type: document_type || 'other',
          description: hermesResult.summary?.substring(0, 500) || '',
          document_date: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (dbError) {
      console.error('[Document] Supabase save error:', dbError)
    }

    // Search Gramps for people found in the document
    let peopleMatches: any[] = []
    if (hermesResult.analysis) {
      try {
        const token = await getGrampsToken()
        // Try to extract individuals from the analysis text
        const individuals = extractIndividualsFromAnalysis(hermesResult.analysis)
        if (individuals.length > 0) {
          peopleMatches = await searchGrampsPeople(individuals, token)
        }
      } catch (err) {
        console.error('[Document] Gramps search error:', err)
      }
    }

    console.log('[Document] Returning success response')

    return NextResponse.json({
      success: true,
      analysis: hermesResult.analysis || hermesResult.summary || '',
      summary: hermesResult.summary || '',
      document_id: documentData?.id,
      mystery_id: mystery_id || null,
      proposed_actions: hermesResult.proposed_actions || [],
      wiki_filed: hermesResult.wiki_filed || false,
      gramps_updated: hermesResult.gramps_updated || [],
      mysteries_informed: hermesResult.mysteries_informed || [],
      people_matches: peopleMatches,
      hermes_ok: !hermesResult.error,
      hermes_error: hermesResult.error || null,
    })
  } catch (error: any) {
    console.error('[Document] Processing error:', error)
    console.error('[Document] Error stack:', error.stack)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An error occurred processing the document',
        details: error.toString(),
      },
      { status: 500 },
    )
  }
}

/**
 * Try to extract structured individuals from the Hermes analysis text.
 * Looks for name patterns in the text.
 */
function extractIndividualsFromAnalysis(analysisText: string): Array<{ name: string; dates?: string; places?: string; role?: string }> {
  const individuals: Array<{ name: string; dates?: string; places?: string; role?: string }> = []

  // Look for markdown tables with names
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g
  const matches = analysisText.matchAll(namePattern)
  for (const match of matches) {
    const name = match[1].trim()
    if (name.length > 3 && !individuals.find((i) => i.name === name)) {
      individuals.push({ name })
    }
  }

  return individuals
}
