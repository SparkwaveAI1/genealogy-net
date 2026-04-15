import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'
import { routeChat } from '@/lib/ai-router'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.heic'])
const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.rt', '.ged', '.gedcom'])

async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string> {
  if (IMAGE_EXTS.has(ext)) {
    return `[IMAGE FILE]`
  }

  if (ext === '.pdf') {
    try {
      // Write buffer to temp file for pdftotext
      const tmpPath = `/tmp/doc-extract-${Date.now()}.pdf`
      require('fs').writeFileSync(tmpPath, buffer)
      const { stdout } = await execAsync(`pdftotext -layout "${tmpPath}" - 2>/dev/null`, { timeout: 30000 })
      require('fs').unlinkSync(tmpPath)
      if (stdout.trim()) return stdout.trim()
    } catch {
      // pdftotext failed or returned empty
    }
    return `[PDF FILE (scanned or pdftotext failed)]`
  }

  if (TEXT_EXTS.has(ext)) {
    return buffer.toString('utf-8')
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

    // ──────────────────────────────────────────────────────────────────────────
    // Fetch document from Supabase
    // ──────────────────────────────────────────────────────────────────────────
    const { data: doc, error: docError } = await supabaseService
      .from('documents')
      .select('id, title, file_path, url, document_type, description, date')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const filePath = doc.file_path
    if (!filePath) {
      return NextResponse.json({
        error: 'Document has no file_path — upload may have failed',
        doc_title: doc.title,
      }, { status: 404 })
    }

    let linkedPersonGrampsId: string | null = context_type === 'person' ? context_id : null
    let linkedPersonName: string | null = context_type === 'person' ? context_name : null

    // ──────────────────────────────────────────────────────────────────────────
    // Download file from Supabase Storage
    // ──────────────────────────────────────────────────────────────────────────
    const { data: fileBuffer, error: downloadError } = await supabaseService.storage
      .from('documents')
      .download(filePath)

    if (downloadError || !fileBuffer) {
      return NextResponse.json({
        error: `Failed to download from Supabase Storage: ${downloadError?.message || 'unknown error'}`,
        file_path: filePath,
      }, { status: 500 })
    }

    const ext = path.extname(filePath).toLowerCase()
    const isImage = IMAGE_EXTS.has(ext)
    const fileType = isImage ? 'image' : (ext === '.pdf' ? 'pdf' : 'text')

    // ──────────────────────────────────────────────────────────────────────────
    // Extract content from downloaded buffer
    // ──────────────────────────────────────────────────────────────────────────
    let content: string
    if (isImage) {
      // Read image as base64 for vision analysis
      const arrayBuffer = await fileBuffer.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const base64 = buffer.toString('base64')
      const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      content = `[IMAGE_BASE64:${mimeType};${base64}]`
    } else {
      const arrayBuffer = await fileBuffer.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      content = await extractTextFromBuffer(buffer, ext)
      if (content.startsWith('[UNSUPPORTED') || content.startsWith('[PDF FILE')) {
        return NextResponse.json({
          error: content,
          file_path: filePath,
          needs_visual_analysis: true,
        }, { status: 422 })
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Call AI for GPS analysis
    // ──────────────────────────────────────────────────────────────────────────
    const prompt = buildGPSAnalysisPrompt(
      doc.title || 'unknown',
      content,
      fileType,
      linkedPersonName || undefined,
      undefined
    )

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
      file_path: filePath,
      linked_person: linkedPersonGrampsId ? { gramps_id: linkedPersonGrampsId, name: linkedPersonName } : null,
      file_type: fileType,
      analysis,
    })
  } catch (error: any) {
    console.error('[Analyze] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
