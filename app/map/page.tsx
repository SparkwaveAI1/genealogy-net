'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface LocationStats {
  birthplace_detail: string
  count: number
}

export default function MapPage() {
  const [birthplaces, setBirthplaces] = useState<LocationStats[]>([])
  const [deathPlaces, setDeathPlaces] = useState<LocationStats[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchLocationData()
  }, [])

  async function fetchLocationData() {
    setIsLoading(true)

    try {
      // Get all people with birthplaces
      const { data: people } = await supabase
        .from('people')
        .select('birthplace_detail, death_place_detail')
        .not('birthplace_detail', 'is', null)

      if (people) {
        // Count birthplaces
        const birthCounts: { [key: string]: number } = {}
        const deathCounts: { [key: string]: number } = {}

        people.forEach(person => {
          if (person.birthplace_detail) {
            birthCounts[person.birthplace_detail] = (birthCounts[person.birthplace_detail] || 0) + 1
          }
          if (person.death_place_detail) {
            deathCounts[person.death_place_detail] = (deathCounts[person.death_place_detail] || 0) + 1
          }
        })

        // Convert to arrays and sort by count
        const birthArray = Object.entries(birthCounts)
          .map(([place, count]) => ({ birthplace_detail: place, count }))
          .sort((a, b) => b.count - a.count)

        const deathArray = Object.entries(deathCounts)
          .map(([place, count]) => ({ birthplace_detail: place, count }))
          .sort((a, b) => b.count - a.count)

        setBirthplaces(birthArray)
        setDeathPlaces(deathArray)
      }
    } catch (error) {
      console.error('Error fetching location data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold mb-1">Migration Map</h1>
        <p className="text-[13px] text-gray-600">Geographic distribution and migration patterns</p>
      </div>

      {/* Map Placeholder */}
      <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-12 mb-6">
        <div className="text-center">
          <div className="text-[13px] text-gray-500 mb-2">Interactive map coming soon</div>
          <div className="text-[11px] text-gray-400">
            This will display migration patterns and location data on an interactive map
          </div>
        </div>
      </div>

      {/* Location Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Birthplaces */}
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg">
          <div className="p-4 border-b border-[#D3D1C7]">
            <h2 className="text-[15px] font-semibold">Top Birthplaces</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Most common places of birth</p>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-[11px] text-gray-400 text-center py-4">Loading...</div>
            ) : birthplaces.length === 0 ? (
              <div className="text-[11px] text-gray-400 text-center py-4">No birthplace data</div>
            ) : (
              <div className="space-y-2">
                {birthplaces.slice(0, 10).map((place, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-[#D3D1C7] last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 text-[11px] text-gray-400 font-medium">
                        #{idx + 1}
                      </div>
                      <div className="text-[13px] text-gray-900">
                        {place.birthplace_detail}
                      </div>
                    </div>
                    <div className="text-[11px] font-medium text-gray-600">
                      {place.count} {place.count === 1 ? 'person' : 'people'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Death Places */}
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg">
          <div className="p-4 border-b border-[#D3D1C7]">
            <h2 className="text-[15px] font-semibold">Top Death Places</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Most common places of death</p>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-[11px] text-gray-400 text-center py-4">Loading...</div>
            ) : deathPlaces.length === 0 ? (
              <div className="text-[11px] text-gray-400 text-center py-4">No death place data</div>
            ) : (
              <div className="space-y-2">
                {deathPlaces.slice(0, 10).map((place, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-[#D3D1C7] last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 text-[11px] text-gray-400 font-medium">
                        #{idx + 1}
                      </div>
                      <div className="text-[13px] text-gray-900">
                        {place.birthplace_detail}
                      </div>
                    </div>
                    <div className="text-[11px] font-medium text-gray-600">
                      {place.count} {place.count === 1 ? 'person' : 'people'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Migration Insights */}
      <div className="mt-6 bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4">
        <h2 className="text-[15px] font-semibold mb-3">Migration Insights</h2>
        <div className="text-[13px] text-gray-600 space-y-2">
          <p>
            Future enhancements will include:
          </p>
          <ul className="list-disc list-inside text-[11px] text-gray-500 space-y-1 ml-2">
            <li>Interactive map visualization with markers</li>
            <li>Migration routes between locations</li>
            <li>Timeline view of migrations over time</li>
            <li>Filtering by family lines and time periods</li>
            <li>Export of location data and visualizations</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
