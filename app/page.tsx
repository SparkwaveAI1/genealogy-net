import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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

export default async function Dashboard() {
  // Query stats with count
  const { count: totalCount } = await supabase
    .from('people')
    .select('*', { count: 'exact', head: true })

  const { count: confirmedCount } = await supabase
    .from('people')
    .select('*', { count: 'exact', head: true })
    .eq('confidence', 'confirmed')

  const { count: needsReviewCount } = await supabase
    .from('people')
    .select('*', { count: 'exact', head: true })
    .eq('needs_review', true)

  // Query mysteries (may not exist)
  let mysteriesData = null
  try {
    const { data } = await supabase
      .from('mysteries')
      .select('*')
      .limit(5)
    mysteriesData = data
  } catch (e) {
    // Table doesn't exist yet
  }

  // Query recent people
  const { data: recentPeople } = await supabase
    .from('people')
    .select('id, given_name, surname, birth_year, death_year, confidence, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Genealogy Research</h1>
            <nav className="flex gap-4">
              <Link
                href="/people"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                People
              </Link>
              <Link
                href="/mysteries"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                Mysteries
              </Link>
            </nav>
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
                className="block px-3 py-2 text-sm font-medium bg-gray-800 text-white rounded-md"
              >
                Dashboard
              </Link>
              <Link
                href="/people"
                className="block px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors"
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
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Total People</div>
              <div className="text-3xl font-bold text-gray-900">{totalCount.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Confirmed</div>
              <div className="text-3xl font-bold text-green-600">{confirmedCount.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Needs Review</div>
              <div className="text-3xl font-bold text-orange-600">{needsReviewCount.toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Active Mysteries Panel */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Active Mysteries</h2>
              </div>
              <div className="p-6">
                {!mysteriesData ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No mysteries yet</p>
                    <Link
                      href="/mysteries"
                      className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700"
                    >
                      Create your first mystery →
                    </Link>
                  </div>
                ) : mysteriesData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No active mysteries</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mysteriesData.map((mystery: any) => (
                      <Link
                        key={mystery.id}
                        href={`/mysteries/${mystery.id}`}
                        className="block p-4 border border-gray-200 rounded-md hover:border-gray-300 hover:shadow-sm transition-all"
                      >
                        <div className="font-medium text-gray-900">{mystery.title}</div>
                        {mystery.core_question && (
                          <div className="text-sm text-gray-600 mt-1">{mystery.core_question}</div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent People Panel */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Recently Added</h2>
              </div>
              <div className="p-6">
                {!recentPeople || recentPeople.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No people found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentPeople.map((person) => (
                      <Link
                        key={person.id}
                        href={`/people/${person.id}`}
                        className="block p-3 border border-gray-200 rounded-md hover:border-gray-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {person.given_name} {person.surname}
                            </div>
                            <div className="text-sm text-gray-600 mt-0.5">
                              {person.birth_year && person.death_year
                                ? `${person.birth_year} - ${person.death_year}`
                                : person.birth_year
                                ? `b. ${person.birth_year}`
                                : person.death_year
                                ? `d. ${person.death_year}`
                                : 'Dates unknown'}
                            </div>
                          </div>
                          <ConfidenceBadge confidence={person.confidence} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
