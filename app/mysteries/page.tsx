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
  const colors = {
    open: 'bg-blue-100 text-blue-800',
    investigating: 'bg-purple-100 text-purple-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  }

  const color = colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status || 'open'}
    </span>
  )
}

export default function MysteriesPage() {
  const [mysteries, setMysteries] = useState<Mystery[]>([])
  const [evidenceCounts, setEvidenceCounts] = useState<{ [key: string]: number }>({})
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Mysteries</h1>
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
                className="block px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors"
              >
                People
              </Link>
              <Link
                href="/mysteries"
                className="block px-3 py-2 text-sm font-medium bg-gray-800 text-white rounded-md"
              >
                Mysteries
              </Link>
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Action Bar */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Active Investigations</h2>
              <p className="text-sm text-gray-600 mt-1">
                {mysteries.length} {mysteries.length === 1 ? 'mystery' : 'mysteries'}
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              New Mystery
            </button>
          </div>

          {/* Create Form Modal */}
          {showCreateForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Mystery</h3>
                <form onSubmit={handleCreateMystery}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Title *
                      </label>
                      <input
                        type="text"
                        value={newMystery.title}
                        onChange={(e) => setNewMystery({ ...newMystery, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Where was John Smith born?"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Core Question
                      </label>
                      <textarea
                        value={newMystery.core_question}
                        onChange={(e) => setNewMystery({ ...newMystery, core_question: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
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
            <div className="text-center py-12 text-gray-500">Loading mysteries...</div>
          ) : mysteries.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No mysteries yet</h3>
              <p className="text-gray-600 mb-6">
                Create your first mystery to start tracking research questions and evidence
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Create Mystery
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {mysteries.map((mystery) => (
                <Link
                  key={mystery.id}
                  href={`/mysteries/${mystery.id}`}
                  className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 flex-1 pr-2">
                        {mystery.title}
                      </h3>
                      <StatusBadge status={mystery.status} />
                    </div>

                    {mystery.core_question && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {mystery.core_question}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-500">
                        {evidenceCounts[mystery.id] || 0} evidence {evidenceCounts[mystery.id] === 1 ? 'item' : 'items'}
                      </div>
                      <div className="text-sm text-blue-600 font-medium">
                        View →
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
