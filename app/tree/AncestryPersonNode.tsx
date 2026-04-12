import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Person } from '@/lib/types'

interface TreePerson extends Person {
  siblingCount?: number
}

interface AncestryPersonNodeProps {
  data: {
    person: TreePerson
    isFocus: boolean
    hasExpandArrow: boolean
    onExpand: () => void
    onClick: () => void
  }
}

function AncestryPersonNode({ data }: AncestryPersonNodeProps) {
  const { person, isFocus, hasExpandArrow, onExpand, onClick } = data

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
  const displayName = fullName.length > 26 ? fullName.substring(0, 26) + '...' : fullName

  const lifeDates = person.birth_year && person.death_year
    ? `${person.birth_year}–${person.death_year}`
    : person.birth_year
    ? `b. ${person.birth_year}`
    : person.death_year
    ? `d. ${person.death_year}`
    : ''

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking the expand arrow
    if ((e.target as HTMLElement).closest('.expand-arrow')) {
      return
    }
    onClick()
  }

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onExpand()
  }

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        onClick={handleCardClick}
        className="cursor-pointer bg-white border border-[#D3D1C7] rounded-lg w-[240px] h-[90px] hover:shadow-md transition-shadow relative"
        style={{
          borderLeft: `3px solid ${getAccentColor()}`,
          borderWidth: '0.5px',
          borderLeftWidth: '3px',
        }}
        title={`${fullName}\n${lifeDates}\n${person.birthplace_detail || ''}`}
      >
        <div className="p-2 h-full flex flex-col justify-between">
          {/* Row 1: Ahnentafel number + Confidence badge */}
          <div className="flex items-start justify-between">
            <div className="text-[10px] text-[#B4B2A9]">
              {person.ahnentafel ? `#${person.ahnentafel}` : ''}
            </div>
            <div className="flex items-center gap-1">
              {person.brick_wall && (
                <span className="text-[10px] text-[#EF9F27]">⚑</span>
              )}
              {person.confidence && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getConfidenceBadgeColor()}`}>
                  {person.confidence}
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Full name */}
          <div className="text-[14px] font-medium text-[#2C2C2A] leading-tight">
            {displayName}
          </div>

          {/* Row 3: Life dates */}
          <div className="text-[12px] text-[#888780]">
            {lifeDates}
          </div>

          {/* Row 4: Sibling count (only for focus person) */}
          {isFocus && person.siblingCount !== undefined && person.siblingCount > 0 && (
            <div className="text-[10px] text-[#B4B2A9]">
              {person.siblingCount} {person.siblingCount === 1 ? 'sibling' : 'siblings'}
            </div>
          )}
        </div>

        {/* Expand arrow (bottom right corner) */}
        {hasExpandArrow && (
          <button
            onClick={handleExpandClick}
            className="expand-arrow absolute bottom-1 right-1 w-6 h-6 flex items-center justify-center text-[#B4B2A9] hover:text-[#EF9F27] hover:bg-[#F5F2ED] rounded transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 4L10 8L6 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  )
}

export default memo(AncestryPersonNode)
