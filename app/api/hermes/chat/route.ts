import { NextRequest, NextResponse } from 'next/server'
import * as pty from 'node-pty'
import fs from 'fs'
import { randomUUID } from 'crypto'

// ─── In-memory job store ─────────────────────────────────────────────────────
type JobStatus = 'pending' | 'processing' | 'done' | 'error'

interface Job {
  id: string
  status: JobStatus
  response: string | null
  error: string | null
  createdAt: number
}

// Simple in-memory job queue (per-process, fine for single-instance)
const jobs = new Map<string, Job>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMinimaxToken(): string | undefined {
  try {
    const authPath = '/root/.hermes/auth.json'
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'))
      const providers = auth?.providers || {}
      for (const [name, prov] of Object.entries(providers)) {
        const p = prov as any
        if (name.includes('minimax') && p?.portal_token) {
          return p.portal_token
        }
      }
    }
  } catch {}
  return process.env.MINIMAX_PORTAL_TOKEN
}

function extractResponse(fullOutput: string): string {
  // Remove ANSI escape sequences
  const stripped = fullOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

  // Find "Goodbye!" marker — clean exit
  const goodbyeIdx = stripped.indexOf('Goodbye!')
  if (goodbyeIdx !== -1) {
    return stripped.substring(0, goodbyeIdx).trim()
  }

  // Fallback: strip TUI noise
  const lines = stripped.split('\n')
  const readable: string[] = []
  for (const line of lines) {
    if (line.match(/^[╭╮╯╰├┤┬┴┼─│⌁⎙⏎☑░▒ ]+$/)) continue
    if (line.match(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/)) continue
    if (line.trim() === '') continue
    if (line.match(/^(Session|Model|Tools|Available|Skills|Minimax)[ \t]/)) continue
    if (line.match(/^⚠ /)) continue
    if (line.match(/^\\[.*\\]$/)) continue
    if (line.match(/^\?[\d;]+[a-zA-Z]$/)) continue
    readable.push(line)
  }
  return readable.join('\n').trim()
}

// ─── PTY call — runs in background, resolves a job ────────────────────────────

function startHermesJob(jobId: string, prompt: string, model?: string): void {
  const tools = 'terminal,file,web,search,skills'
  const args = [
    'chat', '-q', prompt,
    '--provider', model || 'minimax',
    '-t', tools,
    '-Q',  // quiet mode
    '--source', 'grip',
  ]

  const minimaxToken = getMinimaxToken()
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    HERMES_HOME: '/root/.hermes',
    TERM: 'xterm-256color',
  }
  if (minimaxToken) {
    env.MINIMAX_PORTAL_TOKEN = minimaxToken
  }

  console.log(`[Hermes job ${jobId}] Starting PTY with model: ${model || 'minimax'}`)

  const ptyProcess = pty.spawn('/root/.local/bin/hermes', args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 24,
    cwd: '/root/.hermes',
    env,
  })

  let stdout = ''
  let resolved = false

  ptyProcess.onData((data: string) => {
    stdout += data
    // Detect completion: "session_id:" line appears in quiet mode
    if (!resolved && stdout.includes('session_id:')) {
      resolved = true
      const response = extractResponse(stdout)
      jobs.set(jobId, { ...jobs.get(jobId)!, status: 'done', response })
      console.log(`[Hermes job ${jobId}] Done — response length: ${response.length}`)
      ptyProcess.kill()
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    if (!resolved) {
      resolved = true
      if (exitCode !== 0) {
        const err = `Hermes exited with code ${exitCode}`
        console.error(`[Hermes job ${jobId}] Error: ${err}`)
        jobs.set(jobId, { ...jobs.get(jobId)!, status: 'error', error: err })
      } else {
        // Process exited without "session_id:" — may have timed out or errored silently
        const response = extractResponse(stdout)
        if (response) {
          jobs.set(jobId, { ...jobs.get(jobId)!, status: 'done', response })
        } else {
          jobs.set(jobId, { ...jobs.get(jobId)!, status: 'error', error: 'No response from Hermes' })
        }
      }
    }
  })

  ptyProcess.on('error', (err: Error) => {
    if (!resolved) {
      resolved = true
      console.error(`[Hermes job ${jobId}] PTY error: ${err.message}`)
      jobs.set(jobId, { ...jobs.get(jobId)!, status: 'error', error: err.message })
    }
  })

  // Timeout after 5 minutes
  setTimeout(() => {
    if (!resolved) {
      resolved = true
      const response = extractResponse(stdout)
      if (response) {
        jobs.set(jobId, { ...jobs.get(jobId)!, status: 'done', response })
      } else {
        jobs.set(jobId, { ...jobs.get(jobId)!, status: 'error', error: 'Hermes timed out after 5 minutes' })
      }
      console.log(`[Hermes job ${jobId}] Timed out`)
      ptyProcess.kill()
    }
  }, 5 * 60 * 1000)
}

// ─── Routes ──────────────────────────────────────────────────────────────────

interface HermesRequest {
  message: string
  personId?: string
  mysteryId?: string
  documentContext?: string
  contextMode: 'person' | 'mystery' | 'document' | 'briefing' | 'chat'
  sessionId?: string
  tools?: string
  model?: string // Model parameter for explicit model selection
}

// POST /api/hermes/chat — starts async job, returns jobId immediately
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      message,
      personId,
      mysteryId,
      documentContext,
      contextMode,
      sessionId,
      model,
    } = body as HermesRequest

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      )
    }

    // Build context prefix
    let context = `Context mode: ${contextMode || 'chat'}`
    if (personId) context += `\nPerson ID: ${personId}`
    if (mysteryId) context += `\nMystery ID: ${mysteryId}`
    if (documentContext) context += `\nDocument context: ${documentContext}`
    context += '\n\n'

    const fullPrompt = `${context}User: ${message}\n\nPlease respond as a GPS-compliant genealogy research assistant.`

    const jobId = randomUUID()
    jobs.set(jobId, { id: jobId, status: 'processing', response: null, error: null, createdAt: Date.now() })

    console.log(`[Hermes] Chat job created: ${jobId} (mode=${contextMode}, session=${sessionId || 'default'}, model=${model || 'minimax'})`)

    // Fire and forget — Hermes runs in background
    startHermesJob(jobId, fullPrompt, model)

    // Return immediately with job ID
    return NextResponse.json({ jobId, status: 'processing' })
  } catch (error: any) {
    console.error('[Hermes Chat] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// GET /api/hermes/chat?jobId=xxx — poll for job result
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId query parameter is required' },
      { status: 400 }
    )
  }

  const job = jobs.get(jobId)
  if (!job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    response: job.response,
    error: job.error,
  })
}
