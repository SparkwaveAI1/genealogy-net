import { NextResponse } from 'next/server'
import { getPerson, getPersonBirthYear, getPersonDeathYear } from '@/lib/gramps'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const person = await getPerson(id)
    const birthYear = await getPersonBirthYear(person)
    const deathYear = await getPersonDeathYear(person)

    return NextResponse.json({
      person,
      birthYear,
      deathYear,
    })
  } catch (error) {
    console.error('Error fetching person from Gramps:', error)
    return NextResponse.json(
      { error: 'Failed to fetch person from Gramps' },
      { status: 500 }
    )
  }
}
