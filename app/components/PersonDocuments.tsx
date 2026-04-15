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
      .select('document_id, documents(*)')
      .eq('person_id', personId)
    if (data) {
      setDocs(data.map(d => (d as any).documents).filter(Boolean))
    }
    setLoading(false)
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
            <div key={doc.id} className="text-[11px] bg-[#F5F2ED] rounded p-2">
              <div className="font-medium truncate">{doc.title}</div>
              {doc.document_type && (
                <div className="text-gray-500 text-[10px]">{doc.document_type}</div>
              )}
            </div>
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
