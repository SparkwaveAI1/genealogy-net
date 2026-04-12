import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const { data: mysteries, error } = await supabase
      .from('mysteries')
      .select('id, title, status, core_question')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching mysteries:', error)
      return NextResponse.json({ mysteries: [] })
    }

    return NextResponse.json({ mysteries: mysteries || [] })
  } catch (error) {
    console.error('Error in mysteries API:', error)
    return NextResponse.json({ mysteries: [] })
  }
}
