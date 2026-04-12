import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import PersonForm from '../components/PersonForm'

interface PlaceholderNodeProps {
  data: {
    ahnentafel: number
    relationship: string
  }
}

function PlaceholderNode({ data }: PlaceholderNodeProps) {
  const { ahnentafel, relationship } = data
  const [showModal, setShowModal] = useState(false)

  const handleClick = () => {
    setShowModal(true)
  }

  const handleSubmit = async (formData: any) => {
    // TODO: Create person and link to family
    console.log('Create person for ahnentafel', ahnentafel, formData)
    setShowModal(false)
  }

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        onClick={handleClick}
        className="cursor-pointer bg-[#F5F2ED] border border-dashed border-[#D3D1C7] rounded-lg w-[200px] h-[80px] flex items-center justify-center hover:border-[#EF9F27] transition-colors"
        title={`Add ${relationship}`}
      >
        <div className="text-[12px] text-[#B4B2A9]">Unknown ancestor</div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFCFA] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[#D3D1C7]">
            <div className="p-6 border-b border-[#D3D1C7]">
              <h2 className="text-[18px] font-semibold">Add Person (Ahnentafel #{ahnentafel})</h2>
              <p className="text-[11px] text-gray-500 mt-1">{relationship}</p>
            </div>
            <div className="p-6">
              <PersonForm
                onSubmit={handleSubmit}
                onCancel={() => setShowModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default memo(PlaceholderNode)
