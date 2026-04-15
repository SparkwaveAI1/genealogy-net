import { NextRequest, NextResponse } from 'next/server'
import { getPeople, getPeopleWithDates } from '@/lib/gramps'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query') || searchParams.get('search') || ''
    const withDates = searchParams.get('dates') === 'true'
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const people = withDates
      ? await getPeopleWithDates(query || undefined, limit)
      : await getPeople(query || undefined)

    return NextResponse.json(people)
  } catch (error) {
    console.error('Error fetching people from Gramps:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people from Gramps' },
      { status: 500 }
    )
  }
}
