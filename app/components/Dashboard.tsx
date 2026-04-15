'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import DocumentUploader from './DocumentUploader'

interface Message {
  role: 'user' | 'assistant'
  content: string
  provider?: string
  actions?: ActionButton[]
}

interface ActionButton {
  label: string
  action: string
  params: Record<string, string>
}

const MODEL_OPTIONS = [
  { key: 'gpt-4o-mini', label: 'GPT-4o mini', desc: 'Fast & affordable' },
  { key: 'gemini-flash', label: 'Gemini Flash', desc: 'Fast & efficient' },
  { key: 'llama-balanced', label: 'Groq Llama 3.3', desc: 'Most capable' },
]

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
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatFileInputRef = useRef<HTMLInputElement>(null)

  // Chat attachment state
  const [chatAttachment, setChatAttachment] = useState<File | null>(null)

  // Parse ---ACTIONS--- blocks from AI message content
  function parseActions(content: string): { cleanContent: string; actions: ActionButton[] } {
    const actions: ActionButton[] = []
    const match = content.match(/---ACTIONS---\n([\s\S]*?)$/)
    if (!match) return { cleanContent: content, actions }

    const cleanContent = content.substring(0, match.index!).trim()
    const actionLines = match[1].split('\n').filter(l => l.match(/^\d+\./))

    for (const line of actionLines) {
      const labelMatch = line.match(/\[([^\]]+)\]/)
      const paramsMatch = line.match(/→\s*(\w+)\|(.+)/)
      if (!labelMatch || !paramsMatch) continue

      const label = labelMatch[1].trim()
      const action = paramsMatch[1].trim()
      const params: Record<string, string> = {}
      for (const pair of paramsMatch[2].split('|')) {
        const [k, v] = pair.split('=').map(s => s.trim())
        if (k && v) params[k] = v
      }
      actions.push({ label, action, params })
    }
    return { cleanContent, actions }
  }

  // Execute an action button click
  async function executeAction(action: ActionButton, originalMessage: string) {
    const { action: actionType, params } = action

    if (actionType === 'add_evidence') {
      const payload = {
        table: 'evidence',
        action: 'insert',
        data: {
          content: `[${params.person_id}] ${params.description}`,
          evidence_type: params.evidence_type || 'primary',
          source: params.source || 'Chat attachment',
          confidence: params.confidence || 'medium',
          flag: params.flag || null,
          created_at: new Date().toISOString(),
        },
      }
      try {
        const res = await fetch('/api/hermes/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await res.json()
        if (result.success) {
          alert(`Evidence saved!\n\nPerson: ${params.person_id}\n${params.description}\n\nSource: ${params.source || 'Chat attachment'}`)
        } else {
          alert(`Failed: ${result.error}`)
        }
      } catch (err: any) {
        alert(`Error: ${err.message}`)
      }
    } else if (actionType === 'create_person') {
      alert(`Create person:\n${params.given_name} ${params.surname}\nBirth: ${params.birth_year}\nNotes: ${params.notes}\n\nOpen Gramps Web to create this person, then return here to link it.`)
    } else {
      alert(`Action "${actionType}" not yet implemented.`)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!modelMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.model-menu')) setModelMenuOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [modelMenuOpen])

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
          mode: 'briefing',
          model: selectedModel,
        })
      })

      const data = await response.json()
      if (data.message) {
        setMessages([{ role: 'assistant', content: data.message, provider: data.provider }])
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
    if ((!input.trim() && !chatAttachment) || isLoading) return

    const userMessage = input.trim() || (chatAttachment ? `[Attached file: ${chatAttachment.name}]` : '')
    setInput('')
    setIsLoading(true)

    // Optimistically add user message
    const newUserMsg = { role: 'user' as const, content: userMessage }
    setMessages(prev => [...prev, newUserMsg])

    try {
      const allMessages = [...messages, newUserMsg]

      if (chatAttachment) {
        // Send with file attachment via FormData
        const fd = new FormData()
        fd.append('file', chatAttachment)
        fd.append('messages', JSON.stringify(allMessages))
        fd.append('model', selectedModel)

        const response = await fetch('/api/chat', { method: 'POST', body: fd })
        const data = await response.json()
        if (data.message) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.message, provider: data.provider }])
        } else if (data.error) {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
        }
        setChatAttachment(null)
      } else {
        // Normal JSON chat
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages, model: selectedModel }),
        })
        const data = await response.json()
        if (data.message) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.message, provider: data.provider }])
        } else if (data.error) {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
        }
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

  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setChatAttachment(e.target.files[0])
    }
  }

  const handleChatFileClear = () => {
    setChatAttachment(null)
    if (chatFileInputRef.current) chatFileInputRef.current.value = ''
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
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <span className="model-menu relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setModelMenuOpen(!modelMenuOpen) }}
                    className="text-[#EF9F27] hover:underline flex items-center gap-0.5"
                  >
                    {MODEL_OPTIONS.find(m => m.key === selectedModel)?.label || 'GPT-4o mini'}
                    <span className="text-[9px]">▼</span>
                  </button>
                  {modelMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-[#D3D1C7] rounded-lg shadow-lg z-50 min-w-[180px]">
                      {MODEL_OPTIONS.map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => { setSelectedModel(opt.key); setModelMenuOpen(false) }}
                          className={`w-full text-left px-3 py-2 hover:bg-[#F5F2ED] ${selectedModel === opt.key ? 'font-semibold text-[#EF9F27]' : 'text-gray-700'} text-[11px]`}
                        >
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-[10px] text-gray-400">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </span>
                <span className="text-gray-300 mx-1">·</span>
                <button
                  onClick={() => { setInput('🔍 Ask Homer — type your deep research question here...') }}
                  className="text-[#EF9F27] hover:underline"
                  title="Ask Homer for deep research via Telegram"
                >
                  Ask Homer →
                </button>
              </span>
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
          {messages.map((msg, idx) => {
            const { cleanContent, actions } = msg.actions ? { cleanContent: msg.content, actions: msg.actions } : parseActions(msg.content)
            return (
              <div key={idx} className={`mb-4 ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-[#EF9F27] text-white'
                    : 'bg-white border border-[#D3D1C7]'
                } rounded-lg px-4 py-3 text-[13px]`}>
                  <div className="whitespace-pre-wrap">{cleanContent}</div>
                  {msg.role === 'assistant' && msg.provider && (
                    <div className="text-[9px] text-gray-400 mt-1 pt-1 border-t border-[#E5E5E5]">
                      via {msg.provider}
                    </div>
                  )}
                  {actions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-[#E5E5E5] space-y-1.5">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Actions</div>
                      {actions.map((action, ai) => (
                        <button
                          key={ai}
                          onClick={() => executeAction(action, msg.content)}
                          className="block w-full text-left px-2 py-1.5 bg-[#F5F2ED] hover:bg-[#EDE9E0] border border-[#D3D1C7] rounded text-[12px] text-gray-700 transition-colors"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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
            {/* Attachment preview */}
            {chatAttachment && (
              <div className="mb-2 flex items-center gap-2">
                {chatAttachment.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(chatAttachment)}
                    alt={chatAttachment.name}
                    className="w-12 h-12 object-cover rounded border border-[#D3D1C7]"
                  />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center bg-[#F5F2ED] rounded border border-[#D3D1C7] text-[10px] text-gray-500 text-center px-1">
                    {chatAttachment.name.slice(0, 12)}
                  </div>
                )}
                <div className="flex-1 text-[11px] text-gray-600 truncate">{chatAttachment.name}</div>
                <button
                  type="button"
                  onClick={handleChatFileClear}
                  className="text-gray-400 hover:text-red-500 text-sm"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex gap-2">
              {/* Hidden file input with label wrapper */}
              <label
                className="flex-shrink-0 px-3 py-2 border border-[#D3D1C7] rounded-lg hover:bg-[#F5F2ED] text-gray-500 text-[13px] cursor-pointer"
                title="Attach file"
              >
                📎
                <input
                  ref={chatFileInputRef}
                  type="file"
                  accept="image/*,application/pdf,text/*,.txt,.md,.csv"
                  onChange={handleChatFileSelect}
                  className="hidden"
                />
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() || chatAttachment) sendMessage(e as any);
                  }
                }}
                placeholder="Ask Hermes anything... (Enter to send, Shift+Enter for new line)"
                rows={3}
                className="flex-1 px-4 py-2 border border-[#D3D1C7] rounded-lg focus:outline-none focus:border-[#EF9F27] text-[13px] resize-none"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !chatAttachment)}
                className="flex-shrink-0 px-4 py-2 bg-[#EF9F27] text-white rounded-lg hover:bg-[#D88E1F] disabled:opacity-50 text-[13px] font-medium"
              >
                {isLoading ? '...' : '→'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-[300px] overflow-y-auto bg-[#F5F2ED]">
        <div className="p-4 space-y-4">
          {/* Document Upload */}
          <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4">
            <h3 className="text-[13px] font-semibold mb-3">Document Upload</h3>
            <DocumentUploader contextType="dashboard" />
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
