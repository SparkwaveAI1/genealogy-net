import { NextResponse } from 'next/server'
import { getPersonParents, getPersonChildren, getPersonSpouses, getPersonSiblings } from '@/lib/gramps'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const { father, mother } = await getPersonParents(id)
    const children = await getPersonChildren(id)
    const spouses = await getPersonSpouses(id)
    const siblings = await getPersonSiblings(id)

    return NextResponse.json({
      father,
      mother,
      children,
      spouses,
      siblings,
    })
  } catch (error) {
    console.error('Error fetching family from Gramps:', error)
    return NextResponse.json(
      { error: 'Failed to fetch family from Gramps' },
      { status: 500 }
    )
  }
}
