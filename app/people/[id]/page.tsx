import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Person } from '@/lib/types'
import { EditFactsButton, AddRelationshipButton } from './ActionButtons'

function getInitials(person: Person): string {
  const first = person.given_name?.charAt(0) || ''
  const last = person.surname?.charAt(0) || ''
  return (first + last).toUpperCase() || '?'
}

function ConfidenceBadge({ confidence, size = 'normal' }: { confidence?: string; size?: 'normal' | 'small' }) {
  const styles = {
    confirmed: 'bg-[#EAF3DE] text-[#27500A]',
    probable: 'bg-[#E6F1FB] text-[#0C447C]',
    possible: 'bg-[#FAEEDA] text-[#633806]',
    hypothetical: 'bg-[#F1EFE8] text-[#5F5E5A]',
    contradicted: 'bg-[#FCEBEB] text-[#791F1F]',
  }

  const style = styles[confidence as keyof typeof styles] || 'bg-[#F1EFE8] text-[#5F5E5A]'
  const sizeClass = size === 'small' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'

  return (
    <span className={`inline-flex items-center rounded font-medium ${style} ${sizeClass}`}>
      {confidence || 'not set'}
    </span>
  )
}

function ConfidenceDot({ confidence }: { confidence?: string }) {
  const colors = {
    confirmed: 'bg-[#27500A]',
    probable: 'bg-[#0C447C]',
    possible: 'bg-[#633806]',
    hypothetical: 'bg-[#5F5E5A]',
    contradicted: 'bg-[#791F1F]',
  }

  const color = colors[confidence as keyof typeof colors] || 'bg-[#5F5E5A]'

  return <div className={`w-2 h-2 rounded-full ${color}`} />
}

