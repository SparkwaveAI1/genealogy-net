'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GrampsPerson } from '@/lib/types'

interface PersonDisplay {
  id: string
  gramps_id: string
  given_name: string
  surname: string
  full_name: string
}

export default function PeoplePage() {
  const router = useRouter()
  const [people, setPeople] = useState<PersonDisplay[]>([])
  const [filteredPeople, setFilteredPeople] = useState<PersonDisplay[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const itemsPerPage = 50

  useEffect(() => {
    fetchPeople()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [people, searchTerm])

  async function fetchPeople() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/gramps/people')
      if (!response.ok) {
        throw new Error('Failed to fetch people')
      }
      const grampsPeople: GrampsPerson[] = await response.json()

      const mapped: PersonDisplay[] = grampsPeople.map((p: GrampsPerson) => {
        console.log('Person handle:', p.handle, 'gramps_id:', p.gramps_id)
        return {
          id: p.handle,
          gramps_id: p.gramps_id,
          given_name: p.primary_name.first_name || '',
          surname: p.primary_name.surname_list?.[0]?.surname || '',
          full_name: `${p.primary_name.first_name || ''} ${p.primary_name.surname_list?.[0]?.surname || ''}`.trim(),
        }
      })

      // Sort by surname
      mapped.sort((a, b) => a.surname.localeCompare(b.surname))

      setPeople(mapped)
    } catch (error) {
      console.error('Error fetching people from Gramps:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function applyFilters() {
    let filtered = [...people]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(person =>
        person.full_name.toLowerCase().includes(term)
      )
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
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-semibold">People</h1>
          <a
            href="http://178.156.250.119"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] transition-colors"
          >
            Open in Gramps Web ↗
          </a>
        </div>
        <p className="text-[13px] text-gray-600">{people.length.toLocaleString()} individuals from Gramps</p>
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
          <div className="p-8 text-center text-gray-500 text-[13px]">Loading from Gramps...</div>
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
                      Gramps ID
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D3D1C7]">
                  {currentPeople.map((person) => (
                    <tr
                      key={person.id}
                      className="hover:bg-[#F5F2ED] cursor-pointer transition-colors"
                      onClick={() => router.push(`/people/${person.id}`)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[13px] font-medium text-gray-900">
                          {person.full_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-medium font-mono">
                          {person.gramps_id}
                        </span>
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
