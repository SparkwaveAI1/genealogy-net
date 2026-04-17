'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import DocumentUploader from './DocumentUploader'

interface PersonDocumentsProps {
  personId: string   // gramps_id
  personName: string
}

export default function PersonDocuments({ personId, personName }: PersonDocumentsProps) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mysteries, setMysteries] = useState<any[]>([])
  const [showUploader, setShowUploader] = useState(false)
  const [processingInstructions, setProcessingInstructions] = useState('')
  const [selectedDocType, setSelectedDocType] = useState('')
  const [selectedMystery, setSelectedMystery] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    fetchDocs()
    fetchMysteries()
  }, [personId])

  async function fetchDocs() {
    const { data } = await supabase
      .from('document_people')
      .select('document_id, documents(id, title, document_type, date, file_path, url, created_at)')
      .eq('person_id', personId)
    if (data) {
      setDocs(data.map(d => (d as any).documents).filter(Boolean))
    }
    setLoading(false)
  }

  async function fetchMysteries() {
    const { data } = await supabase
      .from('mysteries')
      .select('id, title')
      .order('created_at', { ascending: false })
    if (data) {
      setMysteries(data)
    }
  }

  function formatDocDate(dateStr: string | null | undefined) {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  async function downloadDocument(doc: any) {
    if (doc.url) {
      window.open(doc.url, '_blank')
    } else if (doc.file_path) {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path)
      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = doc.title || 'document'
        a.click()
        URL.revokeObjectURL(url)
      }
    }
  }

  return (
    <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold">Documents</h3>
      </div>

      {loading ? (
        <p className="text-[11px] text-gray-500">Loading...</p>
      ) : docs.length > 0 ? (
        <div className="space-y-2 mb-3">
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => downloadDocument(doc)}
              className="w-full text-left text-[11px] bg-[#F5F2ED] rounded p-2 hover:bg-[#EF9F27]/10 hover:border-[#EF9F27] border border-transparent transition-colors"
            >
              <div className="font-medium truncate mb-0.5">{doc.title}</div>
              <div className="flex items-center gap-2 flex-wrap">
                {doc.document_type && (
                  <span className="text-gray-600 text-[10px] px-1.5 py-0.5 bg-white/50 rounded">
                    {doc.document_type}
                  </span>
                )}
                {doc.date && (
                  <span className="text-gray-500 text-[10px]">
                    {formatDocDate(doc.date)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-500 mb-3">No documents linked yet</p>
      )}

      {showUploader ? (
        <DocumentUploader
          contextType="person"
          contextId={personId}
          contextName={personName}
          onUploadComplete={() => {
            fetchDocs()
            setShowUploader(false)
          }}
        />
      ) : (
        <div className="space-y-3">
          <button
            onClick={() => setShowUploader(true)}
            className="w-full px-3 py-2 text-[11px] font-medium text-[#633806] bg-[#FAEEDA] border border-[#EF9F27] rounded hover:bg-[#EF9F27]/20 transition-colors"
          >
            + Upload New Document
          </button>

          {/* Analysis Form */}
          <div className="space-y-2 pt-2 border-t border-[#D3D1C7]">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Analyze Document
            </div>

            {/* Who does this relate to */}
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Who does this relate to</label>
              <div className="text-[11px] px-2 py-1.5 bg-gray-100 rounded text-gray-700 border border-gray-200">
                {personName}
              </div>
            </div>

            {/* Processing Instructions */}
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Processing Instructions</label>
              <textarea
                value={processingInstructions}
                onChange={(e) => setProcessingInstructions(e.target.value)}
                placeholder="Enter any specific instructions for analyzing this document..."
                className="w-full text-[11px] px-2 py-1.5 border border-[#D3D1C7] rounded resize-none focus:outline-none focus:border-[#EF9F27]"
                rows={3}
              />
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Document Type</label>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full text-[11px] px-2 py-1.5 border border-[#D3D1C7] rounded focus:outline-none focus:border-[#EF9F27]"
              >
                <option value="">Select type...</option>
                <option value="birth_certificate">Birth Certificate</option>
                <option value="death_certificate">Death Certificate</option>
                <option value="marriage_certificate">Marriage Certificate</option>
                <option value="census">Census Record</option>
                <option value="photo">Photo</option>
                <option value="letter">Letter</option>
                <option value="will">Will/Testament</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Mystery Link */}
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Link to Mystery (optional)</label>
              <select
                value={selectedMystery}
                onChange={(e) => setSelectedMystery(e.target.value)}
                className="w-full text-[11px] px-2 py-1.5 border border-[#D3D1C7] rounded focus:outline-none focus:border-[#EF9F27]"
              >
                <option value="">None</option>
                {mysteries.map(mystery => (
                  <option key={mystery.id} value={mystery.id}>{mystery.title}</option>
                ))}
              </select>
            </div>

            {/* Analyze Button */}
            <button
              onClick={() => {
                // TODO: Implement Hermes analysis
                setAnalyzing(true)
                console.log('Analyzing with Hermes...', {
                  personId,
                  personName,
                  processingInstructions,
                  selectedDocType,
                  selectedMystery
                })
                setTimeout(() => setAnalyzing(false), 2000)
              }}
              disabled={analyzing}
              className="w-full px-3 py-2 text-[11px] font-medium text-white bg-[#EF9F27] rounded hover:bg-[#D88E1F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? 'Analyzing...' : 'Analyze with Hermes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
