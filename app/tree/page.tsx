'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Person } from '@/lib/types'
import PedigreeView from './PedigreeView'
import AhnentafelView from './AhnentafelView'

function TreePageContent() {
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')

  const [activeTab, setActiveTab] = useState<'pedigree' | 'ahnentafel'>('pedigree')
  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchPeople()
  }, [])

  async function fetchPeople() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .not('ahnentafel', 'is', null)
        .order('ahnentafel', { ascending: true })

      if (error) throw error
      setPeople(data || [])
    } catch (error) {
      console.error('Error fetching people:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-[#FDFCFA] border-b border-[#D3D1C7] px-6 py-4">
        <h1 className="text-[20px] font-semibold mb-4">Family Tree</h1>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-[#D3D1C7]">
          <button
            onClick={() => setActiveTab('pedigree')}
            className={`pb-2 px-1 text-[13px] font-medium transition-colors ${
              activeTab === 'pedigree'
                ? 'border-b-2 border-[#EF9F27] text-gray-900'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Pedigree
          </button>
          <button
            onClick={() => setActiveTab('ahnentafel')}
            className={`pb-2 px-1 text-[13px] font-medium transition-colors ${
              activeTab === 'ahnentafel'
                ? 'border-b-2 border-[#EF9F27] text-gray-900'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Ahnentafel
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'pedigree' ? (
          <PedigreeView initialFocusId={focusId || undefined} />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[13px] text-gray-500">Loading family tree...</div>
          </div>
        ) : (
          <AhnentafelView people={people} />
        )}
      </div>
    </div>
  )
}

export default function TreePage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center">
        <div className="text-[13px] text-gray-500">Loading...</div>
      </div>
    }>
      <TreePageContent />
    </Suspense>
  )
}
