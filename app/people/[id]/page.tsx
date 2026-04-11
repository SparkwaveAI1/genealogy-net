import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Person, FamilyRelationship } from '@/lib/types'

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const colors = {
    confirmed: 'bg-green-100 text-green-800',
    probable: 'bg-blue-100 text-blue-800',
    possible: 'bg-yellow-100 text-yellow-800',
    hypothetical: 'bg-gray-100 text-gray-800',
    contradicted: 'bg-red-100 text-red-800',
  }

  const color = colors[confidence as keyof typeof colors] || 'bg-gray-100 text-gray-500'

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {confidence || 'not set'}
    </span>
  )
}

interface PageProps {
  params: { id: string }
}

export default async function PersonPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  // Fetch person
  const { data: person, error } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !person) {
    notFound()
  }

  // Fetch family relationships
  const { data: relationships } = await supabase
    .from('family_relationships')
    .select('*')
    .or(`person_id.eq.${id},related_person_id.eq.${id}`)

  // Get related person IDs
  const relatedIds = relationships?.map(rel =>
    rel.person_id === id ? rel.related_person_id : rel.person_id
  ) || []

  // Fetch related people
  let relatedPeople: Person[] = []
  if (relatedIds.length > 0) {
    const { data } = await supabase
      .from('people')
      .select('*')
      .in('id', relatedIds)
    relatedPeople = data || []
  }

  // Organize family by relationship type
  const parents: any[] = []
  const spouses: any[] = []
  const children: any[] = []
  const siblings: any[] = []

  relationships?.forEach(rel => {
    const isSubject = rel.person_id === id
    const relatedId = isSubject ? rel.related_person_id : rel.person_id
    const relatedPerson = relatedPeople.find(p => p.id === relatedId)

    if (!relatedPerson) return

    const relType = rel.relationship_type
    const entry = {
      ...relatedPerson,
      relationshipType: relType,
    }

    if (relType === 'parent' && isSubject) {
      parents.push(entry)
    } else if (relType === 'child' && !isSubject) {
      parents.push(entry)
    } else if (relType === 'spouse') {
      spouses.push(entry)
    } else if (relType === 'child' && isSubject) {
      children.push(entry)
    } else if (relType === 'parent' && !isSubject) {
      children.push(entry)
    } else if (relType === 'sibling') {
      siblings.push(entry)
    }
  })

  // Fetch sources (if there's a join table or direct reference)
  // For now, we'll leave this as a placeholder since the exact schema isn't clear
  const sources: any[] = []

  const fullName = [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unknown Name'
  const lifeDates = person.birth_year && person.death_year
    ? `${person.birth_year} - ${person.death_year}`
    : person.birth_year
    ? `b. ${person.birth_year}`
    : person.death_year
    ? `d. ${person.death_year}`
    : ''

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
              {lifeDates && <p className="text-sm text-gray-600 mt-1">{lifeDates}</p>}
            </div>
            <ConfidenceBadge confidence={person.confidence} />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Dark Sidebar */}
        <aside className="w-64 min-h-screen bg-gray-900 text-gray-100">
          <div className="p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Navigation
            </h2>
            <nav className="space-y-2">
              <Link
                href="/"
                className="block px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/people"
                className="block px-3 py-2 text-sm font-medium bg-gray-800 text-white rounded-md"
              >
                People
              </Link>
              <Link
                href="/mysteries"
                className="block px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors"
              >
                Mysteries
              </Link>
            </nav>

            <div className="mt-8">
              <Link
                href="/people"
                className="block px-3 py-2 text-sm font-medium text-blue-400 hover:text-blue-300"
              >
                ← Back to People
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 max-w-5xl">
          {/* Open Questions Alert */}
          {person.needs_review && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-orange-800">Open Questions</h3>
                  <p className="text-sm text-orange-700 mt-1">This person's record needs review</p>
                </div>
              </div>
            </div>
          )}

          {/* Facts Section */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Facts</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Birth */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-700">Birth</div>
                  <div className="text-sm text-gray-900 mt-1">
                    {person.birth_year && (
                      <div>
                        {person.birth_year_type === 'circa' && 'circa '}
                        {person.birth_year}
                      </div>
                    )}
                    {person.birthplace_detail && (
                      <div className="text-gray-600">{person.birthplace_detail}</div>
                    )}
                    {!person.birth_year && !person.birthplace_detail && (
                      <div className="text-gray-400">Unknown</div>
                    )}
                  </div>
                </div>
                {person.confidence && <ConfidenceBadge confidence={person.confidence} />}
              </div>

              {/* Death */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-700">Death</div>
                  <div className="text-sm text-gray-900 mt-1">
                    {person.death_year && (
                      <div>
                        {person.death_year_type === 'circa' && 'circa '}
                        {person.death_year}
                      </div>
                    )}
                    {person.death_place_detail && (
                      <div className="text-gray-600">{person.death_place_detail}</div>
                    )}
                    {!person.death_year && !person.death_place_detail && (
                      <div className="text-gray-400">Unknown</div>
                    )}
                  </div>
                </div>
                {person.confidence && <ConfidenceBadge confidence={person.confidence} />}
              </div>

              {/* Burial */}
              {person.burial_place && (
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-700">Burial</div>
                    <div className="text-sm text-gray-900 mt-1">{person.burial_place}</div>
                    {person.burial_notes && (
                      <div className="text-sm text-gray-600 mt-1">{person.burial_notes}</div>
                    )}
                  </div>
                  {person.confidence && <ConfidenceBadge confidence={person.confidence} />}
                </div>
              )}
            </div>
          </div>

          {/* Family Section */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Family</h2>
            </div>
            <div className="p-6">
              {parents.length === 0 && spouses.length === 0 && children.length === 0 && siblings.length === 0 ? (
                <p className="text-sm text-gray-500">No family relationships recorded</p>
              ) : (
                <div className="space-y-4">
                  {parents.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Parents</h3>
                      <div className="space-y-2">
                        {parents.map(p => (
                          <Link
                            key={p.id}
                            href={`/people/${p.id}`}
                            className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {p.given_name} {p.surname}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {spouses.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Spouses</h3>
                      <div className="space-y-2">
                        {spouses.map(p => (
                          <Link
                            key={p.id}
                            href={`/people/${p.id}`}
                            className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {p.given_name} {p.surname}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {children.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Children</h3>
                      <div className="space-y-2">
                        {children.map(p => (
                          <Link
                            key={p.id}
                            href={`/people/${p.id}`}
                            className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {p.given_name} {p.surname}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {siblings.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Siblings</h3>
                      <div className="space-y-2">
                        {siblings.map(p => (
                          <Link
                            key={p.id}
                            href={`/people/${p.id}`}
                            className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {p.given_name} {p.surname}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sources Section */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
            </div>
            <div className="p-6">
              {sources.length === 0 ? (
                <p className="text-sm text-gray-500">No sources recorded</p>
              ) : (
                <div className="space-y-3">
                  {sources.map((source: any, idx: number) => (
                    <div key={idx} className="text-sm">
                      <div className="font-medium text-gray-900">{source.title}</div>
                      {source.author && <div className="text-gray-600">Author: {source.author}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Research Notes */}
          {person.bio && (
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Research Notes</h2>
              </div>
              <div className="p-6">
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{person.bio}</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
              Add to Mystery
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
