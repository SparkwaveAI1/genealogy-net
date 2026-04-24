import Link from 'next/link'

export default function DNAPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold">DNA & Genetic Genealogy</h1>
      </div>

      <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-6 mb-6">
        <h2 className="text-[15px] font-semibold mb-3">Coming Soon</h2>
        <p className="text-[13px] text-gray-600 mb-4">
          DNA analysis features are in development. For now, manage your DNA data in Gramps Web.
        </p>
        <a
          href="http://178.156.250.119"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-[#EF9F27] text-white text-[13px] font-medium rounded-lg hover:bg-[#D88E1F] transition-colors"
        >
          Open Gramps Web ↗
        </a>
      </div>

      <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-6">
        <h2 className="text-[15px] font-semibold mb-3">Planned Features</h2>
        <ul className="text-[13px] text-gray-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-[#EF9F27] mt-0.5">•</span>
            Chromosome browser integration
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#EF9F27] mt-0.5">•</span>
            DNA match filtering by relationship range
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#EF9F27] mt-0.5">•</span>
            Shared ancestor hints
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#EF9F27] mt-0.5">•</span>
            ethnicity estimate visualization
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#EF9F27] mt-0.5">•</span>
            ThruLines-style ancestor linking
          </li>
        </ul>
      </div>
    </div>
  )
}
