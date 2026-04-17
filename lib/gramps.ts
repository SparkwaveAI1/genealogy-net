import { GrampsPerson, GrampsEvent, GrampsFamily } from './types'

const GRAMPS_API_URL = process.env.GRAMPS_API_URL || 'http://178.156.250.119:5000/api'
const GRAMPS_USERNAME = process.env.GRAMPS_USERNAME || 'scott'
const GRAMPS_PASSWORD = process.env.GRAMPS_PASSWORD || 'claw1234'

let cachedToken: string | null = null
let tokenExpiry: number = 0

// Module-level cache: all events keyed by handle.
// Built once per serverless cold-start, reused for all subsequent getPeopleWithDates calls.
let allEventsCache: Map<string, GrampsEvent> | null = null
let eventCacheLoading: Promise<Map<string, GrampsEvent>> | null = null

/**
 * Load ALL events from /events/ and cache them by handle.
 * Single network call per serverless invocation; ~23k events.
 */
async function ensureEventCache(): Promise<Map<string, GrampsEvent>> {
  if (allEventsCache) return allEventsCache
  if (eventCacheLoading) return eventCacheLoading

  eventCacheLoading = (async () => {
    const events: any[] = await grampsRequest<any[]>('/events/')
    const map = new Map<string, GrampsEvent>()
    for (const e of events) {
      if (e.handle) map.set(e.handle, e as GrampsEvent)
    }
    allEventsCache = map
    return map
  })()

  return eventCacheLoading
}

/**
 * Authenticate with Gramps Web API and get JWT token
 */
