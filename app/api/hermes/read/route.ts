import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'

/**
 * GET /api/hermes/read
 * 
 * Read GRIP data from Supabase using service role client.
 * Supports reading from: people, mysteries, evidence, documents tables.
 * 
 * Query params:
 *   - table: 'people' | 'mysteries' | 'evidence' | 'documents' (required)
 *   - id: optional UUID to fetch single record
 *   - person_id: optional filter for evidence/documents by person_id
 *   - mystery_id: optional filter for evidence by mystery_id
 *   - limit: max records to return (default: 50)
 *   - offset: pagination offset (default: 0)
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    
    const table = searchParams.get('table') as 'people' | 'mysteries' | 'evidence' | 'documents' | null
    const id = searchParams.get('id')
    const personId = searchParams.get('person_id')
    const mysteryId = searchParams.get('mystery_id')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    
    if (!table) {
      return NextResponse.json(
        { error: 'Missing required parameter: table' },
        { status: 400 }
      )
    }
    
    const validTables = ['people', 'mysteries', 'evidence', 'documents']
    if (!validTables.includes(table)) {
      return NextResponse.json(
        { error: `Invalid table: ${table}. Must be one of: ${validTables.join(', ')}` },
        { status: 400 }
      )
    }
    
    // Map 'evidence' to actual table name if needed (may be mystery_evidence)
    const tableName = table === 'evidence' ? 'mystery_evidence' : table
    
    // Build query
    let query = supabaseService.from(tableName).select('*', { count: 'exact' })
    
    // Single record fetch by ID
    if (id) {
      query = query.eq('id', id).limit(1)
    } else {
      // Apply filters for related records
      if (personId && (table === 'evidence' || table === 'documents')) {
        query = query.eq('person_id', personId)
      }
      if (mysteryId && table === 'evidence') {
        query = query.eq('mystery_id', mysteryId)
      }
      
      // Apply pagination
      query = query.range(offset, offset + limit - 1)
    }
    
    const { data, error, count } = await query
    
    if (error) {
      console.error(`[Hermes Read] Error reading ${table}:`, error)
      return NextResponse.json(
        { error: `Failed to read ${table}: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      [table]: data || [],
      count: count || 0,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('[Hermes Read] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
