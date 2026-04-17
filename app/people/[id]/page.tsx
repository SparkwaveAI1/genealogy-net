import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GrampsPerson } from '@/lib/types'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getPerson, getPersonParents, getPersonChildren, getPersonSpouses, getPersonSiblings, getPersonBirthYear, getPersonDeathYear, getPersonBirthEvent, getPersonDeathEvent, getPersonEvents, formatEventDate } from '@/lib/gramps'
import PersonDocuments from '@/app/components/PersonDocuments'

function getInitials(person: GrampsPerson): string {
  const first = person.primary_name.first_name?.charAt(0) || ''
  const last = person.primary_name.surname_list?.[0]?.surname?.charAt(0) || ''
  return (first + last).toUpperCase() || '?'
}

async function PersonCard({ person }: { person: GrampsPerson }) {
  const initials = getInitials(person)
  const fullName = `${person.primary_name.first_name || ''} ${person.primary_name.surname_list?.[0]?.surname || ''}`.trim()

  // Get birth and death years for family members
  const birthYear = await getPersonBirthYear(person)
  const deathYear = await getPersonDeathYear(person)
  const lifeDates = birthYear && deathYear
    ? `${birthYear}–${deathYear}`
    : birthYear
    ? `b. ${birthYear}`
    : deathYear
    ? `d. ${deathYear}`
    : ''

  return (
    <Link
      href={`/people/${person.gramps_id}`}
      className="block bg-[#FDFCFA] border border-[#D3D1C7] rounded p-3 hover:border-[#EF9F27] transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-[#F5F2ED] flex items-center justify-center text-[11px] font-semibold text-gray-700 flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-gray-900 truncate block">
            {fullName}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">{person.gramps_id}</span>
            {lifeDates && <span className="text-[10px] text-gray-500">{lifeDates}</span>}
          </div>
        </div>
      </div>
    </Link>
  )
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PersonPage({ params }: PageProps) {
  const { id } = await params
  console.log('Person page id param:', id)

  // Fetch from Gramps directly (server-side)
  let person: GrampsPerson
  try {
    person = await getPerson(id)
    console.log('getPerson returned:', JSON.stringify(person, null, 2))
  } catch (error) {
    console.error('Error fetching person from Gramps:', error)
    notFound()
  }

  // Fetch family relationships from Gramps
  const { father, mother } = await getPersonParents(id)
  const children = await getPersonChildren(id)
  const spouses = await getPersonSpouses(id)
  const siblings = await getPersonSiblings(id)

  // Get birth/death years
  const birthYear = await getPersonBirthYear(person)
  const deathYear = await getPersonDeathYear(person)

  // Get birth/death events with dates and places
  const birthEventData = await getPersonBirthEvent(person)
  const deathEventData = await getPersonDeathEvent(person)

  // Get all life events
  const allEvents = await getPersonEvents(person)

  // Optional: Check Supabase for supplementary data (confidence, brick_wall, mysteries)
  const supabase = createServerSupabaseClient()
  let supabaseData: any = null
  const { data } = await supabase
    .from('people')
    .select('confidence, brick_wall, needs_review, bio')
    .eq('id', person.gramps_id)
    .maybeSingle()

  if (data) {
    supabaseData = data
  }

  // Fetch connected mysteries (Supabase only)
  const { data: mysteryConnections } = await supabase
    .from('mystery_people')
    .select('mystery_id')
    .eq('person_id', person.gramps_id)

  let mysteries: any[] = []
  if (mysteryConnections && mysteryConnections.length > 0) {
    const mysteryIds = mysteryConnections.map(mc => mc.mystery_id)
    const { data: mysteriesData } = await supabase
      .from('mysteries')
      .select('*')
      .in('id', mysteryIds)
    mysteries = mysteriesData || []
  }

  const fullName = `${person.primary_name.first_name || ''} ${person.primary_name.surname_list?.[0]?.surname || ''}`.trim() || 'Unknown Name'
  const lifeDates = birthYear && deathYear
    ? `${birthYear}–${deathYear}`
    : birthYear
    ? `b. ${birthYear}`
    : deathYear
    ? `d. ${deathYear}`
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
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium font-mono">
                  {person.gramps_id}
                </span>
                {supabaseData?.brick_wall && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#FCEBEB] text-[#791F1F] text-[11px] font-medium">
                    🧱 Brick Wall
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* View in Gramps Web Button */}
          <a
            href={`http://178.156.250.119/person/${person.gramps_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] transition-colors"
          >
            View in Gramps Web ↗
          </a>
        </div>

        {/* Facts Card */}
        {(birthEventData || deathEventData || birthYear || deathYear) && (
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
            <h2 className="text-[15px] font-semibold mb-3">Facts</h2>
            <div className="space-y-3">
              {/* Birth */}
              {(birthEventData || birthYear) && (
                <div className="flex items-start gap-3">
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider w-14 flex-shrink-0 pt-0.5">Born</span>
                  <div className="flex-1">
                    {birthEventData?.event.date?.dateval ? (
                      <div className="text-[13px] text-gray-900 font-medium">{formatEventDate(birthEventData.event.date.dateval)}</div>
                    ) : birthYear ? (
                      <div className="text-[13px] text-gray-900 font-medium">{birthYear}</div>
                    ) : null}
                    {birthEventData?.place && (
                      <div className="text-[12px] text-gray-600 mt-0.5">
                        in {birthEventData.place.name?.value || birthEventData.place.title}
                      </div>
                    )}
                    {birthEventData && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                        confirmed
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Death */}
              {deathEventData ? (
                <div className="flex items-start gap-3">
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider w-14 flex-shrink-0 pt-0.5">Died</span>
                  <div className="flex-1">
                    {deathEventData.event.date?.dateval && (
                      <div className="text-[13px] text-gray-900 font-medium">{formatEventDate(deathEventData.event.date.dateval)}</div>
                    )}
                    {deathEventData.place && (
                      <div className="text-[12px] text-gray-600 mt-0.5">
                        in {deathEventData.place.name?.value || deathEventData.place.title}
                      </div>
                    )}
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                      confirmed
                    </span>
                  </div>
                </div>
              ) : deathYear ? (
                <div className="flex items-start gap-3">
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider w-14 flex-shrink-0 pt-0.5">Died</span>
                  <div className="flex-1">
                    <div className="text-[13px] text-gray-900 font-medium">{deathYear}</div>
                  </div>
                </div>
              ) : birthYear && !deathYear ? (
                <div className="text-[11px] text-gray-500 italic">Death date unknown</div>
              ) : null}
            </div>
          </div>
        )}

        {/* Family Card */}
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
          <h2 className="text-[15px] font-semibold mb-3">Family</h2>

          {/* Parents */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Parents</div>
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
            </div>
            {spouses.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {spouses.map(spouse => (
                  <PersonCard key={spouse.handle} person={spouse} />
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
            </div>
            {children.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {children.map(child => (
                  <PersonCard key={child.handle} person={child} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic">No children recorded</p>
            )}
          </div>

          {/* Siblings */}
          {siblings.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Siblings</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {siblings.map(sibling => (
                  <PersonCard key={sibling.handle} person={sibling} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Life Events */}
        {allEvents.length > 0 && (
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
            <h2 className="text-[15px] font-semibold mb-3">Life Events</h2>
            <div className="space-y-3">
              {allEvents.map((eventData, idx) => {
                // Handle both string and object event types
                const rawType = eventData.event.type
                const eventType = typeof rawType === 'string'
                  ? rawType
                  : (rawType?.string || 'Event')
                const date = formatEventDate(eventData.event.date?.dateval)
                const placeName = eventData.place?.name?.value || eventData.place?.title || ''
                const description = eventData.event.description || ''

                return (
                  <div key={idx} className="border-l-2 border-[#EF9F27] pl-3">
                    <div className="text-[13px] font-medium text-gray-900">{eventType}</div>
                    {date && <div className="text-[12px] text-gray-600">{date}</div>}
                    {placeName && <div className="text-[11px] text-gray-500">{placeName}</div>}
                    {description && <div className="text-[11px] text-gray-600 italic mt-1">{description}</div>}
                    {eventData.role && eventData.role !== 'Primary' && (
                      <div className="text-[10px] text-gray-400 mt-1">Role: {eventData.role}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Open Questions */}
        {supabaseData?.needs_review && (
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
              {supabaseData?.confidence && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Confidence</span>
                  <span className="font-medium">{supabaseData.confidence}</span>
                </div>
              )}
              {supabaseData?.brick_wall !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Brick Wall</span>
                  <span className="font-medium">{supabaseData.brick_wall ? 'Yes' : 'No'}</span>
                </div>
              )}
              {supabaseData?.needs_review !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Needs Review</span>
                  <span className="font-medium">{supabaseData.needs_review ? 'Yes' : 'No'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Gramps Info */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Gramps Data
            </h3>
            <div className="text-[11px] text-gray-600">
              <div className="mb-1">
                <span className="font-medium">ID:</span> <span className="font-mono">{person.gramps_id}</span>
              </div>
              <div className="mb-1">
                <span className="font-medium">Handle:</span> <span className="font-mono text-[10px]">{person.handle}</span>
              </div>
            </div>
          </div>

          {/* Documents */}
          <PersonDocuments
            personId={person.gramps_id}
            personName={`${person.primary_name.first_name || ''} ${person.primary_name.surname_list?.[0]?.surname || ''}`.trim()}
          />

          {/* Connected Mysteries */}
          {mysteries.length > 0 && (
            <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-3">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Connected Mysteries
              </h3>
              <div className="space-y-2">
                {mysteries.map(mystery => (
                  <Link
                    key={mystery.id}
                    href={`/mysteries/${mystery.id}`}
                    className="block p-2 bg-[#FAEEDA] border border-[#EF9F27] rounded hover:bg-[#EF9F27]/20 transition-colors"
                  >
                    <div className="text-[11px] font-medium text-gray-900 leading-tight">{mystery.title}</div>
                    {mystery.core_question && (
                      <div className="text-[10px] text-gray-600 mt-1 leading-tight">{mystery.core_question}</div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Research Notes */}
          {supabaseData?.bio && (
            <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-3">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Research Notes
              </h3>
              <div className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed">{supabaseData.bio}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
