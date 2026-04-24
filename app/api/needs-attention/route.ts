import { NextResponse } from 'next/server'
import { grampsRequest, getEvent, extractEventType } from '@/lib/gramps'
import { GrampsPerson } from '@/lib/types'

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    // Fetch people with event_ref_list so we can check for missing birth/death
    const people: GrampsPerson[] = await grampsRequest(
      '/people/?keys=handle,gramps_id,primary_name,event_ref_list,parent_family_list',
      { signal: controller.signal }
    )

    // Check up to 50 people in parallel for date completeness
    const sample = people.slice(0, 50)
    const checked = await Promise.all(
      sample.map(async (p) => {
        let birthYear: number | null = null
        let deathYear: number | null = null
        let hasBirth = false
        let hasDeath = false

        if (p.event_ref_list && p.event_ref_list.length > 0) {
          const events = await Promise.all(
            p.event_ref_list.map((er: any) => getEvent(er.ref).catch(() => null))
          )
          for (const evt of events) {
            if (!evt) continue
            const typeStr = extractEventType(evt).toLowerCase()
            const year = evt.date?.dateval?.[2] || null
            if (typeStr.includes('birth')) {
              hasBirth = true
              if (year) birthYear = year
            }
            if (typeStr.includes('death')) {
              hasDeath = true
              if (year) deathYear = year
            }
          }
        }

        return {
          handle: p.handle,
          gramps_id: p.gramps_id,
          given_name: p.primary_name?.given_name || '',
          surname: p.primary_name?.surname_list?.[0]?.surname || '',
          birth_year: birthYear,
          death_year: deathYear,
          has_birth: hasBirth,
          has_death: hasDeath,
          has_parents: !!(p.parent_family_list && p.parent_family_list.length > 0),
          has_events: !!(p.event_ref_list && p.event_ref_list.length > 0),
        }
      })
    )

    // Filter: missing birth OR missing death (but has some events — real person, not just a stub)
    const needsAttention = checked
      .filter(p => p.has_events)
      .filter(p => !p.has_birth || !p.has_death)
      .slice(0, 10)

    // Also add people with no events at all (completely empty records)
    const noEvents = people
      .filter(p => !p.event_ref_list || p.event_ref_list.length === 0)
      .slice(0, 5)
      .map(p => ({
        handle: p.handle,
        gramps_id: p.gramps_id,
        given_name: p.primary_name?.given_name || '',
        surname: p.primary_name?.surname_list?.[0]?.surname || '',
        birth_year: null,
        death_year: null,
        has_birth: false,
        has_death: false,
        has_parents: !!(p.parent_family_list && p.parent_family_list.length > 0),
        has_events: false,
      }))

    const result = [...needsAttention, ...noEvents].slice(0, 10)

    // Map to what the Dashboard expects: use gramps_id as 'id' for the Link
    const formatted = result.map(p => {
      // Build a status string for what's missing
      const missing: string[] = []
      if (!p.has_birth) missing.push('no birth date')
      if (!p.has_death) missing.push('no death date')
      if (!p.has_parents) missing.push('no parents')
      return {
        id: p.gramps_id, // Use gramps_id as id for /people/:id routing
        handle: p.handle,
        gramps_id: p.gramps_id,
        given_name: p.given_name,
        surname: p.surname,
        birth_year: p.birth_year,
        death_year: p.death_year,
        status: missing.join(', '),
      }
    })

    clearTimeout(timeout)
    return NextResponse.json({ people: formatted })
  } catch (error: any) {
    clearTimeout(timeout)
    if (error.name === 'AbortError' || error.name === 'TypeError') {
      console.warn('needs-attention API timed out, returning empty')
      return NextResponse.json({ people: [] })
    }
    console.error('Error in needs-attention API:', error)
    return NextResponse.json({ people: [] })
  }
}
