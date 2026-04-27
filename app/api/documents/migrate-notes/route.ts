import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-service'

export async function POST() {
  try {
    // Add notes column to document_people
    const { error } = await supabaseService.rpc('exec', {
      sql: 'ALTER TABLE document_people ADD COLUMN IF NOT EXISTS notes TEXT;'
    })

    if (error) {
      // If RPC fails, try using the REST API directly
      // Connect to postgres and run the ALTER
      const { createClient } = await import('@supabase/supabase-js')
      const { Pool } = await import('pg')
      
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:placeholder@db.oxpkqnmuwqcnmzvavsuz.supabase.co:5432/postgres',
        ssl: { rejectUnauthorized: false }
      })
      
      await pool.query('ALTER TABLE document_people ADD COLUMN IF NOT EXISTS notes TEXT;')
      await pool.end()
    }

    return NextResponse.json({ success: true, message: 'Notes column added to document_people' })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
