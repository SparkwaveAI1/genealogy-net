import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Person } from '@/lib/types'

interface PersonNodeProps {
  data: {
    person: Person
    ahnentafel: number
    onClick: () => void
  }
}

function PersonNode({ data }: PersonNodeProps) {
  const { person, ahnentafel, onClick } = data

  const getAccentColor = () => {
    switch (person.confidence) {
      case 'confirmed': return '#1D9E75'
      case 'probable': return '#378ADD'
      case 'possible': return '#EF9F27'
      case 'hypothetical': return '#888780'
      default: return '#D3D1C7'
    }
  }

  const getConfidenceBadgeColor = () => {
    switch (person.confidence) {
      case 'confirmed': return 'bg-[#EAF3DE] text-[#27500A]'
      case 'probable': return 'bg-[#E6F1FB] text-[#0C447C]'
      case 'possible': return 'bg-[#FAEEDA] text-[#633806]'
      case 'hypothetical': return 'bg-[#F1EFE8] text-[#5F5E5A]'
      default: return 'bg-[#F1EFE8] text-[#5F5E5A]'
    }
  }

  const fullName = `${person.given_name || ''} ${person.surname || ''}`.trim()
  const displayName = fullName.length > 22 ? fullName.substring(0, 22) + '...' : fullName

  const lifeDates = person.birth_year && person.death_year
    ? `${person.birth_year}–${person.death_year}`
    : person.birth_year
    ? `b. ${person.birth_year}`
    : person.death_year
    ? `d. ${person.death_year}`
    : ''

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        onClick={onClick}
        className="cursor-pointer bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg w-[200px] h-[80px] p-2 hover:shadow-md transition-shadow"
        style={{
          borderLeft: `3px solid ${getAccentColor()}`,
        }}
        title={`${fullName}\n${lifeDates}\n${person.birthplace_detail || ''}\nConfidence: ${person.confidence || 'not set'}`}
      >
        <div className="flex flex-col h-full justify-between">
          <div className="flex items-start justify-between">
            <div className="text-[10px] text-[#888780]">#{ahnentafel}</div>
            <div className="flex items-center gap-1">
              {person.brick_wall && (
                <span className="text-[10px] text-[#EF9F27]">⚑</span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getConfidenceBadgeColor()}`}>
                {person.confidence || 'unset'}
              </span>
            </div>
          </div>

          <div className="text-[13px] font-medium text-[#2C2C2A] leading-tight">
            {displayName}
          </div>

          <div className="text-[11px] text-[#888780]">
            {lifeDates}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  )
}

export default memo(PersonNode)
