'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
  provider?: string
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

interface AnalysisResult {
  individuals_found: Array<{ name: string; dates?: string; places?: string; role?: string }>
  key_facts: string[]
  confidence_assessment: string
  flags: string[]
  suggested_mystery_link: string
  follow_up_records: string[]
}

interface PeopleMatch {
  extracted_name: string
  extracted_dates: string | null
  extracted_places: string | null
  candidates: Array<{
    gramps_id: string
    name: string
    handle: string
  }>
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

  // Document upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(false)
  const [uploadResult, setUploadResult] = useState<AnalysisResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [individualContext, setIndividualContext] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [processingInstructions, setProcessingInstructions] = useState('')
  const [selectedMysteryId, setSelectedMysteryId] = useState('')
  const [peopleMatches, setPeopleMatches] = useState<PeopleMatch[]>([])
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set())
  const [documentId, setDocumentId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      console.log('File selected:', e.target.files[0].name)
      setSelectedFile(e.target.files[0])
      setUploadResult(null)
      setUploadError(null)
    }
  }

  const handleUpload = async () => {
    console.log('handleUpload called, selectedFile:', selectedFile?.name)

    if (!selectedFile) {
      console.log('No file selected, returning')
      setUploadError('Please select a file first')
      return
    }

    console.log('Starting upload...')
    setUploadProgress(true)
    setUploadResult(null)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('individual_context', individualContext)
      formData.append('document_type', documentType)
      formData.append('processing_instructions', processingInstructions)
      if (selectedMysteryId) {
        formData.append('mystery_id', selectedMysteryId)
      }

      console.log('Sending fetch request to /api/documents')
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })

      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)

      if (!response.ok) {
        setUploadError(data.error || `Upload failed with status ${response.status}`)
        return
      }

      if (data.success && data.analysis) {
        console.log('Analysis received successfully')
        setUploadResult(data.analysis)
        setPeopleMatches(data.people_matches || [])
        setDocumentId(data.document_id || null)
        setSelectedPeople(new Set()) // Reset selected people
      } else {
        setUploadError(data.error || 'Unknown error occurred')
        console.error('Upload error:', data)
      }
    } catch (error) {
      console.error('Error uploading document:', error)
      setUploadError(error instanceof Error ? error.message : 'Network error occurred')
    } finally {
      console.log('Upload process completed')
      setUploadProgress(false)
    }
  }

  const handleAddToWiki = async () => {
    if (!uploadResult) return

    try {
      const content = `## Document Analysis\n\n${uploadResult.key_facts.join('\n')}\n\nConfidence: ${uploadResult.confidence_assessment}`

      await fetch('/api/wiki-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: 'document-analysis.md',
          content,
        }),
      })

      alert('Added to wiki!')
    } catch (error) {
      console.error('Error adding to wiki:', error)
    }
  }

  const togglePersonSelection = (grampsId: string) => {
    const newSelected = new Set(selectedPeople)
    if (newSelected.has(grampsId)) {
      newSelected.delete(grampsId)
    } else {
      newSelected.add(grampsId)
    }
    setSelectedPeople(newSelected)
  }

  const handleSavePeopleLinks = async () => {
    if (!documentId || selectedPeople.size === 0) return

    try {
      // Create document_people records in Supabase
      const response = await fetch('/api/documents/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          gramps_ids: Array.from(selectedPeople),
        }),
      })

      if (response.ok) {
        alert(`Linked ${selectedPeople.size} people to this document!`)
      } else {
        const error = await response.json()
        alert(`Error saving links: ${error.message}`)
      }
    } catch (error) {
      console.error('Error saving people links:', error)
      alert('Error saving people links')
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
          {messages.map((msg, idx) => (
            <div key={idx} className={`mb-4 ${msg.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block max-w-[80%] ${
                msg.role === 'user'
                  ? 'bg-[#EF9F27] text-white'
                  : 'bg-white border border-[#D3D1C7]'
              } rounded-lg px-4 py-3 text-[13px]`}>
                {msg.content}
                {msg.role === 'assistant' && msg.provider && (
                  <div className="text-[9px] text-gray-400 mt-1 pt-1 border-t border-[#E5E5E5]">
                    via {msg.provider}
                  </div>
                )}
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
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Hermes anything..."
                className="flex-1 px-4 py-2 border border-[#D3D1C7] rounded-lg focus:outline-none focus:border-[#EF9F27] text-[13px]"
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

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.doc,.docx"
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#D3D1C7] rounded-lg p-4 text-center mb-3 cursor-pointer hover:border-[#EF9F27] transition-colors"
            >
              {selectedFile ? (
                <div>
                  <p className="text-[11px] text-gray-900 font-medium">{selectedFile.name}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500">Drop files here or click</p>
              )}
            </div>

            <textarea
              value={individualContext}
              onChange={(e) => setIndividualContext(e.target.value)}
              placeholder="Who does this relate to?"
              className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-2 focus:outline-none focus:border-[#EF9F27]"
              rows={3}
            />

            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-2 focus:outline-none focus:border-[#EF9F27]"
            >
              <option value="">Document type</option>
              <option value="census">Census</option>
              <option value="certificate">Birth Certificate</option>
              <option value="certificate">Death Certificate</option>
              <option value="certificate">Marriage Record</option>
              <option value="will">Will</option>
              <option value="deed">Deed</option>
              <option value="letter">Letter</option>
              <option value="photo">Photo</option>
              <option value="other">Other</option>
            </select>

            <textarea
              value={processingInstructions}
              onChange={(e) => setProcessingInstructions(e.target.value)}
              placeholder="Processing instructions"
              className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-2 focus:outline-none focus:border-[#EF9F27]"
              rows={3}
            />

            <select
              value={selectedMysteryId}
              onChange={(e) => setSelectedMysteryId(e.target.value)}
              className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] mb-3 focus:outline-none focus:border-[#EF9F27]"
            >
              <option value="">Link to mystery</option>
              {mysteries.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>

            <button
              onClick={(e) => {
                console.log('Button clicked!', { selectedFile: selectedFile?.name, uploadProgress })
                handleUpload()
              }}
              disabled={!selectedFile || uploadProgress}
              className="w-full bg-[#EF9F27] text-white py-2 rounded text-[11px] font-medium hover:bg-[#d88d1f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploadProgress ? 'Analyzing...' : 'Analyze with Hermes'}
            </button>

            {/* Debug Info */}
            {selectedFile && (
              <div className="mt-2 text-[10px] text-gray-500">
                Ready to upload: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}

            {/* Error Display */}
            {uploadError && (
              <div className="mt-3 p-3 bg-[#FCEBEB] border border-[#791F1F] rounded">
                <div className="text-[11px] text-[#791F1F] font-medium mb-1">Upload Error</div>
                <div className="text-[11px] text-[#791F1F]">{uploadError}</div>
              </div>
            )}

            {/* Analysis Results */}
            {uploadResult && (
              <div className="mt-4 pt-4 border-t border-[#D3D1C7]">
                <h4 className="text-[11px] font-semibold mb-2">Analysis Results</h4>

                {uploadResult.individuals_found.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Individuals Found</div>
                    <div className="space-y-1">
                      {uploadResult.individuals_found.map((ind, idx) => (
                        <div key={idx} className="text-[11px] bg-[#F5F2ED] p-2 rounded">
                          <div className="font-medium">{ind.name}</div>
                          {ind.dates && <div className="text-gray-600">{ind.dates}</div>}
                          {ind.places && <div className="text-gray-600">{ind.places}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {uploadResult.key_facts.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Key Facts</div>
                    <ul className="text-[11px] space-y-1">
                      {uploadResult.key_facts.slice(0, 3).map((fact, idx) => (
                        <li key={idx} className="text-gray-900">• {fact}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {uploadResult.flags.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Flags</div>
                    <div className="space-y-1">
                      {uploadResult.flags.map((flag, idx) => (
                        <div key={idx} className="text-[11px] text-[#791F1F] bg-[#FCEBEB] p-1.5 rounded">
                          {flag}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* People Matches from Gramps */}
                {peopleMatches.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">People Identified</div>
                    <div className="text-[10px] text-gray-600 mb-2">
                      Select people from your Gramps tree to link to this document
                    </div>
                    <div className="space-y-3">
                      {peopleMatches.map((match, idx) => (
                        <div key={idx} className="border border-[#D3D1C7] rounded p-2">
                          <div className="text-[11px] font-medium text-gray-700 mb-1">
                            Extracted: {match.extracted_name}
                            {match.extracted_dates && (
                              <span className="text-gray-500 ml-1">({match.extracted_dates})</span>
                            )}
                          </div>
                          <div className="space-y-1">
                            {match.candidates.map((candidate) => (
                              <label
                                key={candidate.gramps_id}
                                className="flex items-center gap-2 text-[11px] hover:bg-[#F5F2ED] p-1 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPeople.has(candidate.gramps_id)}
                                  onChange={() => togglePersonSelection(candidate.gramps_id)}
                                  className="w-3 h-3"
                                />
                                <div className="flex-1">
                                  <span className="font-medium">{candidate.name}</span>
                                  <span className="text-gray-500 ml-1 font-mono text-[10px]">
                                    {candidate.gramps_id}
                                  </span>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedPeople.size > 0 && (
                      <button
                        onClick={handleSavePeopleLinks}
                        className="w-full mt-2 px-2 py-1.5 bg-[#EF9F27] text-white rounded text-[10px] font-medium hover:bg-[#d88d1f] transition-colors"
                      >
                        Link {selectedPeople.size} {selectedPeople.size === 1 ? 'Person' : 'People'} to Document
                      </button>
                    )}
                  </div>
                )}

                {selectedMysteryId && (
                  <div className="mb-3 p-2 bg-[#E6F1FB] border border-[#0C447C] rounded">
                    <div className="text-[10px] text-[#0C447C] font-medium">
                      Linked to mystery: {mysteries.find(m => m.id === selectedMysteryId)?.title || selectedMysteryId}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  {selectedMysteryId && (
                    <button
                      onClick={() => window.location.href = `/mysteries/${selectedMysteryId}`}
                      className="flex-1 px-2 py-1.5 bg-[#E6F1FB] text-[#0C447C] rounded text-[10px] font-medium hover:bg-[#d5e7f5] transition-colors"
                    >
                      View Mystery
                    </button>
                  )}
                  <button
                    onClick={handleAddToWiki}
                    className="flex-1 px-2 py-1.5 bg-[#F5F2ED] text-gray-700 rounded text-[10px] font-medium hover:bg-[#e5e2dd] transition-colors"
                  >
                    Add to Wiki
                  </button>
                </div>
              </div>
            )}
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
