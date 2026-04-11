'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Person } from '@/lib/types'

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const colors = {
    confirmed: 'bg-green-100 text-green-800',
    probable: 'bg-blue-100 text-blue-800',
    possible: 'bg-yellow-100 text-yellow-800',
    hypothetical: 'bg-orange-100 text-orange-800',
    contradicted: 'bg-red-100 text-red-800',
  }

  const color = colors[confidence as keyof typeof colors] || 'bg-gray-100 text-gray-500'

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {confidence || 'not set'}
    </span>
  )
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [filteredPeople, setFilteredPeople] = useState<Person[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all')
  const [brickWallFilter, setBrickWallFilter] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const itemsPerPage = 50

  useEffect(() => {
    fetchPeople()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [people, searchTerm, confidenceFilter, brickWallFilter])

  async function fetchPeople() {
    setIsLoading(true)
    const { data, error, count } = await supabase
      .from('people')
      .select('*', { count: 'exact' })
      .order('surname', { ascending: true })

    if (data) {
      setPeople(data)
    }
    setIsLoading(false)
  }

  function applyFilters() {
    let filtered = [...people]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(person => {
        const fullName = `${person.given_name || ''} ${person.surname || ''}`.toLowerCase()
        return fullName.includes(term)
      })
    }

    // Confidence filter
    if (confidenceFilter !== 'all') {
      filtered = filtered.filter(person => person.confidence === confidenceFilter)
    }

    // Brick wall filter
    if (brickWallFilter) {
      filtered = filtered.filter(person => person.brick_wall === true)
    }

    setFilteredPeople(filtered)
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(filteredPeople.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentPeople = filteredPeople.slice(startIndex, endIndex)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">People</h1>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              ← Back to Dashboard
            </Link>
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
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search by Name
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Confidence Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confidence Level
                </label>
                <select
                  value={confidenceFilter}
                  onChange={(e) => setConfidenceFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Levels</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="probable">Probable</option>
                  <option value="possible">Possible</option>
                </select>
              </div>

              {/* Brick Wall Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filters
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={brickWallFilter}
                    onChange={(e) => setBrickWallFilter(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Brick Walls Only</span>
                </label>
              </div>
            </div>

            {/* Count Display */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold">{filteredPeople.length.toLocaleString()}</span> of{' '}
                <span className="font-semibold">{people.length.toLocaleString()}</span> people
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : currentPeople.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No people found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Birth Year
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Birth Place
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Death Year
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Confidence
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Brick Wall
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentPeople.map((person) => (
                        <tr
                          key={person.id}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => window.location.href = `/people/${person.id}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {person.given_name} {person.surname}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {person.birth_year || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <div className="max-w-xs truncate">
                              {person.birthplace_detail || '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {person.death_year || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <ConfidenceBadge confidence={person.confidence} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {person.needs_review ? (
                              <span className="text-orange-600 font-medium">Needs Review</span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {person.brick_wall && (
                              <span className="text-red-600" title="Brick Wall">
                                🧱
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                    <div className="text-sm text-gray-700">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
