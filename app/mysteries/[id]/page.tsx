'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Person } from '@/lib/types'
import DocumentUploader from '@/app/components/DocumentUploader'

interface Mystery {
  id: string
  title: string
  core_question?: string
  status?: string
  confidence?: string
  created_at: string
}

interface Evidence {
  id: string
  mystery_id: string
  content: string
  source?: string
  flag?: string
  created_at: string
}

interface Action {
  id: string
  mystery_id: string
  action_text: string
  priority?: string
  completed: boolean
  created_at: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function EvidenceFlag({ flag }: { flag?: string }) {
  const styles = {
    corroborates: 'border-l-4 border-[#27500A] bg-[#EAF3DE]',
    contradicts: 'border-l-4 border-[#791F1F] bg-[#FCEBEB]',
    'new-lead': 'border-l-4 border-[#0C447C] bg-[#E6F1FB]',
    suspicious: 'border-l-4 border-[#633806] bg-[#FAEEDA]',
    unverified: 'border-l-4 border-[#5F5E5A] bg-[#F1EFE8]',
  }

  return styles[flag as keyof typeof styles] || 'border-l-4 border-[#5F5E5A] bg-[#F1EFE8]'
}

function PriorityBadge({ priority }: { priority?: string }) {
  const styles = {
    high: 'bg-[#FCEBEB] text-[#791F1F]',
    medium: 'bg-[#FAEEDA] text-[#633806]',
    low: 'bg-[#F1EFE8] text-[#5F5E5A]',
  }

  const style = styles[priority as keyof typeof styles] || 'bg-[#FAEEDA] text-[#633806]'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${style}`}>
      {priority || 'medium'}
    </span>
  )
}

export default function MysteryWorkspace() {
  const params = useParams()
  const id = params?.id as string

  const [mystery, setMystery] = useState<Mystery | null>(null)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [connectedPeople, setConnectedPeople] = useState<Person[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showAddEvidence, setShowAddEvidence] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newEvidence, setNewEvidence] = useState({
    content: '',
    source: '',
    flag: 'unverified',
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (id) {
      fetchMysteryData()
    }
  }, [id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMysteryData() {
    // Fetch mystery
    const { data: mysteryData } = await supabase
      .from('mysteries')
      .select('*')
      .eq('id', id)
      .single()

    if (mysteryData) {
      setMystery(mysteryData)
    }

    // Fetch evidence
    const { data: evidenceData } = await supabase
      .from('mystery_evidence')
      .select('*')
      .eq('mystery_id', id)
      .order('created_at', { ascending: false })

    if (evidenceData) {
      setEvidence(evidenceData)
    }

    // Fetch actions
    const { data: actionsData } = await supabase
      .from('mystery_actions')
      .select('*')
      .eq('mystery_id', id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })

    if (actionsData) {
      setActions(actionsData)
    }

    // Fetch connected people
    const { data: mysteryPeople } = await supabase
      .from('mystery_people')
      .select('person_id')
      .eq('mystery_id', id)

    if (mysteryPeople && mysteryPeople.length > 0) {
      const personIds = mysteryPeople.map(mp => mp.person_id)
      const { data: peopleData } = await supabase
        .from('people')
        .select('*')
        .in('id', personIds)

      if (peopleData) {
        setConnectedPeople(peopleData)
      }
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!inputMessage.trim()) return

    const userMessage: Message = { role: 'user', content: inputMessage }
    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          mystery_context: mystery,
        }),
      })

      const data = await response.json()
      if (data.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAddEvidence(e: React.FormEvent) {
    e.preventDefault()
    if (!newEvidence.content.trim()) return

    try {
      const { error } = await supabase
        .from('mystery_evidence')
        .insert([{
          mystery_id: id,
          content: newEvidence.content,
          source: newEvidence.source || null,
          flag: newEvidence.flag,
        }])

      if (error) throw error

      setNewEvidence({ content: '', source: '', flag: 'unverified' })
      setShowAddEvidence(false)
      fetchMysteryData()
    } catch (error) {
      console.error('Error adding evidence:', error)
    }
  }

  async function toggleActionComplete(actionId: string, completed: boolean) {
    try {
      const { error } = await supabase
        .from('mystery_actions')
        .update({ completed: !completed })
        .eq('id', actionId)

      if (error) throw error

      fetchMysteryData()
    } catch (error) {
      console.error('Error updating action:', error)
    }
  }

  if (!mystery) {
    return (
      <div className="p-6">
        <div className="text-[13px] text-gray-500">Loading mystery...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-[#FDFCFA] border-b border-[#D3D1C7] px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/mysteries"
                className="text-[11px] text-gray-500 hover:text-[#EF9F27]"
              >
                ← Mysteries
              </Link>
              <span className="text-[11px] text-gray-400">/</span>
              <h1 className="text-[18px] font-semibold">{mystery.title}</h1>
            </div>
            {mystery.core_question && (
              <p className="text-[13px] text-gray-600">{mystery.core_question}</p>
            )}
          </div>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Evidence */}
        <div className="w-80 bg-[#FDFCFA] border-r border-[#D3D1C7] flex flex-col">
          <div className="p-4 border-b border-[#D3D1C7]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-semibold">Evidence</h2>
              <button
                onClick={() => setShowAddEvidence(!showAddEvidence)}
                className="text-[11px] text-[#EF9F27] font-medium hover:underline"
              >
                + Add
              </button>
            </div>
            <p className="text-[11px] text-gray-500">{evidence.length} items</p>
          </div>

          {showAddEvidence && (
            <div className="p-4 border-b border-[#D3D1C7] bg-[#F5F2ED]">
              <form onSubmit={handleAddEvidence} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    Evidence *
                  </label>
                  <textarea
                    value={newEvidence.content}
                    onChange={(e) => setNewEvidence({ ...newEvidence, content: e.target.value })}
                    className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
                    rows={3}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    Source
                  </label>
                  <input
                    type="text"
                    value={newEvidence.source}
                    onChange={(e) => setNewEvidence({ ...newEvidence, source: e.target.value })}
                    className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    Flag
                  </label>
                  <select
                    value={newEvidence.flag}
                    onChange={(e) => setNewEvidence({ ...newEvidence, flag: e.target.value })}
                    className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
                  >
                    <option value="unverified">Unverified</option>
                    <option value="corroborates">Corroborates</option>
                    <option value="contradicts">Contradicts</option>
                    <option value="new-lead">New Lead</option>
                    <option value="suspicious">Suspicious</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddEvidence(false)
                      setNewEvidence({ content: '', source: '', flag: 'unverified' })
                    }}
                    className="flex-1 px-2 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-white rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-2 py-1.5 bg-[#EF9F27] text-white text-[11px] font-medium rounded hover:bg-[#D88E1F] transition-colors"
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {evidence.length === 0 ? (
              <div className="text-[11px] text-gray-400 text-center py-8">
                No evidence yet
              </div>
            ) : (
              evidence.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded ${EvidenceFlag({ flag: item.flag })}`}
                >
                  <p className="text-[13px] text-gray-900 mb-2">{item.content}</p>
                  {item.source && (
                    <p className="text-[11px] text-gray-600 mb-1">
                      <span className="font-medium">Source:</span> {item.source}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase">
                      {item.flag || 'unverified'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center Panel - Agent */}
        <div className="flex-1 flex flex-col bg-[#F5F2ED]">
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-[13px] text-gray-500 mb-4">
                  Ask Hermes about this mystery
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-2 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-[#EF9F27] text-white'
                          : 'bg-[#FDFCFA] border border-[#D3D1C7] text-gray-900'
                      }`}
                    >
                      <p className="text-[13px] whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t border-[#D3D1C7] bg-[#FDFCFA] p-4">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowUpload(!showUpload)}
                className="flex-shrink-0 px-3 py-2 border border-[#D3D1C7] rounded hover:bg-[#F5F2ED] text-gray-500 text-[13px]"
                title="Upload document"
              >
                📎
              </button>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask Hermes about this mystery..."
                className="flex-1 px-3 py-2 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                className="px-4 py-2 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Thinking...' : 'Send'}
              </button>
            </form>
            {showUpload && (
              <div className="mt-3 pt-3 border-t border-[#D3D1C7]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-gray-700">Upload Document</span>
                  <button
                    onClick={() => setShowUpload(false)}
                    className="text-[11px] text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <DocumentUploader
                  contextType="mystery"
                  contextId={mystery?.id}
                  contextName={mystery?.title}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Actions & People */}
        <div className="w-80 bg-[#FDFCFA] border-l border-[#D3D1C7] flex flex-col overflow-y-auto">
          {/* Actions Queue */}
          <div className="p-4 border-b border-[#D3D1C7]">
            <h2 className="text-[13px] font-semibold mb-3">Action Queue</h2>
            <div className="space-y-2">
              {actions.length === 0 ? (
                <div className="text-[11px] text-gray-400 text-center py-4">
                  No actions queued
                </div>
              ) : (
                actions.map((action) => (
                  <div
                    key={action.id}
                    className={`p-2 border border-[#D3D1C7] rounded ${
                      action.completed ? 'bg-[#F5F2ED] opacity-60' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={action.completed}
                        onChange={() => toggleActionComplete(action.id, action.completed)}
                        className="mt-0.5 h-3.5 w-3.5 text-[#EF9F27] focus:ring-[#EF9F27] border-[#D3D1C7] rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[11px] ${
                            action.completed ? 'line-through text-gray-500' : 'text-gray-900'
                          }`}
                        >
                          {action.action_text}
                        </p>
                        <div className="mt-1">
                          <PriorityBadge priority={action.priority} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Connected People */}
          <div className="p-4">
            <h2 className="text-[13px] font-semibold mb-3">Connected People</h2>
            <div className="space-y-2">
              {connectedPeople.length === 0 ? (
                <div className="text-[11px] text-gray-400 text-center py-4">
                  No people linked
                </div>
              ) : (
                connectedPeople.map((person) => (
                  <Link
                    key={person.id}
                    href={`/people/${person.id}`}
                    className="block p-2 border border-[#D3D1C7] rounded hover:border-[#EF9F27] transition-colors"
                  >
                    <div className="text-[13px] font-medium text-gray-900">
                      {person.given_name} {person.surname}
                    </div>
                    {(person.birth_year || person.death_year) && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {person.birth_year && person.death_year
                          ? `${person.birth_year}–${person.death_year}`
                          : person.birth_year
                          ? `b. ${person.birth_year}`
                          : `d. ${person.death_year}`}
                      </div>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
