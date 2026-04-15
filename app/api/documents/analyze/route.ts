import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'
import { routeChat } from '@/lib/ai-router'
import fs from 'fs'
import path from 'path'
import { readFile } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.heic'])
const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.rt', '.ged', '.gedcom'])

async function extractTextContent(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (IMAGE_EXTS.has(ext)) {
    // For images, return the path — we'll use vision in the AI call
    return `[IMAGE FILE: ${filePath}]`
  }

  if (ext === '.pdf') {
    try {
      const { stdout } = await execAsync(`pdftotext -layout "${filePath}" - 2>/dev/null`, { timeout: 30000 })
      if (stdout.trim()) return stdout.trim()
    } catch {
      // pdftotext failed or returned empty
    }
    // Fall back to indication that it's a PDF needing visual analysis
    return `[PDF FILE (scanned or pdftotext failed): ${filePath}]`
  }

  if (TEXT_EXTS.has(ext)) {
    return readFile(filePath, 'utf-8')
  }

  return `[UNSUPPORTED FILE TYPE: ${ext}]`
}

function buildGPSAnalysisPrompt(
  fileName: string,
  content: string,
  fileType: string,
  contextPerson?: string,
  contextMystery?: string
): string {
  const contextSection = [
    contextPerson ? `**Primary person of interest:** ${contextPerson}` : '',
    contextMystery ? `**Relevant mystery:** ${contextMystery}` : '',
  ].filter(Boolean).join('\n')

  return `You are Hermes, a genealogy research intelligence agent. Analyze this document using the Genealogical Proof Standard (GPS).

## Document
**File:** ${fileName}
**Type:** ${fileType}
${contextSection ? `\n## Context\n${contextSection}` : ''}

## Document Content
${content}

---

## Your Task

Analyze this document and return a structured JSON response with your findings. Be precise and conservative — only assign "confirmed" confidence when the source directly and unambiguously states a fact.

### Response Format (return valid JSON only, no markdown):

{
  "document_analysis": {
    "scenario": "A|B|C",
    "source_classification": "Original|Derivative|Authored",
    "information_type": "Primary|Secondary|Indeterminate",
    "date_of_record": "YYYY-MM-DD or approximate/estimated",
    "location": "place if determinable, otherwise null",
    "record_type": "birth certificate|census|will|deed|marriage|etc.",
    "direct_evidence": [
      {
        "fact": "specific fact stated",
        "quote": "exact quote from source or 'N/A'",
        "subject": "person name this fact pertains to",
        "confidence": "confirmed|probable|possible"
      }
    ],
    "indirect_evidence": [
      {
        "inference": "what can be inferred",
        "supporting_detail": "circumstantial support from document",
        "subject": "person this pertains to",
        "confidence": "probable|possible"
      }
    ],
    "fan_clues": [
      {
        "name": "person name",
        "relationship_hint": "how they appear (witness, neighbor, etc.)",
        "context": "brief context from document"
      }
    ],
    "conflicts": [
      {
        "issue": "description of conflict or concern",
        "detail": "specific contradiction or flag"
      }
    ],
    "follow_up_records": [
      "specific record type or search strategy"
    ]
  },
  "proposed_actions": [
    {
      "action_id": "unique id",
      "action_type": "update_gramps|create_gramps|update_wiki|link_mystery",
      "description": "human-readable description of what this action does",
      "target": {
        "type": "person|mystery|wiki",
        "id": "gramps_id or mystery UUID or wiki path",
        "name": "display name"
      },
      "changes": {
        "field": "new_value",
        "...": "..."
      },
      "confidence": "confirmed|probable|possible",
      "source_fact": "which direct_evidence item this is based on"
    }
  ],
  "summary": "2-3 sentence plain-English summary of what this document reveals"
}

### GPS Guidelines
- "confirmed" = exact date/place/name in primary source with no ambiguity
- "probable" = strong indirect evidence, very likely correct
- "possible" = plausible but other explanations exist
- For 1700s-1800s Virginia/NC/Tennessee: use FAN (Family/Associates/Neighbors) and witnesses to disambiguate same-name individuals
- Note any anachronisms, obvious misreadings, or suspect transcriptions
- If the document is a scanned image that needs visual OCR, say so in summary

Return ONLY valid JSON. No preamble, no explanation.`
}

export async function POST(req: NextRequest) {
  try {
    const { document_id, context_type, context_id, context_name } = await req.json()

    if (!document_id) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 })
    }

    // Fetch document from Supabase
    const { data: doc, error: docError } = await supabaseService
      .from('documents')
      .select('*, document_people!inner(people:person_id(gramps_id, name)), mystery_evidence(mystery_id)')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Try to get wiki path from document_people if context
    let wikiRawPath = (doc as any).wiki_raw_path || null
    let linkedPersonGrampsId = context_type === 'person' ? context_id : null
    let linkedPersonName = context_type === 'person' ? context_name : null

    // If document has linked people, grab the first one's gramps_id
    if (!linkedPersonGrampsId && (doc as any).document_people?.length > 0) {
      const firstLink = (doc as any).document_people[0]
      if (firstLink.people) {
        linkedPersonGrampsId = firstLink.people.gramps_id
        linkedPersonName = firstLink.people.name || linkedPersonName
      }
    }

    // Build file path — wiki raw files follow: /root/genealogy-wiki/raw/{date}-{slug}.{ext}
    // We stored title which is the file name; reconstruct the path
    if (!wikiRawPath && doc.title) {
      // Try common locations
      const possibleDirs = ['/root/genealogy-wiki/raw']
      const baseName = doc.title.replace(/\.[^.]+$/, '')
      for (const dir of possibleDirs) {
        try {
          const files = fs.readdirSync(dir)
          const match = files.find(f => f.includes(baseName))
          if (match) {
            wikiRawPath = path.join(dir, match)
            break
          }
        } catch { /* dir doesn't exist */ }
      }
    }

    // Also try using the document's stored path if available
    if (!wikiRawPath && (doc as any).source) {
      const src = (doc as any).source
      if (src.startsWith('/root/genealogy-wiki/raw') && fs.existsSync(src)) {
        wikiRawPath = src
      }
    }

    if (!wikiRawPath || !fs.existsSync(wikiRawPath)) {
      return NextResponse.json({
        error: `Could not locate file on disk. Wiki path: ${wikiRawPath || 'unknown'}`,
        doc_title: doc.title,
      }, { status: 404 })
    }

    const ext = path.extname(wikiRawPath).toLowerCase()
    const isImage = IMAGE_EXTS.has(ext)
    const fileType = isImage ? 'image' : (ext === '.pdf' ? 'pdf' : 'text')

    // Extract content
    let content: string
    if (isImage) {
      // Read image as base64 for vision analysis
      const imageBuffer = fs.readFileSync(wikiRawPath)
      const base64 = imageBuffer.toString('base64')
      const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      content = `[IMAGE_BASE64:${mimeType};${base64}]`
    } else {
      content = await extractTextContent(wikiRawPath)
      if (content.startsWith('[UNSUPPORTED') || content.startsWith('[PDF FILE')) {
        return NextResponse.json({
          error: content,
          file_path: wikiRawPath,
          needs_visual_analysis: true,
        }, { status: 422 })
      }
    }

    // Build the prompt
    const prompt = buildGPSAnalysisPrompt(
      doc.title || 'unknown',
      content,
      fileType,
      linkedPersonName || undefined,
      undefined
    )

    // Call AI
    const systemPrompt = `You are Hermes, a genealogy research intelligence agent. Always respond with valid JSON only.`
    const result = await routeChat(
      [{ role: 'user', content: prompt }],
      { deep: true },
      { system: systemPrompt, max_tokens: 4000 }
    )

    if (result.error || !result.message) {
      return NextResponse.json({ error: result.error || 'AI analysis failed' }, { status: 500 })
    }

    // Parse JSON response
    let analysis: any
    try {
      // Try to extract JSON from response (might be wrapped in markdown)
      const jsonMatch = result.message.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        analysis = JSON.parse(result.message)
      }
    } catch (parseError) {
      console.error('[Analyze] JSON parse failed:', parseError, 'Raw response:', result.message.slice(0, 500))
      return NextResponse.json({
        error: 'Failed to parse AI response as JSON',
        raw_response: result.message.slice(0, 1000),
      }, { status: 500 })
    }

    return NextResponse.json({
      document_id,
      wiki_raw_path: wikiRawPath,
      linked_person: linkedPersonGrampsId ? { gramps_id: linkedPersonGrampsId, name: linkedPersonName } : null,
      file_type: fileType,
      analysis,
    })
  } catch (error: any) {
    console.error('[Analyze] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
