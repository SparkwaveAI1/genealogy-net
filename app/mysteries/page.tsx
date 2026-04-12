'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Mystery {
  id: string
  title: string
  core_question?: string
  status?: string
  confidence?: string
  created_at: string
}

function StatusBadge({ status }: { status?: string }) {
  const styles = {
    open: 'bg-[#E6F1FB] text-[#0C447C]',
    investigating: 'bg-[#FAEEDA] text-[#633806]',
    resolved: 'bg-[#EAF3DE] text-[#27500A]',
    closed: 'bg-[#F1EFE8] text-[#5F5E5A]',
  }

  const style = styles[status as keyof typeof styles] || 'bg-[#E6F1FB] text-[#0C447C]'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${style}`}>
      {status || 'open'}
    </span>
  )
}

export default function MysteriesPage() {
  const [mysteries, setMysteries] = useState<Mystery[]>([])
  const [evidenceCounts, setEvidenceCounts] = useState<{ [key: string]: number }>({})
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newMystery, setNewMystery] = useState({
    title: '',
    core_question: '',
  })

  useEffect(() => {
    fetchMysteries()
  }, [])

  async function fetchMysteries() {
    setIsLoading(true)

    try {
      // Get total count
      const { count } = await supabase
        .from('mysteries')
        .select('*', { count: 'exact', head: true })

      setTotalCount(count || 0)

      // Get mysteries data
      const { data: mysteriesData, error } = await supabase
        .from('mysteries')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      if (mysteriesData) {
        setMysteries(mysteriesData)

        // Fetch evidence counts for each mystery
        const counts: { [key: string]: number } = {}
        for (const mystery of mysteriesData) {
          const { count } = await supabase
            .from('mystery_evidence')
            .select('*', { count: 'exact', head: true })
            .eq('mystery_id', mystery.id)

          counts[mystery.id] = count || 0
        }
        setEvidenceCounts(counts)
      }
    } catch (error) {
      console.error('Error fetching mysteries:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreateMystery(e: React.FormEvent) {
    e.preventDefault()

    if (!newMystery.title.trim()) return

    try {
      const { data, error } = await supabase
        .from('mysteries')
        .insert([{
          title: newMystery.title,
          core_question: newMystery.core_question || null,
          status: 'open',
        }])
        .select()

      if (error) throw error

      setNewMystery({ title: '', core_question: '' })
      setShowCreateForm(false)
      fetchMysteries()
    } catch (error) {
      console.error('Error creating mystery:', error)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-semibold">Mysteries</h1>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-3 py-1.5 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] transition-colors"
          >
            New Mystery
          </button>
        </div>
        <p className="text-[13px] text-gray-600">{totalCount} active investigations</p>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#FDFCFA] rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 border border-[#D3D1C7]">
            <h3 className="text-[16px] font-semibold text-gray-900 mb-4">Create New Mystery</h3>
            <form onSubmit={handleCreateMystery}>
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newMystery.title}
                    onChange={(e) => setNewMystery({ ...newMystery, title: e.target.value })}
                    className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
                    placeholder="e.g., Where was John Smith born?"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                    Core Question
                  </label>
                  <textarea
                    value={newMystery.core_question}
                    onChange={(e) => setNewMystery({ ...newMystery, core_question: e.target.value })}
                    className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
                    placeholder="What exactly are we trying to solve?"
                    rows={3}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewMystery({ title: '', core_question: '' })
                  }}
                  className="px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-[#F5F2ED] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] transition-colors"
                >
                  Create Mystery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mysteries Grid */}
      {isLoading ? (
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-12 text-center">
          <div className="text-[13px] text-gray-500">Loading mysteries...</div>
        </div>
      ) : mysteries.length === 0 ? (
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-12 text-center">
          <h3 className="text-[16px] font-medium text-gray-900 mb-2">No mysteries yet</h3>
          <p className="text-[13px] text-gray-600 mb-6">
            Create your first mystery to start tracking research questions and evidence
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-3 py-1.5 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] transition-colors"
          >
            Create Mystery
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mysteries.map((mystery) => (
            <Link
              key={mystery.id}
              href={`/mysteries/${mystery.id}`}
              className="block bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg hover:border-[#EF9F27] transition-colors"
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-[15px] font-semibold text-gray-900 flex-1 pr-2">
                    {mystery.title}
                  </h3>
                  <StatusBadge status={mystery.status} />
                </div>

                {mystery.core_question && (
                  <p className="text-[13px] text-gray-600 mb-4 line-clamp-2">
                    {mystery.core_question}
                  </p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-[#D3D1C7]">
                  <div className="text-[11px] text-gray-500">
                    {evidenceCounts[mystery.id] || 0} evidence {evidenceCounts[mystery.id] === 1 ? 'item' : 'items'}
                  </div>
                  <div className="text-[11px] text-[#EF9F27] font-medium">
                    View →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
