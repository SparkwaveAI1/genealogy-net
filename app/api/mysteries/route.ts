import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const { data: mysteries, error } = await supabase
      .from('mysteries')
      .select('id, title, status, core_question')
      .order('created_at', { ascending: false })
      .limit(10)

    clearTimeout(timeout)
    if (error) {
      console.error('Error fetching mysteries:', error)
      return NextResponse.json({ mysteries: [] })
    }

    return NextResponse.json({ mysteries: mysteries || [] })
  } catch (error: any) {
    clearTimeout(timeout)
    console.error('Error in mysteries API:', error)
    return NextResponse.json({ mysteries: [] })
  }
}
