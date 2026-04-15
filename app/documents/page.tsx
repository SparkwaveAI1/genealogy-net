'use client'

import DocumentUploader from '@/app/components/DocumentUploader'

export default function DocumentsPage() {
  return (
    <div className="min-h-screen bg-[#F5F2ED]">
      <div className="max-w-5xl mx-auto pt-8 px-6">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-gray-900">Document Research</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Upload a document to analyze, chat about it, and save findings to your tree.
          </p>
        </div>
        <DocumentUploader standalone />
      </div>
    </div>
  )
}
