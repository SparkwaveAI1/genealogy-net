import { GrampsPerson, GrampsEvent, GrampsFamily } from './types'

const GRAMPS_API_URL = process.env.GRAMPS_API_URL || 'http://178.156.250.119/api'
const GRAMPS_USERNAME = process.env.GRAMPS_USERNAME || 'scott'
const GRAMPS_PASSWORD = process.env.GRAMPS_PASSWORD || 'YourPassword123'

let cachedToken: string | null = null
let tokenExpiry: number = 0

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
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }
  return authenticate()
}

/**
 * Make authenticated request to Gramps API
 */
async function grampsRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
 * Get all people or search by name
 */
export async function getPeople(search?: string): Promise<GrampsPerson[]> {
  const endpoint = search ? `/people/?q=${encodeURIComponent(search)}` : '/people/'
  return grampsRequest<GrampsPerson[]>(endpoint)
}

/**
 * Get single person by Gramps ID or handle
 */
export async function getPerson(grampsId: string): Promise<GrampsPerson> {
  console.log('getPerson called with:', grampsId)
  console.log('Full URL:', `${GRAMPS_API_URL}/people/${grampsId}/`)
  const result = await grampsRequest<GrampsPerson>(`/people/${grampsId}/`)
  console.log('Gramps API returned person:', JSON.stringify(result, null, 2))
  return result
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
    const family = await grampsRequest<GrampsFamily>(`/families/${familyHandle}/`)

    let father: GrampsPerson | null = null
    let mother: GrampsPerson | null = null

    if (family.father_handle) {
      father = await grampsRequest<GrampsPerson>(`/people/${family.father_handle}/`)
    }

    if (family.mother_handle) {
      mother = await grampsRequest<GrampsPerson>(`/people/${family.mother_handle}/`)
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
      const family = await grampsRequest<GrampsFamily>(`/families/${familyHandle}/`)

      if (family.child_ref_list) {
        for (const childRef of family.child_ref_list) {
          const child = await grampsRequest<GrampsPerson>(`/people/${childRef.ref}/`)
          children.push(child)
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
      const family = await grampsRequest<GrampsFamily>(`/families/${familyHandle}/`)

      // Get the other spouse
      const spouseHandle = family.father_handle === person.handle
        ? family.mother_handle
        : family.father_handle

      if (spouseHandle) {
        const spouse = await grampsRequest<GrampsPerson>(`/people/${spouseHandle}/`)
        spouses.push(spouse)
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
    const family = await grampsRequest<GrampsFamily>(`/families/${familyHandle}/`)

    if (!family.child_ref_list) {
      return []
    }

    const siblings: GrampsPerson[] = []

    for (const childRef of family.child_ref_list) {
      if (childRef.ref !== person.handle) {
        const sibling = await grampsRequest<GrampsPerson>(`/people/${childRef.ref}/`)
        siblings.push(sibling)
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
  return grampsRequest<GrampsEvent>(`/events/${handleOrId}/`)
}

/**
 * Update person data
 */
export async function updatePerson(grampsId: string, data: Partial<GrampsPerson>): Promise<GrampsPerson> {
  return grampsRequest<GrampsPerson>(`/people/${grampsId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
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
      if (event.type.string.toLowerCase().includes('birth')) {
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
      if (event.type.string.toLowerCase().includes('death')) {
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
