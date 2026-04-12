import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const { data: people, error } = await supabase
      .from('people')
      .select('id, given_name, surname, confidence')
      .or('needs_review.eq.true,confidence.eq.hypothetical')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('Error fetching needs attention:', error)
      return NextResponse.json({ people: [] })
    }

    return NextResponse.json({ people: people || [] })
  } catch (error) {
    console.error('Error in needs-attention API:', error)
    return NextResponse.json({ people: [] })
  }
}
