import { NextResponse } from 'next/server'
import { getPeople } from '@/lib/gramps'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')

    const people = await getPeople(search || undefined)
    console.log('Total people returned:', people.length)
    console.log('Handles returned:', people.map((p: any) => p.handle))
    console.log('Raw Gramps people response (first 2):', JSON.stringify(people.slice(0, 2), null, 2))
    return NextResponse.json(people)
  } catch (error) {
    console.error('Error fetching people from Gramps:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people from Gramps' },
      { status: 500 }
    )
  }
}
