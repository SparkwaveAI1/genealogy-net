import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'

/**
 * POST /api/hermes/write
 * 
 * Write GRIP data to Supabase using service role client.
 * Supports writing to: people, mysteries, evidence, documents tables.
 * 
 * Body:
 *   - table: 'people' | 'mysteries' | 'evidence' | 'documents' (required)
 *   - action: 'insert' | 'update' | 'upsert' | 'delete' (required)
 *   - data: record(s) to write (required for insert/update/upsert)
 *   - id: record ID for update/delete (required for update/delete)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    const { 
      table, 
      action, 
      data, 
      id,
    } = body
    
    if (!table || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: table and action are required' },
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
    
    const validActions = ['insert', 'update', 'upsert', 'delete']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }
    
    // Map 'evidence' to actual table name if needed (may be mystery_evidence)
    const tableName = table === 'evidence' ? 'mystery_evidence' : table
    
    let result
    
    switch (action) {
      case 'insert':
        if (!data) {
          return NextResponse.json(
            { error: 'data is required for insert action' },
            { status: 400 }
          )
        }
        const records = Array.isArray(data) ? data : [data]
        const { data: insertData, error: insertError } = await supabaseService
          .from(tableName)
          .insert(records)
          .select()
        
        if (insertError) {
          console.error(`[Hermes Write] Insert error:`, insertError)
          return NextResponse.json(
            { error: `Insert failed: ${insertError.message}` },
            { status: 500 }
          )
        }
        result = insertData
        break
        
      case 'update':
        if (!id) {
          return NextResponse.json(
            { error: 'id is required for update action' },
            { status: 400 }
          )
        }
        if (!data) {
          return NextResponse.json(
            { error: 'data is required for update action' },
            { status: 400 }
          )
        }
        const { data: updateData, error: updateError } = await supabaseService
          .from(tableName)
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()
        
        if (updateError) {
          console.error(`[Hermes Write] Update error:`, updateError)
          return NextResponse.json(
            { error: `Update failed: ${updateError.message}` },
            { status: 500 }
          )
        }
        result = updateData
        break
        
      case 'upsert':
        if (!data) {
          return NextResponse.json(
            { error: 'data is required for upsert action' },
            { status: 400 }
          )
        }
        const upsertRecords = Array.isArray(data) ? data : [data]
        const { data: upsertData, error: upsertError } = await supabaseService
          .from(tableName)
          .upsert(upsertRecords)
          .select()
        
        if (upsertError) {
          console.error(`[Hermes Write] Upsert error:`, upsertError)
          return NextResponse.json(
            { error: `Upsert failed: ${upsertError.message}` },
            { status: 500 }
          )
        }
        result = upsertData
        break
        
      case 'delete':
        if (!id) {
          return NextResponse.json(
            { error: 'id is required for delete action' },
            { status: 400 }
          )
        }
        const { error: deleteError } = await supabaseService
          .from(tableName)
          .delete()
          .eq('id', id)
        
        if (deleteError) {
          console.error(`[Hermes Write] Delete error:`, deleteError)
          return NextResponse.json(
            { error: `Delete failed: ${deleteError.message}` },
            { status: 500 }
          )
        }
        result = { success: true, deleted_id: id }
        break
    }
    
    return NextResponse.json({
      success: true,
      action,
      table,
      result,
    })
  } catch (error: any) {
    console.error('[Hermes Write] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