async function authenticate(): Promise<string> {
  const response = await fetch(`${GRAMPS_API_URL}/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: GRAMPS_USERNAME,
      password: GRAMPS_PASSWORD,
    }),
  })

  if (!response.ok) {
    throw new Error(`Gramps authentication failed: ${response.statusText}`)
  }

  const data = await response.json()
  const token = data.access_token
  cachedToken = token

  // JWT tokens typically expire in 1 hour, set expiry to 50 minutes to be safe
  tokenExpiry = Date.now() + 50 * 60 * 1000

  return token
}

/**
 * Get valid JWT token, refreshing if necessary
 */
export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }
  return authenticate()
}

/**
 * Make authenticated request to Gramps API
 */
export async function grampsRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getToken()
  const url = `${GRAMPS_API_URL}${endpoint}`
  console.log('grampsRequest URL:', url)

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  console.log('grampsRequest response status:', response.status, response.statusText)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Gramps API error:', response.status, errorText)
    throw new Error(`Gramps API error: ${response.status} ${errorText}`)
  }

  return response.json()
}

/**
 * Transform a /search/ result to GrampsPerson shape.
 * The /search/ endpoint returns { handle, object: { ...full person... } }
 */
function transformSearchResult(r: any): GrampsPerson {
  return {
    handle: r.handle,
    gramps_id: r.object?.gramps_id,
    primary_name: r.object?.primary_name,
    event_ref_list: r.object?.event_ref_list,
  } as GrampsPerson
}

/**
 * Get all people or search by name.
 * Uses /search/?query= for searches (q= param is invalid on /people/).
 * Uses /people/?keys= for non-search (returns all people).
 */
export async function getPeople(search?: string): Promise<GrampsPerson[]> {
  if (search) {
    // /search/ returns {handle, object:{...}} — transform to GrampsPerson[]
    const results = await grampsRequest<any[]>(`/search/?query=${encodeURIComponent(search)}`)
    return results.map(transformSearchResult)
  }
  // /people/ returns plain GrampsPerson[]
  const keys = 'handle,gramps_id,primary_name'
  return grampsRequest<GrampsPerson[]>(`/people/?keys=${keys}`)
}

/**
 * Get people with birth/death years included — for disambiguation in search UIs.
 * Fetches events per-person directly (no bulk cache needed).
 */
export async function getPeopleWithDates(
  search?: string,
  limit = 8,
): Promise<Array<GrampsPerson & { birth_year: number | null; death_year: number | null }>> {
  // 1. Get base people (with event_ref_list)
  let people: GrampsPerson[]
  if (search) {
    const results = await grampsRequest<any[]>(`/search/?query=${encodeURIComponent(search)}`)
    people = results.map(transformSearchResult)
  } else {
    people = await grampsRequest<GrampsPerson[]>(
      '/people/?keys=handle,gramps_id,primary_name,event_ref_list',
    )
  }

  const limited = people.slice(0, limit)

  // 2. For each person, fetch their events directly and extract birth/death years
  const results = await Promise.all(
    limited.map(async (p) => {
      let birthYear: number | null = null
      let deathYear: number | null = null

      if (p.event_ref_list && p.event_ref_list.length > 0) {
        // Fetch events in parallel for this person
        const eventPromises = p.event_ref_list.map((er: any) =>
          grampsRequest<any>(`/events/${er.ref}`).catch(() => null)
        )
        const events = await Promise.all(eventPromises)

        for (const evt of events) {
          if (!evt) continue
          // Handle both type formats: string "Birth" or object {string: "Birth"}
          const rawType: any = evt.type
          const typeStr: string = typeof rawType === 'string'
            ? rawType.toLowerCase()
            : (rawType?.string || '').toLowerCase()
          const dateval = evt.date?.dateval
          const year = Array.isArray(dateval) ? dateval[2] : null
          if (typeStr.includes('birth') && !birthYear && year) {
            birthYear = year
          }
          if (typeStr.includes('death') && !deathYear && year) {
            deathYear = year
          }
        }
      }

      return { ...p, birth_year: birthYear, death_year: deathYear }
    })
  )

  return results
}

/**
 * Get single person by Gramps ID
 * Uses query parameter ?gramps_id={id} because /people/{id}/ endpoint returns 404
 */
export async function getPerson(grampsId: string): Promise<GrampsPerson> {
  console.log('getPerson called with:', grampsId)
  const endpoint = `/people/?gramps_id=${grampsId}`
  console.log('Full URL:', `${GRAMPS_API_URL}${endpoint}`)
  const result = await grampsRequest<GrampsPerson[]>(endpoint)
  console.log('Gramps API returned:', result.length, 'people')

  if (!result || result.length === 0) {
    throw new Error(`Person not found: ${grampsId}`)
  }

  const person = result[0]
  console.log('Gramps API returned person:', JSON.stringify(person, null, 2))
  return person
}

/**
 * Helper: Get person by handle
 * Since /people/{handle}/ endpoint doesn't work, fetch all and filter
 */
async function getPersonByHandle(handle: string): Promise<GrampsPerson | null> {
  try {
    const allPeople = await grampsRequest<GrampsPerson[]>('/people/?keys=handle,gramps_id,primary_name')
    const person = allPeople.find(p => p.handle === handle)
    return person || null
  } catch (error) {
    console.error(`Error fetching person by handle ${handle}:`, error)
    return null
  }
}

/**
 * Helper: Get family by handle
 * Since /families/{handle}/ endpoint doesn't work, fetch all and filter
 */
async function getFamilyByHandle(handle: string): Promise<GrampsFamily | null> {
  try {
    const allFamilies = await grampsRequest<GrampsFamily[]>('/families/')
    const family = allFamilies.find(f => f.handle === handle)
    return family || null
  } catch (error) {
    console.error(`Error fetching family by handle ${handle}:`, error)
    return null
  }
}

/**
 * Get person's parents
 */
export async function getPersonParents(grampsId: string): Promise<{ father: GrampsPerson | null; mother: GrampsPerson | null }> {
  try {
    const person = await getPerson(grampsId)

    if (!person.parent_family_list || person.parent_family_list.length === 0) {
      return { father: null, mother: null }
    }

    // Get the first parent family
    const familyHandle = person.parent_family_list[0]
    const family = await getFamilyByHandle(familyHandle)

    if (!family) {
      return { father: null, mother: null }
    }

    let father: GrampsPerson | null = null
    let mother: GrampsPerson | null = null

    if (family.father_handle) {
      father = await getPersonByHandle(family.father_handle)
    }

    if (family.mother_handle) {
      mother = await getPersonByHandle(family.mother_handle)
    }

    return { father, mother }
  } catch (error) {
    console.error('Error fetching parents:', error)
    return { father: null, mother: null }
  }
}

/**
 * Get person's children
 */
export async function getPersonChildren(grampsId: string): Promise<GrampsPerson[]> {
  try {
    const person = await getPerson(grampsId)

    if (!person.family_list || person.family_list.length === 0) {
      return []
    }

    const children: GrampsPerson[] = []

    for (const familyHandle of person.family_list) {
      const family = await getFamilyByHandle(familyHandle)

      if (family?.child_ref_list) {
        for (const childRef of family.child_ref_list) {
          const child = await getPersonByHandle(childRef.ref)
          if (child) {
            children.push(child)
          }
        }
      }
    }

    return children
  } catch (error) {
    console.error('Error fetching children:', error)
    return []
  }
}

/**
 * Get person's spouses
 */
export async function getPersonSpouses(grampsId: string): Promise<GrampsPerson[]> {
  try {
    const person = await getPerson(grampsId)

    if (!person.family_list || person.family_list.length === 0) {
      return []
    }

    const spouses: GrampsPerson[] = []

    for (const familyHandle of person.family_list) {
      const family = await getFamilyByHandle(familyHandle)

      if (!family) continue

      // Get the other spouse
      const spouseHandle = family.father_handle === person.handle
        ? family.mother_handle
        : family.father_handle

      if (spouseHandle) {
        const spouse = await getPersonByHandle(spouseHandle)
        if (spouse) {
          spouses.push(spouse)
        }
      }
    }

    return spouses
  } catch (error) {
    console.error('Error fetching spouses:', error)
    return []
  }
}

/**
 * Get person's siblings
 */
export async function getPersonSiblings(grampsId: string): Promise<GrampsPerson[]> {
  try {
    const person = await getPerson(grampsId)

    if (!person.parent_family_list || person.parent_family_list.length === 0) {
      return []
    }

    const familyHandle = person.parent_family_list[0]
    const family = await getFamilyByHandle(familyHandle)

    if (!family?.child_ref_list) {
      return []
    }

    const siblings: GrampsPerson[] = []

    for (const childRef of family.child_ref_list) {
      if (childRef.ref !== person.handle) {
        const sibling = await getPersonByHandle(childRef.ref)
        if (sibling) {
          siblings.push(sibling)
        }
      }
    }

    return siblings
  } catch (error) {
    console.error('Error fetching siblings:', error)
    return []
  }
}

/**
 * Get event details
 */
export async function getEvent(handleOrId: string): Promise<GrampsEvent> {
  // NOTE: Gramps API requires NO trailing slash for event lookup
  return grampsRequest<GrampsEvent>(`/events/${handleOrId}`)
}

/**
 * Update person data
 */
export async function updatePerson(grampsId: string, data: Partial<GrampsPerson>): Promise<GrampsPerson> {
  // Gramps API requires: no trailing slash, full person object in body
  // First fetch the current person, then merge changes
  const people = await grampsRequest<GrampsPerson[]>(`/people/?gramps_id=${grampsId}`)
  if (!people || people.length === 0) throw new Error(`Person ${grampsId} not found`)
  const current = people[0]
  const merged = { ...current, ...data }
  return grampsRequest<GrampsPerson>(`/people/${current.handle}`, {
    method: 'PUT',
    body: JSON.stringify(merged),
  })
}

/**
 * Create a new person in Gramps Web
 */
export async function createPerson(data: {
  primary_name: { first_name: string; surname_list: Array<{ surname: string }> }
  birth_date?: string
  death_date?: string
}): Promise<{ gramps_id: string; handle: string }> {
  const payload = {
    _class: 'Person',
    primary_name: {
      _class: 'Name',
      ...data.primary_name,
      surname_list: data.primary_name.surname_list.map(s => ({ _class: 'Surname', ...s })),
    },
    gender: 1,
  }
  const result = await grampsRequest<any[]>('/people/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  // POST returns a transaction list with the handle
  const handle = result[0]?.handle
  // Fetch the created person to get the gramps_id
  const people = await grampsRequest<GrampsPerson[]>(`/people/?handle=${handle}`)
  const gramps_id = people?.[0]?.gramps_id || ''
  return { gramps_id, handle }
}

/**
 * Create an event in Gramps (Birth, Death, Marriage, etc.)
 */
export async function createEvent(event: {
  type: string
  date?: { year: number; month?: number; day?: number }
  description?: string
  place?: string
}): Promise<{ handle: string }> {
  const dateval = event.date
    ? [event.date.month || 0, event.date.day || 0, event.date.year, false]
    : undefined

  const payload: any = {
    _class: 'Event',
    type: event.type,
    description: event.description || '',
  }
  if (dateval) {
    payload.date = { _class: 'Date', dateval, calendar: 0, modifier: 0, format: null, quality: 0, textval: '' }
  }

  const result = await grampsRequest<any[]>('/events/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return { handle: result[0]?.handle }
}

/**
 * Add an event reference to a person (links event to person)
 */
export async function addEventToPerson(grampsId: string, eventHandle: string, role: string = 'Primary'): Promise<void> {
  const people = await grampsRequest<GrampsPerson[]>(`/people/?gramps_id=${grampsId}`)
  if (!people || people.length === 0) throw new Error(`Person ${grampsId} not found`)
  const person = people[0]

  // Check if event already linked
  const existing = (person.event_ref_list || []).find((e: any) => e.ref === eventHandle)
  if (existing) return

  person.event_ref_list = person.event_ref_list || []
  person.event_ref_list.push({
    _class: 'EventRef',
    ref: eventHandle,
    role,
  } as any)

  await grampsRequest<any>(`/people/${person.handle}`, {
    method: 'PUT',
    body: JSON.stringify(person),
  })
}

/**
 * Extract birth year from Gramps person events
 */
export async function getPersonBirthYear(person: GrampsPerson): Promise<number | null> {
  if (!person.event_ref_list || person.event_ref_list.length === 0) {
    return null
  }

  try {
    for (const eventRef of person.event_ref_list) {
      const event = await getEvent(eventRef.ref)
      const eventType = extractEventType(event)
      if (eventType.toLowerCase().includes('birth')) {
        if (event.date?.dateval) {
          const dateval = event.date.dateval
          // Dateval format: [day, month, year] or [day, month, year, boolean, day2, month2, year2]
          return Array.isArray(dateval) ? dateval[2] : null
        }
      }
    }
  } catch (error) {
    console.error('Error fetching birth year:', error)
  }

  return null
}

/**
 * Extract death year from Gramps person events
 */
export async function getPersonDeathYear(person: GrampsPerson): Promise<number | null> {
  if (!person.event_ref_list || person.event_ref_list.length === 0) {
    return null
  }

  try {
    for (const eventRef of person.event_ref_list) {
      const event = await getEvent(eventRef.ref)
      const eventType = extractEventType(event)
      if (eventType.toLowerCase().includes('death')) {
        if (event.date?.dateval) {
          const dateval = event.date.dateval
          return Array.isArray(dateval) ? dateval[2] : null
        }
      }
    }
  } catch (error) {
    console.error('Error fetching death year:', error)
  }

  return null
}

/**
 * Get place by handle
 */
export async function getPlace(handle: string): Promise<any> {
  try {
    return await grampsRequest<any>(`/places/${handle}`)
  } catch (error) {
    console.error(`Error fetching place ${handle}:`, error)
    return null
  }
}

/**
 * Format Gramps dateval array to readable string
 * Dateval format: [month, day, year, boolean] or [month, day, year]
 * Month is 0-based (0 = unknown, 1 = Jan, 2 = Feb, etc.)
 */
export function formatEventDate(dateval: any[] | undefined): string {
  if (!dateval || !Array.isArray(dateval) || dateval.length < 3) {
    return ''
  }

  const [month, day, year] = dateval
  if (!year) return ''

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  if (month > 0 && day > 0) {
    return `${monthNames[month]} ${day}, ${year}`
  } else if (month > 0) {
    return `${monthNames[month]} ${year}`
  } else {
    return `${year}`
  }
}

/**
 * Extract human-readable event type string from Gramps event
 * Checks event.type._type, event.type (if string), or event.type.string
 */
export function extractEventType(event: GrampsEvent): string {
  if (!event.type) return 'Event'

  // Check for _type property (e.g., event.type._type)
  if (typeof event.type === 'object' && (event.type as any)._type) {
    return (event.type as any)._type
  }

  // Check if type is a string directly
  if (typeof event.type === 'string') {
    return event.type
  }

  // Check for string property (e.g., event.type.string)
  if (typeof event.type === 'object' && (event.type as any).string) {
    return (event.type as any).string
  }

  return 'Event'
}

/**
 * Get person's birth event with full date and place
 */
export async function getPersonBirthEvent(person: GrampsPerson): Promise<{ event: GrampsEvent; place: any } | null> {
  if (!person.event_ref_list || person.event_ref_list.length === 0) {
    return null
  }

  try {
    for (const eventRef of person.event_ref_list) {
      const event = await getEvent(eventRef.ref)
      const eventType = extractEventType(event)
      if (eventType.toLowerCase().includes('birth')) {
        let place = null
        if (event.place) {
          const placeHandle = typeof event.place === 'string' ? event.place : (event.place as any).ref || event.place
          place = await getPlace(placeHandle)
        }
        return { event, place }
      }
    }
  } catch (error) {
    console.error('Error fetching birth event:', error)
  }

  return null
}

/**
 * Get person's death event with full date and place
 */
export async function getPersonDeathEvent(person: GrampsPerson): Promise<{ event: GrampsEvent; place: any } | null> {
  if (!person.event_ref_list || person.event_ref_list.length === 0) {
    return null
  }

  try {
    for (const eventRef of person.event_ref_list) {
      const event = await getEvent(eventRef.ref)
      const eventType = extractEventType(event)
      if (eventType.toLowerCase().includes('death')) {
        let place = null
        if (event.place) {
          const placeHandle = typeof event.place === 'string' ? event.place : (event.place as any).ref || event.place
          place = await getPlace(placeHandle)
        }
        return { event, place }
      }
    }
  } catch (error) {
    console.error('Error fetching death event:', error)
  }

  return null
}

/**
 * Get all events for a person with places
 */
export async function getPersonEvents(person: GrampsPerson): Promise<Array<{ event: GrampsEvent; place: any; role: string }>> {
  if (!person.event_ref_list || person.event_ref_list.length === 0) {
    return []
  }

  const events: Array<{ event: GrampsEvent; place: any; role: string }> = []

  try {
    for (const eventRef of person.event_ref_list) {
      const event = await getEvent(eventRef.ref)
      let place = null
      if (event.place) {
        const placeHandle = typeof event.place === 'string' ? event.place : (event.place as any).ref || event.place
        place = await getPlace(placeHandle)
      }
      events.push({ event, place, role: eventRef.role || 'Primary' })
    }

    // Sort chronologically by date
    events.sort((a, b) => {
      const yearA = a.event.date?.dateval?.[2] || 0
      const yearB = b.event.date?.dateval?.[2] || 0
      return yearA - yearB
    })
  } catch (error) {
    console.error('Error fetching person events:', error)
  }

  return events
}
