import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const logPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki', 'log.md')

    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ entries: [] })
    }

    const content = fs.readFileSync(logPath, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim())

    // Get last 10 entries (assuming each entry is a line)
    const entries = lines.slice(-10).reverse()

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('Error reading wiki log:', error)
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
