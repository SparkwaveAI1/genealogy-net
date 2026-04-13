import { NextResponse } from 'next/server'
import { getPeople } from '@/lib/gramps'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')

    const people = await getPeople(search || undefined)
    console.log('API route returning', people.length, 'people')
    if (people.length > 0) {
      console.log('First person sample:', JSON.stringify(people[0], null, 2))
    }
    return NextResponse.json(people)
  } catch (error) {
    console.error('Error fetching people from Gramps:', error)
    return NextResponse.json(
      { error: 'Failed to fetch people from Gramps' },
      { status: 500 }
    )
  }
}
