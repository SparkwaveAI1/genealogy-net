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

  useEffect(() => {
    fetchDocs()
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

      <DocumentUploader
        contextType="person"
        contextId={personId}
        contextName={personName}
        onUploadComplete={fetchDocs}
      />
    </div>
  )
}
