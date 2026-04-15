'use client'

import { useState, useRef, useEffect } from 'react'

interface GrampsPerson {
  gramps_id: string
  handle: string
  name?: string
  birth_year?: number | null
  death_year?: number | null
}

interface ProposedAction {
  action_id: string
  action_type: string
  description: string
  target: { type: string; id: string; name: string }
  changes: Record<string, any>
  confidence: string
  source_fact: string
}

interface GPSAnalysis {
  document_analysis: {
    scenario: string
    source_classification: string
    information_type: string
    date_of_record: string
    location: string
    record_type: string
    direct_evidence: Array<{ fact: string; quote: string; subject: string; confidence: string }>
    indirect_evidence: Array<{ inference: string; supporting_detail: string; subject: string; confidence: string }>
    fan_clues: Array<{ name: string; relationship_hint: string; context: string }>
    conflicts: Array<{ issue: string; detail: string }>
    follow_up_records: string[]
  }
  proposed_actions: ProposedAction[]
  summary: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DocumentUploaderProps {
  contextType?: 'dashboard' | 'person' | 'mystery'
  contextId?: string
  contextName?: string
  standalone?: boolean
  onUploadComplete?: (result: { documentId: string }) => void
}

export default function DocumentUploader({
  contextType = 'dashboard',
  contextId,
  contextName,
  standalone = false,
  onUploadComplete,
}: DocumentUploaderProps) {
  // ── File / Save state ─────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [savedDocId, setSavedDocId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Person search state ──────────────────────────────────────────────────
  const [personQuery, setPersonQuery] = useState('')
  const [personResults, setPersonResults] = useState<GrampsPerson[]>([])
  const [selectedPerson, setSelectedPerson] = useState<GrampsPerson | null>(null)
  const [searchingPerson, setSearchingPerson] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── GPS Analysis state ───────────────────────────────────────────────────
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<GPSAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set())

