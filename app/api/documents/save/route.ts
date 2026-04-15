import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'
import path from 'path'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
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

    // ──────────────────────────────────────────────────────────────────────────
    // Upload to Supabase Storage
    // ──────────────────────────────────────────────────────────────────────────
    const storagePath = `raw/${new Date().toISOString().slice(0, 10)}-${slug}.${ext}`

    const { data: storageData, error: storageError } = await supabaseService.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (storageError) {
      console.error('[Document/Save] Storage upload error:', storageError)
      return NextResponse.json({ error: `Storage upload failed: ${storageError.message}` }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabaseService.storage.from('documents').getPublicUrl(storagePath)
    const storageUrl = urlData.publicUrl

    // ──────────────────────────────────────────────────────────────────────────
    // Save document record to Supabase
    // ──────────────────────────────────────────────────────────────────────────
    const { data: docData, error: docError } = await supabaseService
      .from('documents')
      .insert([
        {
          title: file.name,
          document_type: documentType || 'other',
          description: `Uploaded${contextName ? ` for ${contextName}` : ''}`,
          date: new Date().toISOString(),
          file_path: storagePath,
          url: storageUrl,
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
          source: storageUrl,
          flag: 'unverified',
        }])
      if (mysteryError) console.warn('[Document/Save] mystery link error:', mysteryError.message)
    }

    return NextResponse.json({
      success: true,
      document_id: documentId,
      storage_path: storagePath,
      storage_url: storageUrl,
      message: `Saved${contextName ? ` for ${contextName}` : ''}`,
    })
  } catch (error: any) {
    console.error('[Document/Save] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
