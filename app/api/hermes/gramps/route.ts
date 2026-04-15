import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'

/**
 * GET /api/hermes/gramps
 * 
 * Proxy route for Gramps Web API calls.
 * Provides authenticated access to Gramps data with proper token management.
 * 
 * Query params:
 *   - endpoint: Gramps API endpoint path (e.g., '/people/', '/families/:handle/')
 *   - page: page number for paginated endpoints (default: 1)
 *   - pagesize: results per page (default: 100)
 *   - keys: comma-separated list of fields to return
 *   - q: search query (for search endpoints)
 */
const GRAMPS_BASE = process.env.GRAMPS_API_URL || 'http://178.156.250.119:5000/api'
const GRAMPS_USER = process.env.GRAMPS_USERNAME || 'scott'
const GRAMPS_PASS = process.env.GRAMPS_PASSWORD || 'claw1234'

interface GrampsToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

let cachedToken: GrampsToken | null = null

async function getGrampsToken(): Promise<string> {
  // Use cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expires_at > Date.now() + 60000) {
    return cachedToken.access_token
  }
  
  const res = await fetch(`${GRAMPS_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: GRAMPS_USER, password: GRAMPS_PASS }),
  })
  
  if (!res.ok) {
    throw new Error(`Gramps auth failed: ${res.status}`)
  }
  
  cachedToken = await res.json()
  return cachedToken!.access_token
}

async function fetchFromGramps(endpoint: string, options?: RequestInit): Promise<any> {
  const token = await getGrampsToken()
  const url = `${GRAMPS_BASE}${endpoint}`
  
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Gramps API error ${res.status}: ${errorText}`)
  }
  
  return res.json()
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    let endpoint = searchParams.get('endpoint')
    
    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing required parameter: endpoint' },
        { status: 400 }
      )
    }
    
    // Build query string parameters
    const page = searchParams.get('page')
    const pagesize = searchParams.get('pagesize')
    const keys = searchParams.get('keys')
    const query = searchParams.get('q')
    
    const queryParts: string[] = []
    if (page) queryParts.push(`page=${page}`)
    if (pagesize) queryParts.push(`pagesize=${pagesize}`)
    if (keys) queryParts.push(`keys=${keys}`)
    if (query) queryParts.push(`q=${encodeURIComponent(query)}`)
    
    if (queryParts.length > 0 && !endpoint.includes('?')) {
      endpoint += '?' + queryParts.join('&')
    }
    
    console.log(`[Hermes Gramps] Fetching: ${GRAMPS_BASE}${endpoint}`)
    
    const data = await fetchFromGramps(endpoint)
    
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Hermes Gramps] Error:', error.message)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch from Gramps' },
      { status: 500 }
    )
  }
}