function PersonCard({ person, showDates = true }: { person: Person; showDates?: boolean }) {
  const initials = getInitials(person)
  const isDashed = person.confidence === 'hypothetical'

  return (
    <Link
      href={`/people/${person.id}`}
      className={`block bg-[#FDFCFA] border ${isDashed ? 'border-dashed' : 'border-solid'} border-[#D3D1C7] rounded p-3 hover:border-[#EF9F27] transition-colors`}
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-[#F5F2ED] flex items-center justify-center text-[11px] font-semibold text-gray-700 flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-gray-900 truncate">
              {person.given_name} {person.surname}
            </span>
            <ConfidenceDot confidence={person.confidence} />
          </div>
          {showDates && (person.birth_year || person.death_year) && (
            <div className="text-[11px] text-gray-500 mt-0.5">
              {person.birth_year && person.death_year
                ? `${person.birth_year}–${person.death_year}`
                : person.birth_year
                ? `b. ${person.birth_year}`
                : person.death_year
                ? `d. ${person.death_year}`
                : ''}
            </div>
          )}
        </div>
      </div>
    </Link>
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
  let father: Person | null = null
  let mother: Person | null = null
  const spouses: Person[] = []
  const children: Person[] = []
  const siblings: Person[] = []
  const seenSpouseIds = new Set<string>()

  relationships?.forEach(rel => {
    const isSubject = rel.person_id === id
    const relatedId = isSubject ? rel.related_person_id : rel.person_id
    const relatedPerson = relatedPeople.find(p => p.id === relatedId)

    if (!relatedPerson) return

    const relType = rel.relationship_type

    if (relType === 'father' && isSubject) {
      father = relatedPerson
    } else if (relType === 'mother' && isSubject) {
      mother = relatedPerson
    } else if (relType === 'spouse') {
      // Deduplicate spouses by person_id
      if (!seenSpouseIds.has(relatedPerson.id)) {
        spouses.push(relatedPerson)
        seenSpouseIds.add(relatedPerson.id)
      }
    } else if (relType === 'child' && !isSubject) {
      // Fix: children are where the related person is the child (not the subject)
      children.push(relatedPerson)
    } else if (relType === 'sibling') {
      siblings.push(relatedPerson)
    }
  })

  // Fetch connected mysteries
  const { data: mysteryConnections } = await supabase
    .from('mystery_people')
    .select('mystery_id')
    .eq('person_id', id)

  let mysteries: any[] = []
  if (mysteryConnections && mysteryConnections.length > 0) {
    const mysteryIds = mysteryConnections.map(mc => mc.mystery_id)
    const { data } = await supabase
      .from('mysteries')
      .select('*')
      .in('id', mysteryIds)
    mysteries = data || []
  }

  const fullName = [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unknown Name'
  const lifeDates = person.birth_year && person.death_year
    ? `${person.birth_year}–${person.death_year}`
    : person.birth_year
    ? `b. ${person.birth_year}`
    : person.death_year
    ? `d. ${person.death_year}`
    : ''

  const initials = getInitials(person)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-[#F5F2ED] flex items-center justify-center text-[20px] font-semibold text-gray-700 flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1">
              <h1 className="text-[24px] font-semibold mb-1">{fullName}</h1>
              {lifeDates && <p className="text-[13px] text-gray-600 mb-2">{lifeDates}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <ConfidenceBadge confidence={person.confidence} />
                {person.ahnentafel && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium">
                    Ahnentafel #{person.ahnentafel}
                  </span>
                )}
                {person.brick_wall && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#FCEBEB] text-[#791F1F] text-[11px] font-medium">
                    🧱 Brick Wall
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Facts Card */}
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
          <h2 className="text-[15px] font-semibold mb-3">Facts</h2>
          <div className="space-y-3">
            {/* Birth */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Birth</div>
                {person.birth_year || person.birthplace_detail ? (
                  <div className="text-[13px] text-gray-900 mt-1">
                    {person.birth_year && (
                      <div>
                        {person.birth_year_type === 'circa' && 'circa '}
                        {person.birth_year}
                      </div>
                    )}
                    {person.birthplace_detail && (
                      <div className="text-gray-600">{person.birthplace_detail}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-[13px] text-gray-400 italic mt-1">Unknown</div>
                )}
              </div>
              <ConfidenceBadge confidence={person.birth_date_confidence} size="small" />
            </div>

            {/* Death */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Death</div>
                {person.death_year || person.death_place_detail ? (
                  <div className="text-[13px] text-gray-900 mt-1">
                    {person.death_year && (
                      <div>
                        {person.death_year_type === 'circa' && 'circa '}
                        {person.death_year}
                      </div>
                    )}
                    {person.death_place_detail && (
                      <div className="text-gray-600">{person.death_place_detail}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-[13px] text-gray-400 italic mt-1">Unknown</div>
                )}
              </div>
              <ConfidenceBadge confidence={person.death_date_confidence} size="small" />
            </div>

            {/* Burial */}
            {person.burial_place && (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Burial</div>
                  <div className="text-[13px] text-gray-900 mt-1">{person.burial_place}</div>
                  {person.burial_notes && (
                    <div className="text-[13px] text-gray-600 mt-1">{person.burial_notes}</div>
                  )}
                </div>
                <ConfidenceBadge confidence={person.confidence} size="small" />
              </div>
            )}

            {/* Father */}
            {father !== null && (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Father</div>
                  <div className="text-[13px] text-gray-900 mt-1">
                    <Link href={`/people/${(father as Person).id}`} className="text-[#EF9F27] hover:underline">
                      {(father as Person).given_name} {(father as Person).surname}
                    </Link>
                  </div>
                </div>
                <ConfidenceBadge confidence={(father as Person).confidence} size="small" />
              </div>
            )}

            {/* Mother */}
            {mother !== null && (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Mother</div>
                  <div className="text-[13px] text-gray-900 mt-1">
                    <Link href={`/people/${(mother as Person).id}`} className="text-[#EF9F27] hover:underline">
                      {(mother as Person).given_name} {(mother as Person).surname}
                    </Link>
                  </div>
                </div>
                <ConfidenceBadge confidence={(mother as Person).confidence} size="small" />
              </div>
            )}
          </div>
        </div>

        {/* Family Card */}
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
          <h2 className="text-[15px] font-semibold mb-3">Family</h2>

          {/* Parents */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Parents</div>
              <AddRelationshipButton type="parent" personId={id} />
            </div>
            {(father || mother) ? (
              <div className="grid grid-cols-2 gap-2">
                {father && <PersonCard person={father} />}
                {mother && <PersonCard person={mother} />}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic">No parents recorded</p>
            )}
          </div>
          <div className="h-4 w-px bg-[#D3D1C7] mx-auto"></div>

          {/* Spouses */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Spouses</div>
              <AddRelationshipButton type="spouse" personId={id} />
            </div>
            {spouses.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {spouses.map(spouse => (
                  <PersonCard key={spouse.id} person={spouse} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic">No spouses recorded</p>
            )}
          </div>
          <div className="h-4 w-px bg-[#D3D1C7] mx-auto"></div>

          {/* Children */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Children</div>
              <AddRelationshipButton type="child" personId={id} />
            </div>
            {children.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {children.map(child => (
                  <PersonCard key={child.id} person={child} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic">No children recorded</p>
            )}
          </div>

          {/* Siblings */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Siblings</div>
              <AddRelationshipButton type="sibling" personId={id} />
            </div>
            {siblings.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {siblings.map(sibling => (
                  <PersonCard key={sibling.id} person={sibling} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic">No siblings recorded</p>
            )}
          </div>
        </div>

        {/* Connected Mysteries */}
        {mysteries.length > 0 && (
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
            <h2 className="text-[15px] font-semibold mb-3">Connected Mysteries</h2>
            <div className="space-y-2">
              {mysteries.map(mystery => (
                <Link
                  key={mystery.id}
                  href={`/mysteries/${mystery.id}`}
                  className="block p-3 bg-[#FAEEDA] border border-[#EF9F27] rounded hover:bg-[#EF9F27]/20 transition-colors"
                >
                  <div className="text-[13px] font-medium text-gray-900">{mystery.title}</div>
                  {mystery.core_question && (
                    <div className="text-[11px] text-gray-600 mt-1">{mystery.core_question}</div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
          <h2 className="text-[15px] font-semibold mb-3">Sources</h2>
          <p className="text-[13px] text-gray-400 italic">No sources recorded</p>
        </div>

        {/* Research Notes */}
        {person.bio && (
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
            <h2 className="text-[15px] font-semibold mb-3">Research Notes</h2>
            <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{person.bio}</div>
          </div>
        )}

        {/* Open Questions */}
        {person.needs_review && (
          <div className="bg-[#FDFCFA] border-l-2 border-[#EF9F27] rounded-lg p-4">
            <h3 className="text-[13px] font-semibold text-[#633806] mb-2">Open Questions</h3>
            <p className="text-[13px] text-gray-700">This person's record needs review and verification.</p>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="w-[280px] border-l border-[#D3D1C7] p-4 overflow-y-auto bg-[#F5F2ED]">
        <div className="space-y-4">
          {/* Research Status */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Research Status
            </h3>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-600">Confidence</span>
                <span className="font-medium">{person.confidence || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Brick Wall</span>
                <span className="font-medium">{person.brick_wall ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Needs Review</span>
                <span className="font-medium">{person.needs_review ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Actions
            </h3>
            <div className="space-y-2">
              <button className="w-full px-3 py-2 bg-[#EF9F27] text-white rounded text-[11px] font-medium hover:bg-[#d88d1f] transition-colors">
                Ask Hermes
              </button>
              <button className="w-full px-3 py-2 bg-white border border-[#D3D1C7] rounded text-[11px] font-medium hover:border-[#EF9F27] transition-colors">
                Link to Mystery
              </button>
              <button className="w-full px-3 py-2 bg-white border border-[#D3D1C7] rounded text-[11px] font-medium hover:border-[#EF9F27] transition-colors">
                Upload Document
              </button>
              <EditFactsButton person={person} personId={id} />
            </div>
          </div>

          {/* Wiki Info */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Wiki Page
            </h3>
            <div className="text-[11px] text-gray-600">
              <div className="mb-1">
                <span className="font-mono text-[10px]">
                  people/{person.surname?.toLowerCase()}-{person.given_name?.toLowerCase()}.md
                </span>
              </div>
              <div className="text-gray-400">Last sync: Never</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
