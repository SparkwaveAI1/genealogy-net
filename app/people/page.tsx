'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Person } from '@/lib/types'

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const styles = {
    confirmed: 'bg-[#EAF3DE] text-[#27500A]',
    probable: 'bg-[#E6F1FB] text-[#0C447C]',
    possible: 'bg-[#FAEEDA] text-[#633806]',
    hypothetical: 'bg-[#F1EFE8] text-[#5F5E5A]',
    contradicted: 'bg-[#FCEBEB] text-[#791F1F]',
  }

  const style = styles[confidence as keyof typeof styles] || 'bg-[#F1EFE8] text-[#5F5E5A]'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${style}`}>
      {confidence || 'not set'}
    </span>
  )
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [filteredPeople, setFilteredPeople] = useState<Person[]>([])
  const [totalCount, setTotalCount] = useState(0)
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

    // Get total count
    const { count } = await supabase
      .from('people')
      .select('*', { count: 'exact', head: true })

    setTotalCount(count || 0)

    // Get all people data
    const { data, error } = await supabase
      .from('people')
      .select('*')
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
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold mb-1">People</h1>
        <p className="text-[13px] text-gray-600">{totalCount.toLocaleString()} individuals in database</p>
      </div>

      {/* Filters */}
      <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              Search by Name
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
            />
          </div>

          {/* Confidence Filter */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              Confidence Level
            </label>
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
            >
              <option value="all">All Levels</option>
              <option value="confirmed">Confirmed</option>
              <option value="probable">Probable</option>
              <option value="possible">Possible</option>
              <option value="hypothetical">Hypothetical</option>
            </select>
          </div>

          {/* Brick Wall Toggle */}
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              Filters
            </label>
            <label className="flex items-center cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={brickWallFilter}
                onChange={(e) => setBrickWallFilter(e.target.checked)}
                className="h-3.5 w-3.5 text-[#EF9F27] focus:ring-[#EF9F27] border-[#D3D1C7] rounded"
              />
              <span className="ml-2 text-[13px] text-gray-700">Brick Walls Only</span>
            </label>
          </div>
        </div>

        {/* Count Display */}
        <div className="mt-3 pt-3 border-t border-[#D3D1C7]">
          <p className="text-[11px] text-gray-600">
            Showing <span className="font-semibold">{filteredPeople.length.toLocaleString()}</span> of{' '}
            <span className="font-semibold">{people.length.toLocaleString()}</span> people
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 text-[13px]">Loading...</div>
        ) : currentPeople.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-[13px]">No people found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-[#F5F2ED]">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                      Birth Year
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                      Birth Place
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                      Death Year
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                      Ahnentafel
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D3D1C7]">
                  {currentPeople.map((person) => (
                    <tr
                      key={person.id}
                      className="hover:bg-[#F5F2ED] cursor-pointer transition-colors"
                      onClick={() => window.location.href = `/people/${person.id}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[13px] font-medium text-gray-900">
                          {person.given_name} {person.surname}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[13px] text-gray-600">
                        {person.birth_year || '-'}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-gray-600">
                        <div className="max-w-xs truncate">
                          {person.birthplace_detail || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[13px] text-gray-600">
                        {person.death_year || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ConfidenceBadge confidence={person.confidence} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {person.ahnentafel ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium">
                            #{person.ahnentafel}
                          </span>
                        ) : (
                          <span className="text-[13px] text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-[#F5F2ED] px-4 py-3 flex items-center justify-between border-t border-[#D3D1C7]">
                <div className="text-[11px] text-gray-700">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-[#D3D1C7] rounded text-[11px] font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-[#D3D1C7] rounded text-[11px] font-medium text-gray-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
