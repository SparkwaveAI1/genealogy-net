'use client'

import { useState, useRef, useEffect } from 'react'

interface GrampsPerson {
  gramps_id: string
  handle: string
  name?: string    // populated from primary_name in the API response
  birth_year?: number | null
  death_year?: number | null
  primary_name?: {
    first_name: string
    surname_list: Array<{ surname: string }>
  }
}

interface DocumentUploaderProps {
  contextType: 'dashboard' | 'person' | 'mystery'
  contextId?: string      // gramps_id for person, mystery UUID for mystery
  contextName?: string     // display name for context
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
        // Normalize: support both name field and primary_name field
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
      setError(null)
    }
  }

  async function handleSave() {
    if (!file) return
    // Dashboard uploads require a selected person
    if (contextType === 'dashboard' && !selectedPerson) {
      setError('Please search and select a person before saving.')
      return
    }
    setUploading(true)
    setError(null)

    // Use selected person for dashboard uploads, otherwise use context props
    const effectiveContextId = contextType === 'dashboard' ? selectedPerson!.gramps_id : contextId
    const effectiveContextName = contextType === 'dashboard' ? selectedPerson!.name : contextName

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('context_type', contextType === 'dashboard' ? 'person' : contextType)
      fd.append('context_id', effectiveContextId || '')
      fd.append('context_name', effectiveContextName || '')
      fd.append('document_type', documentType)

      const res = await fetch('/api/documents/save', {
        method: 'POST',
        body: fd,
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Save failed')
        return
      }

      setResult(data)
      onUploadComplete?.(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Context label */}
      {contextName && (
        <div className="text-[10px] text-gray-500 uppercase">
          {contextType === 'person' ? 'Person' : contextType === 'mystery' ? 'Mystery' : 'Dashboard'}:
          <span className="text-gray-700 font-medium ml-1">{contextName}</span>
        </div>
      )}

      {/* Person search (dashboard uploads only) */}
      {contextType === 'dashboard' && !selectedPerson && (
        <div ref={dropdownRef} className="relative">
          <input
            type="text"
            value={personQuery}
            onChange={e => {
              setPersonQuery(e.target.value)
              setSelectedPerson(null)
            }}
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
          <button
            onClick={() => {
              setSelectedPerson(null)
              setPersonQuery('')
            }}
            className="text-[#EF9F27] hover:text-[#d88d1f] font-bold text-xs leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* File picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-[#D3D1C7] rounded-lg p-3 text-center cursor-pointer hover:border-[#EF9F27] transition-colors"
      >
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
      <select
        value={documentType}
        onChange={e => setDocumentType(e.target.value)}
        className="w-full px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] focus:outline-none focus:border-[#EF9F27]"
      >
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
      <button
        onClick={handleSave}
        disabled={!file || uploading || (contextType === 'dashboard' && !selectedPerson)}
        className="w-full bg-[#EF9F27] text-white py-2 rounded text-[11px] font-medium hover:bg-[#d88d1f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? 'Saving...' : 'Save to Wiki'}
      </button>

      {/* Result */}
      {result && (
        <div className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded p-2">
          Saved ✓ — wiki entry created
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}
    </div>
  )
}