  // ── Execute state ─────────────────────────────────────────────────────────
  const [executing, setExecuting] = useState(false)
  const [executionResults, setExecutionResults] = useState<Record<string, { success: boolean; message: string }>>({})

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Document type ─────────────────────────────────────────────────────────
  const [documentType, setDocumentType] = useState('')

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Scroll chat to bottom ────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ── Debounced person search ────────────────────────────────────────────────
  useEffect(() => {
    if (!personQuery || personQuery.length < 2) {
      setPersonResults([])
      return
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingPerson(true)
      try {
        const res = await fetch(`/api/gramps/people?query=${encodeURIComponent(personQuery)}&dates=true&limit=8`)
        const data = await res.json()
        const rawPeople: any[] = Array.isArray(data) ? data : data.people || []
        const people: GrampsPerson[] = rawPeople.map((p: any) => ({
          gramps_id: p.gramps_id,
          handle: p.handle,
          birth_year: p.birth_year ?? null,
          death_year: p.death_year ?? null,
          name: p.name || (p.primary_name
            ? `${p.primary_name.first_name || ''} ${p.primary_name.surname_list?.[0]?.surname || ''}`.trim()
            : 'Unknown'),
        }))
        setPersonResults(people)
        setShowDropdown(true)
      } catch {
        setPersonResults([])
      } finally {
        setSearchingPerson(false)
      }
    }, 300)
  }, [personQuery])

  // ── File selected ─────────────────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setSavedDocId(null)
      setAnalysisResult(null)
      setShowAnalysis(false)
      setSaveError(null)
      setExecutionResults({})
      setChatMessages([])
    }
  }

  // ── Save to Wiki ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!file) return
    if (contextType === 'dashboard' && !selectedPerson) {
      setSaveError('Please search and select a person before saving.')
      return
    }
    setUploading(true)
    setSaveError(null)

    const effectiveContextId = contextType === 'dashboard' ? selectedPerson?.gramps_id : contextId
    const effectiveContextName = contextType === 'dashboard' ? selectedPerson?.name : contextName

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('context_type', contextType === 'dashboard' ? 'person' : contextType)
      fd.append('context_id', effectiveContextId || '')
      fd.append('context_name', effectiveContextName || '')
      fd.append('document_type', documentType)

      const res = await fetch('/api/documents/save', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || 'Save failed')
        return
      }

      const docId = data.document_id || data.document?.id
      setSavedDocId(docId)
      setShowAnalysis(false)
      setAnalysisResult(null)
      setExecutionResults({})
      setChatMessages([])
      onUploadComplete?.({ documentId: docId })
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Analyze with AI ───────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (!savedDocId) return
    setAnalyzing(true)
    setAnalysisError(null)
    setAnalysisResult(null)
    setShowAnalysis(true)
    setSelectedActions(new Set())
    setExecutionResults({})

    const effectiveContextId = contextType === 'dashboard' ? selectedPerson?.gramps_id : contextId
    const effectiveContextName = contextType === 'dashboard' ? selectedPerson?.name : contextName

    try {
      const res = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: savedDocId,
          context_type: contextType === 'dashboard' ? 'person' : contextType,
          context_id: effectiveContextId,
          context_name: effectiveContextName,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setAnalysisError(data.error || data.details || 'Analysis failed')
        return
      }

      setAnalysisResult(data.analysis)
      const allActionIds = new Set<string>((data.analysis.proposed_actions || []).map((a: ProposedAction) => a.action_id))
      setSelectedActions(allActionIds)
    } catch (e: any) {
      setAnalysisError(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Toggle action checkbox ────────────────────────────────────────────────
  function toggleAction(actionId: string) {
    setSelectedActions(prev => {
      const next = new Set(prev)
      if (next.has(actionId)) next.delete(actionId)
      else next.add(actionId)
      return next
    })
  }

  // ── Execute selected actions ───────────────────────────────────────────────
  async function handleExecuteActions() {
    if (!analysisResult?.proposed_actions || !savedDocId) return
    const actionsToRun = analysisResult.proposed_actions.filter((a: ProposedAction) => selectedActions.has(a.action_id))
    if (actionsToRun.length === 0) return

    setExecuting(true)
    const effectiveContextId = contextType === 'dashboard' ? selectedPerson?.gramps_id : contextId
    const effectiveContextName = contextType === 'dashboard' ? selectedPerson?.name : contextName

    const results: Record<string, { success: boolean; message: string }> = {}

    for (const action of actionsToRun) {
      try {
        const payload: any = {
          ...action,
          document_id: savedDocId,
        }
        if (action.action_type === 'update_gramps' || action.action_type === 'create_gramps') {
          payload.linked_person = effectiveContextId ? { gramps_id: effectiveContextId, name: effectiveContextName } : null
        }

        const res = await fetch('/api/documents/execute-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_type: action.action_type, payload }),
        })
        const data = await res.json()
        results[action.action_id] = { success: data.success, message: data.success ? 'Done' : (data.error || 'Failed') }
      } catch (e: any) {
        results[action.action_id] = { success: false, message: e.message }
      }
    }

    setExecutionResults(results)
    setExecuting(false)
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  async function handleChatSend() {
    if (!chatInput.trim() || !savedDocId) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatError(null)

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userMsg }]
    setChatMessages(newMessages)
    setChatLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          document_id: savedDocId,
          deep: false,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Chat failed')
      }

      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch (e: any) {
      setChatError(e.message)
    } finally {
      setChatLoading(false)
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const effectiveContextId = contextType === 'dashboard' ? selectedPerson?.gramps_id : contextId
  const effectiveContextName = contextType === 'dashboard' ? selectedPerson?.name : contextName
  const hasDocument = !!savedDocId
  const hasAnalysis = !!analysisResult
  const hasResults = Object.keys(executionResults).length > 0

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-4 ${standalone ? 'bg-white rounded-xl border border-[#D3D1C7] p-6' : ''}`}>

      {/* ── Person search (dashboard uploads only) ── */}
      {contextType === 'dashboard' && (
        <div>
          <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">
            Link to Person
          </label>
          {!selectedPerson ? (
            <div ref={dropdownRef} className="relative">
              <input
                type="text"
                value={personQuery}
                onChange={e => { setPersonQuery(e.target.value); setSelectedPerson(null) }}
                onFocus={() => personResults.length > 0 && setShowDropdown(true)}
                placeholder="Search for a person..."
                className="w-full px-3 py-2 border border-[#D3D1C7] rounded-lg text-[13px] focus:outline-none focus:border-[#EF9F27]"
              />
              {showDropdown && personResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-[#D3D1C7] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {personResults.map(p => (
                    <button
                      key={p.gramps_id}
                      onClick={() => {
                        setSelectedPerson(p)
                        setPersonQuery(p.name || 'Unknown')
                        setShowDropdown(false)
                        setPersonResults([])
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#FEF3E2] transition-colors"
                    >
                      <span className="font-medium text-gray-900">{p.name}</span>
                      {p.birth_year && (
                        <span className="text-gray-500 ml-2">
                          {p.birth_year}{p.death_year ? `–${p.death_year}` : ''}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {searchingPerson && <p className="text-[11px] text-gray-400 mt-1">Searching...</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#FEF3E2] border border-[#EF9F27] rounded-lg">
              <span className="font-medium text-[13px] text-gray-900 truncate flex-1">{selectedPerson.name}</span>
              <button
                onClick={() => { setSelectedPerson(null); setPersonQuery('') }}
                className="text-[#EF9F27] hover:text-[#d88d1f] font-bold text-sm leading-none"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Context label (person/mystery) ── */}
      {effectiveContextName && contextType !== 'dashboard' && (
        <div className="text-[11px] text-gray-500">
          <span className="uppercase">{contextType}: </span>
          <span className="text-gray-700 font-medium">{effectiveContextName}</span>
        </div>
      )}

      {/* ── File picker ── */}
      <div>
        <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">
          Document
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.csv,.ged,.gedcom"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[#D3D1C7] rounded-xl p-6 text-center cursor-pointer hover:border-[#EF9F27] transition-colors"
        >
          {file ? (
            <div>
              <p className="text-[14px] font-medium text-gray-900">{file.name}</p>
              <p className="text-[12px] text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <p className="text-[13px] text-gray-500">Drop a file or click to select</p>
          )}
        </div>
      </div>

      {/* ── Document type ── */}
      <div>
        <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">
          Document Type
        </label>
        <select
          value={documentType}
          onChange={e => setDocumentType(e.target.value)}
          className="w-full px-3 py-2 border border-[#D3D1C7] rounded-lg text-[13px] focus:outline-none focus:border-[#EF9F27]"
        >
          <option value="">Select type (optional)</option>
          <option value="census">Census</option>
          <option value="birth">Birth Record</option>
          <option value="death">Death Record</option>
          <option value="marriage">Marriage Record</option>
          <option value="will">Will / Probate</option>
          <option value="deed">Deed / Land</option>
          <option value="military">Military / Pension</option>
          <option value="tax">Tax Record</option>
          <option value="letter">Letter / Manuscript</option>
          <option value="photo">Photo</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* ── Save button ── */}
      <button
        onClick={handleSave}
        disabled={!file || uploading || (contextType === 'dashboard' && !selectedPerson && !effectiveContextId)}
        className="w-full bg-[#EF9F27] text-white py-3 rounded-lg text-[14px] font-semibold hover:bg-[#d88d1f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? 'Saving...' : savedDocId ? '✓ Saved — click to re-save' : 'Save to Wiki'}
      </button>

      {/* ── Save error ── */}
      {saveError && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{saveError}</div>
      )}

      {/* ── Analyze button (shown after save) ── */}
      {hasDocument && !hasAnalysis && !hasResults && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full bg-[#2D6A4F] text-white py-3 rounded-lg text-[14px] font-semibold hover:bg-[#245a42] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing ? 'Analyzing...' : 'Analyze with AI (GPS)'}
        </button>
      )}

      {/* ── Analysis error ── */}
      {analysisError && (
        <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{analysisError}</div>
      )}

      {/* ── GPS Analysis Results ── */}
      {showAnalysis && hasAnalysis && analysisResult && (
        <div className="border border-[#D3D1C7] rounded-xl p-5 space-y-4 bg-white">

          {/* Summary */}
          <div>
            <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2">Summary</h3>
            <p className="text-[13px] text-gray-800 leading-relaxed">{analysisResult.summary}</p>
          </div>

          {/* GPS Badges */}
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-[11px] font-medium ${analysisResult.document_analysis.source_classification === 'Original' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {analysisResult.document_analysis.source_classification}
            </span>
            <span className={`px-2 py-1 rounded text-[11px] font-medium ${analysisResult.document_analysis.information_type === 'Primary' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
              {analysisResult.document_analysis.information_type}
            </span>
            <span className="px-2 py-1 rounded text-[11px] font-medium bg-purple-100 text-purple-700">
              Scenario {analysisResult.document_analysis.scenario}
            </span>
            {analysisResult.document_analysis.record_type && (
              <span className="px-2 py-1 rounded text-[11px] font-medium bg-orange-100 text-orange-700">
                {analysisResult.document_analysis.record_type}
              </span>
            )}
          </div>

          {/* Direct Evidence */}
          {analysisResult.document_analysis.direct_evidence?.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2">Direct Evidence</h3>
              {analysisResult.document_analysis.direct_evidence.map((e, i) => (
                <div key={i} className="mb-2 pl-3 border-l-2 border-green-400">
                  <p className="text-[13px] font-medium text-gray-900">{e.fact}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    <span className={`px-1 rounded text-[10px] ${
                      e.confidence === 'confirmed' ? 'bg-green-100 text-green-700' :
                      e.confidence === 'probable' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{e.confidence}</span>
                    {e.quote && e.quote !== 'N/A' && (
                      <span className="italic ml-2 mt-0.5 block text-gray-600">"{e.quote}"</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Indirect Evidence */}
          {analysisResult.document_analysis.indirect_evidence?.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2">Indirect Evidence</h3>
              {analysisResult.document_analysis.indirect_evidence.map((e, i) => (
                <div key={i} className="mb-2 pl-3 border-l-2 border-yellow-400">
                  <p className="text-[13px] font-medium text-gray-900">{e.inference}</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">{e.supporting_detail}</p>
                  <span className={`inline-block mt-0.5 px-1 rounded text-[10px] ${
                    e.confidence === 'probable' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{e.confidence}</span>
                </div>
              ))}
            </div>
          )}

          {/* FAN Clues */}
          {analysisResult.document_analysis.fan_clues?.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2">FAN Clues</h3>
              {analysisResult.document_analysis.fan_clues.map((f, i) => (
                <div key={i} className="mb-2 pl-3 border-l-2 border-blue-400">
                  <p className="text-[13px] font-medium text-gray-900">{f.name}</p>
                  <p className="text-[11px] text-gray-500">{f.relationship_hint} — {f.context}</p>
                </div>
              ))}
            </div>
          )}

          {/* Conflicts */}
          {analysisResult.document_analysis.conflicts?.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-red-700 uppercase tracking-wide mb-2">Conflicts</h3>
              {analysisResult.document_analysis.conflicts.map((c, i) => (
                <div key={i} className="mb-2 pl-3 border-l-2 border-red-400">
                  <p className="text-[13px] font-medium text-red-900">{c.issue}</p>
                  <p className="text-[11px] text-red-700 mt-0.5">{c.detail}</p>
                </div>
              ))}
            </div>
          )}

          {/* Follow-Up Records */}
          {analysisResult.document_analysis.follow_up_records?.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2">Follow-Up Records</h3>
              <ul className="space-y-1">
                {analysisResult.document_analysis.follow_up_records.map((r, i) => (
                  <li key={i} className="text-[12px] text-gray-700 flex items-start gap-2">
                    <span className="text-[#EF9F27] mt-0.5">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Proposed Actions */}
          {analysisResult.proposed_actions?.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2">
                Proposed Actions ({selectedActions.size}/{analysisResult.proposed_actions.length} selected)
              </h3>
              <div className="space-y-2">
                {analysisResult.proposed_actions.map((action: ProposedAction) => (
                  <div key={action.action_id} className="flex items-start gap-3 p-3 bg-[#FAFAF8] rounded-lg border border-[#E8E6E0]">
                    <input
                      type="checkbox"
                      id={action.action_id}
                      checked={selectedActions.has(action.action_id)}
                      onChange={() => toggleAction(action.action_id)}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <label htmlFor={action.action_id} className="text-[13px] cursor-pointer flex-1">
                      <span className={`font-semibold ${selectedActions.has(action.action_id) ? 'text-gray-900' : 'text-gray-400'}`}>
                        [{action.action_type.replace('_', ' ')}]
                      </span>
                      <span className={`ml-2 ${selectedActions.has(action.action_id) ? 'text-gray-800' : 'text-gray-400'}`}>
                        {action.description}
                      </span>
                      {action.confidence && (
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                          action.confidence === 'confirmed' ? 'bg-green-100 text-green-700' :
                          action.confidence === 'probable' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{action.confidence}</span>
                      )}
                      {executionResults[action.action_id] && (
                        <span className={`ml-2 text-[11px] font-medium ${
                          executionResults[action.action_id].success ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {executionResults[action.action_id].message}
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execute button */}
          {hasAnalysis && !hasResults && analysisResult.proposed_actions?.length > 0 && (
            <button
              onClick={handleExecuteActions}
              disabled={executing || selectedActions.size === 0}
              className="w-full bg-[#2D6A4F] text-white py-3 rounded-lg text-[14px] font-semibold hover:bg-[#245a42] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {executing ? 'Executing...' : `Execute ${selectedActions.size} Action${selectedActions.size !== 1 ? 's' : ''}`}
            </button>
          )}

          {Object.keys(executionResults).length > 0 && (
            <div className="text-[13px] text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 font-medium">
              ✓ All selected actions executed. Check results above.
            </div>
          )}
        </div>
      )}

      {/* ── Chat Panel (shown after save) ── */}
      {hasDocument && (
        <div className="border border-[#D3D1C7] rounded-xl p-5 bg-white space-y-3">
          <h3 className="text-[12px] font-bold text-gray-700 uppercase tracking-wide">Chat about this Document</h3>

          {/* Chat messages */}
          <div className="h-64 overflow-y-auto space-y-3 bg-[#FAFAF8] rounded-lg p-4">
            {chatMessages.length === 0 && (
              <p className="text-[12px] text-gray-400 italic text-center py-8">
                Ask questions about this document...
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#EF9F27] text-white'
                      : 'bg-white border border-[#D3D1C7] text-gray-800'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#D3D1C7] rounded-xl px-4 py-2 text-[13px] text-gray-500">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat error */}
          {chatError && (
            <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{chatError}</div>
          )}

          {/* Chat input */}
          <div className="flex gap-2">
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Ask about this document..."
              rows={1}
              className="flex-1 px-3 py-2 border border-[#D3D1C7] rounded-lg text-[13px] focus:outline-none focus:border-[#EF9F27] resize-none"
            />
            <button
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim()}
              className="px-4 py-2 bg-[#EF9F27] text-white rounded-lg text-[13px] font-medium hover:bg-[#d88d1f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
