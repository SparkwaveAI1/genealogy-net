import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    // Wiki lives on Hetzner VPS filesystem — not accessible from Vercel serverless
    // Return a note that wiki activity will appear when Hermes writes to the wiki
    // Future: store wiki log entries in Supabase for cross-platform access
    return NextResponse.json({
      entries: ['Wiki activity syncs from the VPS. Connect Supabase storage for cloud access.'],
      note: 'wiki_on_vps',
    })
  } catch (error) {
    console.error('Error in wiki-sync API:', error)
    return NextResponse.json({ entries: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { page, content } = await req.json()

    if (!page || !content) {
      return NextResponse.json(
        { error: 'Page and content are required' },
        { status: 400 }
      )
    }

    const wikiPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki', page)

    // Ensure directory exists
    const dir = path.dirname(wikiPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Append content
    fs.appendFileSync(wikiPath, `\n${content}\n`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error writing to wiki:', error)
    return NextResponse.json(
      { error: 'Failed to write to wiki' },
      { status: 500 }
    )
  }
}
