'use client'

import { useState, useRef, useEffect } from 'react'

interface GrampsPerson {
  gramps_id: string
  handle: string
  name?: string
  birth_year?: number | null
  death_year?: number | null
  primary_name?: {
    first_name: string
    surname_list: Array<{ surname: string }>
  }
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

interface DocumentUploaderProps {
  contextType: 'dashboard' | 'person' | 'mystery'
  contextId?: string
  contextName?: string
  onUploadComplete?: (result: { documentId: string; wikiRaw: string; wikiSource: string }) => void
}

export default function DocumentUploader({
  contextType,
  contextId,
  contextName,
  onUploadComplete,
}: DocumentUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [documentType, setDocumentType] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Person search state (for dashboard uploads)
  const [personQuery, setPersonQuery] = useState('')
  const [personResults, setPersonResults] = useState<GrampsPerson[]>([])
  const [selectedPerson, setSelectedPerson] = useState<GrampsPerson | null>(null)
  const [searchingPerson, setSearchingPerson] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Analyze state
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<GPSAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set())
  const [executing, setExecuting] = useState(false)
  const [executionResults, setExecutionResults] = useState<Record<string, { success: boolean; message: string }>>({})

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced person search
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setResult(null)
      setAnalysisResult(null)
      setShowAnalysis(false)
      setError(null)
      setExecutionResults({})
    }
  }

  async function handleSave() {
    if (!file) return
    if (contextType === 'dashboard' && !selectedPerson) {
      setError('Please search and select a person before saving.')
      return
    }
    setUploading(true)
    setError(null)

    const effectiveContextId = contextType === 'dashboard' ? selectedPerson!.gramps_id : contextId
    const effectiveContextName = contextType === 'dashboard' ? selectedPerson!.name : contextName

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
        setError(data.error || 'Save failed')
        return
      }

      setResult(data)
      setAnalysisResult(null)
      setShowAnalysis(false)
      setExecutionResults({})
      onUploadComplete?.(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleAnalyze() {
    if (!result?.document_id) return
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
          document_id: result.document_id,
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

  async function handleExecuteActions() {
    if (!analysisResult?.proposed_actions || !result?.document_id) return
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
          document_id: result.document_id,
          wiki_raw_path: result.wiki_raw,
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

  function toggleAction(actionId: string) {
    setSelectedActions(prev => {
      const next = new Set(prev)
      if (next.has(actionId)) next.delete(actionId)
      else next.add(actionId)
      return next
    })
  }

  const effectiveContextId = contextType === 'dashboard' ? selectedPerson?.gramps_id : contextId
  const effectiveContextName = contextType === 'dashboard' ? selectedPerson?.name : contextName

  return (
    <div className="space-y-2">
      {/* Context label */}
      {effectiveContextName && (
        <div className="text-[10px] text-gray-500 uppercase">
          {contextType === 'person' ? 'Person' : contextType === 'mystery' ? 'Mystery' : 'Dashboard'}:
          <span className="text-gray-700 font-medium ml-1">{effectiveContextName}</span>
        </div>
      )}

      {/* Person search (dashboard uploads only) */}
      {contextType === 'dashboard' && !selectedPerson && (
        <div ref={dropdownRef} className="relative">
          <input
            type="text"
            value={personQuery}
            onChange={e => { setPersonQuery(e.target.value); setSelectedPerson(null) }}
            onFocus={() => personResults.length > 0 && setShowDropdown(true)}
            placeholder="Search for a person..."
            className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] focus:outline-none focus:border-[#EF9F27]"
          />
          {showDropdown && personResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-[#D3D1C7] rounded shadow-lg max-h-48 overflow-y-auto">
              {personResults.map(p => (
                <button
                  key={p.gramps_id}
                  onClick={() => {
                    setSelectedPerson(p)
                    setPersonQuery(p.name || 'Unknown')
                    setShowDropdown(false)
                    setPersonResults([])
                  }}
                  className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-[#FEF3E2] transition-colors"
                >
                  <span className="font-medium text-gray-900">{p.name}</span>
                  {p.birth_year && (
                    <span className="text-gray-500 ml-1">
                      {p.birth_year}{p.death_year ? `–${p.death_year}` : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {searchingPerson && <p className="text-[10px] text-gray-400 mt-0.5">Searching...</p>}
        </div>
      )}

      {/* Selected person chip */}
      {contextType === 'dashboard' && selectedPerson && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#FEF3E2] border border-[#EF9F27] rounded text-[11px]">
          <span className="font-medium text-gray-900 truncate flex-1">{selectedPerson.name}</span>
          <button onClick={() => { setSelectedPerson(null); setPersonQuery('') }} className="text-[#EF9F27] hover:text-[#d88d1f] font-bold text-xs leading-none">×</button>
        </div>
      )}

      {/* File picker */}
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.csv" onChange={handleFileSelect} className="hidden" />
      <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-[#D3D1C7] rounded-lg p-3 text-center cursor-pointer hover:border-[#EF9F27] transition-colors">
        {file ? (
          <div>
            <p className="text-[11px] font-medium text-gray-900 truncate">{file.name}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500">Drop file or click to select</p>
        )}
      </div>

      {/* Document type */}
      <select value={documentType} onChange={e => setDocumentType(e.target.value)} className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] focus:outline-none focus:border-[#EF9F27]">
        <option value="">Type (optional)</option>
        <option value="census">Census</option>
        <option value="birth">Birth Record</option>
        <option value="death">Death Record</option>
        <option value="marriage">Marriage Record</option>
        <option value="will">Will</option>
        <option value="deed">Deed</option>
        <option value="letter">Letter</option>
        <option value="photo">Photo</option>
        <option value="other">Other</option>
      </select>

      {/* Save button */}
      <button onClick={handleSave} disabled={!file || uploading || (contextType === 'dashboard' && !selectedPerson)} className="w-full bg-[#EF9F27] text-white py-2 rounded text-[11px] font-medium hover:bg-[#d88d1f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {uploading ? 'Saving...' : 'Save to Wiki'}
      </button>

      {/* Save result */}
      {result && (
        <div className="space-y-1">
          <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded p-2">Saved — wiki entry created</div>

          {/* Analyze button */}
          {!showAnalysis && (
            <button onClick={handleAnalyze} disabled={analyzing} className="w-full bg-[#2D6A4F] text-white py-1.5 rounded text-[11px] font-medium hover:bg-[#245a42] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {analyzing ? 'Analyzing with GPS...' : 'Analyze with AI (GPS)'}
            </button>
          )}

          {/* Analysis error */}
          {analysisError && (
            <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-2">{analysisError}</div>
          )}

          {/* Analysis results */}
          {showAnalysis && analysisResult && (
            <div className="border border-[#D3D1C7] rounded p-2 space-y-3 bg-white max-h-96 overflow-y-auto">
              {/* Summary */}
              <div>
                <p className="text-[10px] font-semibold text-gray-700 uppercase mb-0.5">Summary</p>
                <p className="text-[11px] text-gray-800">{analysisResult.summary}</p>
              </div>

              {/* GPS badges */}
              <div className="flex gap-2 flex-wrap text-[10px]">
                <span className={`px-1.5 py-0.5 rounded ${analysisResult.document_analysis.source_classification === 'Original' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {analysisResult.document_analysis.source_classification}
                </span>
                <span className={`px-1.5 py-0.5 rounded ${analysisResult.document_analysis.information_type === 'Primary' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                  {analysisResult.document_analysis.information_type}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Scenario {analysisResult.document_analysis.scenario}</span>
                {analysisResult.document_analysis.record_type && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{analysisResult.document_analysis.record_type}</span>
                )}
              </div>

              {/* Direct evidence */}
              {analysisResult.document_analysis.direct_evidence?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-700 uppercase mb-1">Direct Evidence</p>
                  {analysisResult.document_analysis.direct_evidence.map((e, i) => (
                    <div key={i} className="text-[10px] mb-1 pl-2 border-l-2 border-green-400">
                      <span className="font-medium text-gray-900">{e.fact}</span>
                      <span className="text-gray-500 ml-1">({e.confidence})</span>
                      {e.quote && e.quote !== 'N/A' && <p className="text-gray-600 italic mt-0.5">"{e.quote}"</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Indirect evidence */}
              {analysisResult.document_analysis.indirect_evidence?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-700 uppercase mb-1">Indirect Evidence</p>
                  {analysisResult.document_analysis.indirect_evidence.map((e, i) => (
                    <div key={i} className="text-[10px] mb-1 pl-2 border-l-2 border-yellow-400">
                      <span className="font-medium text-gray-900">{e.inference}</span>
                      <span className="text-gray-500 ml-1">({e.confidence})</span>
                      <p className="text-gray-600 mt-0.5">{e.supporting_detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* FAN clues */}
              {analysisResult.document_analysis.fan_clues?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-700 uppercase mb-1">FAN Clues</p>
                  {analysisResult.document_analysis.fan_clues.map((f, i) => (
                    <div key={i} className="text-[10px] mb-1 pl-2 border-l-2 border-blue-400">
                      <span className="font-medium text-gray-900">{f.name}</span>
                      <span className="text-gray-500"> — {f.relationship_hint}</span>
                      <p className="text-gray-600 mt-0.5">{f.context}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Conflicts */}
              {analysisResult.document_analysis.conflicts?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-red-700 uppercase mb-1">Conflicts / Flags</p>
                  {analysisResult.document_analysis.conflicts.map((c, i) => (
                    <div key={i} className="text-[10px] mb-1 pl-2 border-l-2 border-red-400">
                      <span className="font-medium text-red-900">{c.issue}</span>
                      <p className="text-red-700 mt-0.5">{c.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up records */}
              {analysisResult.document_analysis.follow_up_records?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-700 uppercase mb-1">Follow-Up Records</p>
                  {analysisResult.document_analysis.follow_up_records.map((r, i) => (
                    <p key={i} className="text-[10px] text-gray-700">• {r}</p>
                  ))}
                </div>
              )}

              {/* Proposed actions */}
              {analysisResult.proposed_actions?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-700 uppercase mb-1">
                    Proposed Actions ({selectedActions.size}/{analysisResult.proposed_actions.length} selected)
                  </p>
                  <div className="space-y-1">
                    {analysisResult.proposed_actions.map((action: ProposedAction) => (
                      <div key={action.action_id} className="flex items-start gap-1.5">
                        <input
                          type="checkbox"
                          id={action.action_id}
                          checked={selectedActions.has(action.action_id)}
                          onChange={() => toggleAction(action.action_id)}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <label htmlFor={action.action_id} className="text-[10px] cursor-pointer flex-1">
                          <span className={`font-medium ${selectedActions.has(action.action_id) ? 'text-gray-900' : 'text-gray-400'}`}>
                            [{action.action_type}]
                          </span>{' '}
                          <span className={selectedActions.has(action.action_id) ? 'text-gray-800' : 'text-gray-400'}>
                            {action.description}
                          </span>
                          {action.confidence && (
                            <span className={`ml-1 text-[9px] px-1 rounded ${
                              action.confidence === 'confirmed' ? 'bg-green-100 text-green-700' :
                              action.confidence === 'probable' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>{action.confidence}</span>
                          )}
                          {executionResults[action.action_id] && (
                            <span className={`ml-1 text-[9px] ${executionResults[action.action_id].success ? 'text-green-600' : 'text-red-600'}`}>
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
              {analysisResult.proposed_actions?.length > 0 && Object.keys(executionResults).length === 0 && (
                <button
                  onClick={handleExecuteActions}
                  disabled={executing || selectedActions.size === 0}
                  className="w-full bg-[#2D6A4F] text-white py-1.5 rounded text-[11px] font-medium hover:bg-[#245a42] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {executing ? 'Executing...' : `Execute ${selectedActions.size} Action${selectedActions.size !== 1 ? 's' : ''}`}
                </button>
              )}

              {Object.keys(executionResults).length > 0 && (
                <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded p-2">
                  Done! Check results above.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
      )}
    </div>
  )
}
