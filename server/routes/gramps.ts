import { Router } from 'express'

const router = Router()
const GRAMPS_BASE = process.env.GRAMPS_API_URL || 'http://178.156.250.119/api'
const GRAMPS_USER = process.env.GRAMPS_USERNAME || 'scott'
const GRAMPS_PASS = process.env.GRAMPS_PASSWORD || 'claw1234'

interface GrampsToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

let cachedToken: GrampsToken | null = null

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60000) {
    return cachedToken.access_token
  }
  const res = await fetch(`${GRAMPS_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: GRAMPS_USER, password: GRAMPS_PASS })
  })
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
  cachedToken = await res.json()
  return cachedToken!.access_token
}

async function grampsFetch(path: string): Promise<any> {
  const token = await getToken()
  const res = await fetch(`${GRAMPS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Gramps API error ${res.status} on ${path}`)
  return res.json()
}

// Proxy all Gramps requests
router.get('/people', async (req, res) => {
  try {
    const data = await grampsFetch('/people/')
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/people/:handle', async (req, res) => {
  try {
    const data = await grampsFetch(`/people/${req.params.handle}/`)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/people/:handle/ancestors', async (req, res) => {
  try {
    const data = await grampsFetch(`/people/${req.params.handle}/?ancestors=true`)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/families/:handle', async (req, res) => {
  try {
    const data = await grampsFetch(`/families/${req.params.handle}/`)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/events/:handle', async (req, res) => {
  try {
    const data = await grampsFetch(`/events/${req.params.handle}/`)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/places/:handle', async (req, res) => {
  try {
    const data = await grampsFetch(`/places/${req.params.handle}/`)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/sources', async (req, res) => {
  try {
    const data = await grampsFetch('/sources/')
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/metadata', async (req, res) => {
  try {
    const data = await grampsFetch('/metadata/')
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export { router as grampsRouter }
