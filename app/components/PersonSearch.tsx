'use client'

import { useState, useEffect, useRef } from 'react'
import { Person } from '@/lib/types'

interface PersonSearchProps {
  onSelect: (person: Person | null) => void
  selected: Person | null
  placeholder?: string
  exclude?: string[] // Exclude certain person IDs from results
}

export default function PersonSearch({ onSelect, selected, placeholder, exclude }: PersonSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }

    const searchPeople = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/people?q=${encodeURIComponent(query)}`)
        const data = await response.json()

        let filtered = data.people || []
        if (exclude && exclude.length > 0) {
          filtered = filtered.filter((p: Person) => !exclude.includes(p.id))
        }

        setResults(filtered)
        setIsOpen(true)
      } catch (error) {
        console.error('Error searching people:', error)
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(searchPeople, 300)
    return () => clearTimeout(debounce)
  }, [query, exclude])

  const handleSelect = (person: Person) => {
    onSelect(person)
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  const handleClear = () => {
    onSelect(null)
    setQuery('')
    setResults([])
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border border-[#D3D1C7] rounded bg-[#F5F2ED]">
        <div className="flex-1">
          <div className="text-[13px] font-medium text-gray-900">
            {selected.given_name} {selected.surname}
          </div>
          {(selected.birth_year || selected.death_year) && (
            <div className="text-[11px] text-gray-500">
              {selected.birth_year && selected.death_year
                ? `${selected.birth_year}–${selected.death_year}`
                : selected.birth_year
                ? `b. ${selected.birth_year}`
                : `d. ${selected.death_year}`}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="text-[11px] text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.length >= 2 && setIsOpen(true)}
        placeholder={placeholder || 'Search people...'}
        className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
      />

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#D3D1C7] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => handleSelect(person)}
              className="w-full px-3 py-2 text-left hover:bg-[#F5F2ED] transition-colors border-b border-[#D3D1C7] last:border-0"
            >
              <div className="text-[13px] font-medium text-gray-900">
                {person.given_name} {person.surname}
              </div>
              {(person.birth_year || person.death_year) && (
                <div className="text-[11px] text-gray-500">
                  {person.birth_year && person.death_year
                    ? `${person.birth_year}–${person.death_year}`
                    : person.birth_year
                    ? `b. ${person.birth_year}`
                    : `d. ${person.death_year}`}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#D3D1C7] rounded-lg shadow-lg p-3">
          <div className="text-[11px] text-gray-500">No people found</div>
        </div>
      )}
    </div>
  )
}
