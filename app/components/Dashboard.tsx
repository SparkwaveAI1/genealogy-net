'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Mystery {
  id: string
  title: string
  status?: string
}

interface Person {
  id: string
  given_name: string
  surname: string
  confidence?: string
}

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mysteries, setMysteries] = useState<Mystery[]>([])
  const [needsAttention, setNeedsAttention] = useState<Person[]>([])
  const [wikiActivity, setWikiActivity] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Load initial briefing and data
    loadBriefing()
    loadMysteries()
    loadNeedsAttention()
    loadWikiActivity()
  }, [])

  const loadBriefing = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: 'Generate a research briefing for today'
          }],
          mode: 'briefing'
        })
      })

      const data = await response.json()
      if (data.message) {
        setMessages([{ role: 'assistant', content: data.message }])
      }
    } catch (error) {
      console.error('Error loading briefing:', error)
      setMessages([{
        role: 'assistant',
        content: 'Good morning. Ready to assist with your genealogical research today.'
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const loadMysteries = async () => {
    try {
      const response = await fetch('/api/mysteries')
      const data = await response.json()
      setMysteries(data.mysteries || [])
    } catch (error) {
      console.error('Error loading mysteries:', error)
    }
  }

  const loadNeedsAttention = async () => {
    try {
      const response = await fetch('/api/needs-attention')
      const data = await response.json()
      setNeedsAttention(data.people || [])
    } catch (error) {
      console.error('Error loading needs attention:', error)
    }
  }

  const loadWikiActivity = async () => {
    try {
      const response = await fetch('/api/wiki-sync')
      const data = await response.json()
      setWikiActivity(data.entries || [])
    } catch (error) {
      console.error('Error loading wiki activity:', error)
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }]
        })
      })

      const data = await response.json()
      if (data.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.'
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen">
      {/* Agent Panel (Center) */}
      <div className="flex-1 flex flex-col border-r border-[#D3D1C7]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#D3D1C7] bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-[15px] font-semibold">Hermes</h1>
              <span className="text-[11px] text-gray-500">Claude · <button className="text-[#EF9F27] hover:underline">swap model</button></span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && !isLoading && (
            <div className="h-full flex items-center justify-center text-gray-400 text-[13px]">
              <p>Loading briefing...</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`mb-4 ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block max-w-[80%] ${
                msg.role === 'user'
                  ? 'bg-[#EF9F27] text-white'
                  : 'bg-white border border-[#D3D1C7]'
              } rounded-lg px-4 py-3 text-[13px]`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="mb-4">
              <div className="inline-block bg-white border border-[#D3D1C7] rounded-lg px-4 py-3 text-[13px] text-gray-400">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[#D3D1C7] bg-white">
          <form onSubmit={sendMessage}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Hermes anything..."
              className="w-full px-4 py-2 border border-[#D3D1C7] rounded-lg focus:outline-none focus:border-[#EF9F27] text-[13px]"
              disabled={isLoading}
            />
          </form>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-[300px] overflow-y-auto bg-[#F5F2ED]">
        <div className="p-4 space-y-4">
          {/* Document Upload */}
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4">
            <h3 className="text-[13px] font-semibold mb-3">Document Upload</h3>
            <div className="border-2 border-dashed border-[#D3D1C7] rounded-lg p-4 text-center mb-3 cursor-pointer hover:border-[#EF9F27] transition-colors">
              <p className="text-[11px] text-gray-500">Drop files here or click</p>
            </div>
            <textarea
              placeholder="Who does this relate to?"
              className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-2"
              rows={3}
            />
            <select className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-2">
              <option>Document type</option>
              <option>Census</option>
              <option>Birth Certificate</option>
              <option>Death Certificate</option>
              <option>Marriage Record</option>
            </select>
            <textarea
              placeholder="Processing instructions"
              className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-2"
              rows={3}
            />
            <select className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-3">
              <option>Link to mystery</option>
              {mysteries.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
            <button className="w-full bg-[#EF9F27] text-white py-2 rounded text-[11px] font-medium hover:bg-[#d88d1f] transition-colors">
              Analyze with Hermes
            </button>
          </div>

          {/* Active Mysteries */}
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4">
            <h3 className="text-[13px] font-semibold mb-3">Active Mysteries</h3>
            {mysteries.length === 0 ? (
              <p className="text-[11px] text-gray-500">No active mysteries</p>
            ) : (
              <div className="space-y-2">
                {mysteries.slice(0, 5).map(mystery => (
                  <Link
                    key={mystery.id}
                    href={`/mysteries/${mystery.id}`}
                    className="block p-2 bg-[#F5F2ED] rounded hover:bg-[#EF9F27]/10 transition-colors"
                  >
                    <div className="text-[11px] font-medium">{mystery.title}</div>
                    {mystery.status && (
                      <div className="text-[10px] text-gray-500 mt-0.5">{mystery.status}</div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Needs Attention */}
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4">
            <h3 className="text-[13px] font-semibold mb-3">Needs Attention</h3>
            {needsAttention.length === 0 ? (
              <p className="text-[11px] text-gray-500">All clear</p>
            ) : (
              <div className="space-y-2">
                {needsAttention.map(person => (
                  <Link
                    key={person.id}
                    href={`/people/${person.id}`}
                    className="block p-2 bg-[#F5F2ED] rounded hover:bg-[#EF9F27]/10 transition-colors"
                  >
                    <div className="text-[11px] font-medium">
                      {person.given_name} {person.surname}
                    </div>
                    {person.confidence && (
                      <div className="text-[10px] text-gray-500 mt-0.5">{person.confidence}</div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Wiki Activity */}
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4">
            <h3 className="text-[13px] font-semibold mb-3">Wiki Activity</h3>
            {wikiActivity.length === 0 ? (
              <p className="text-[11px] text-gray-500">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {wikiActivity.map((entry, idx) => (
                  <div key={idx} className="text-[10px] text-gray-600 leading-relaxed">
                    {entry}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
