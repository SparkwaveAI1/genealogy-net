'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  MiniMap,
  Background,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Person } from '@/lib/types'
import PersonNode from './PersonNode'
import PlaceholderNode from './PlaceholderNode'

interface PedigreeViewProps {
  people: Person[]
}

const nodeTypes = {
  person: PersonNode,
  placeholder: PlaceholderNode,
}

function PedigreeFlowInner({ people }: PedigreeViewProps) {
  const router = useRouter()
  const { fitView } = useReactFlow()
  const [maxGenerations, setMaxGenerations] = useState(5)

  // Build ahnentafel map
  const personMap = useMemo(() => {
    const map = new Map<number, Person>()
    people.forEach(person => {
      if (person.ahnentafel) {
        map.set(person.ahnentafel, person)
      }
    })
    return map
  }, [people])

  // Calculate generation from ahnentafel number
  const getGeneration = (ahnentafel: number) => {
    return Math.floor(Math.log2(ahnentafel)) + 1
  }

  // Calculate position
  const getPosition = (ahnentafel: number, generation: number) => {
    const x = (generation - 1) * 280 + 50

    // Calculate y position to center between children
    // For person N, their children are at N*2 and N*2+1 (if they exist in next generation)
    const baseY = 900 // Center of canvas
    const generationOffset = Math.pow(2, maxGenerations - generation)
    const positionInGen = ahnentafel - Math.pow(2, generation - 1)
    const y = baseY + (positionInGen - generationOffset / 2) * 120

    return { x, y }
  }

  // Build nodes and edges
  const { nodes, edges } = useMemo(() => {
    const nodesList: Node[] = []
    const edgesList: Edge[] = []
    const processedNumbers = new Set<number>()

    // Get max ahnentafel to know how many to process
    const maxAhnentafel = people.reduce((max, p) =>
      p.ahnentafel && p.ahnentafel > max ? p.ahnentafel : max, 0
    )

    // Process each potential ahnentafel number up to max
    for (let num = 1; num <= maxAhnentafel; num++) {
      const generation = getGeneration(num)
      if (generation > maxGenerations) continue

      const person = personMap.get(num)
      const position = getPosition(num, generation)

      if (person) {
        // Known person node
        nodesList.push({
          id: person.id,
          type: 'person',
          position,
          data: {
            person,
            ahnentafel: num,
            onClick: () => router.push(`/people/${person.id}`),
          },
        })
        processedNumbers.add(num)
      } else {
        // Unknown/placeholder node
        nodesList.push({
          id: `placeholder-${num}`,
          type: 'placeholder',
          position,
          data: {
            ahnentafel: num,
            relationship: getRelationshipDescription(num),
          },
        })
        processedNumbers.add(num)
      }

      // Add edges to parents
      if (num > 1) {
        const fatherNum = num * 2
        const motherNum = num * 2 + 1

        if (fatherNum <= maxAhnentafel * 2 && getGeneration(fatherNum) <= maxGenerations) {
          const fatherId = personMap.get(fatherNum)?.id || `placeholder-${fatherNum}`
          const currentId = person?.id || `placeholder-${num}`

          edgesList.push({
            id: `${currentId}-${fatherId}`,
            source: currentId,
            target: fatherId,
            type: 'smoothstep',
            style: { stroke: '#D3D1C7', strokeWidth: 1.5 },
          })
        }

        if (motherNum <= maxAhnentafel * 2 && getGeneration(motherNum) <= maxGenerations) {
          const motherId = personMap.get(motherNum)?.id || `placeholder-${motherNum}`
          const currentId = person?.id || `placeholder-${num}`

          edgesList.push({
            id: `${currentId}-${motherId}`,
            source: currentId,
            target: motherId,
            type: 'smoothstep',
            style: { stroke: '#D3D1C7', strokeWidth: 1.5 },
          })
        }
      }
    }

    return { nodes: nodesList, edges: edgesList }
  }, [people, personMap, maxGenerations, router])

  const getRelationshipDescription = (ahnentafel: number) => {
    const generation = getGeneration(ahnentafel)
    if (generation === 1) return 'You'
    if (generation === 2) return ahnentafel === 2 ? 'Father' : 'Mother'

    const isPaternal = ahnentafel % 2 === 0
    const parentType = isPaternal ? 'father' : 'mother'
    const childNum = Math.floor(ahnentafel / 2)

    return `${parentType} of person ${childNum}`
  }

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 400 })
  }, [fitView])

  const handleFocusMe = useCallback(() => {
    const person1 = personMap.get(1)
    if (person1) {
      fitView({ nodes: [{ id: person1.id }], padding: 0.5, duration: 400 })
    }
  }, [fitView, personMap])

  const getNodeColor = (node: any) => {
    if (node.type === 'placeholder') return '#B4B2A9'

    const confidence = node.data?.person?.confidence
    switch (confidence) {
      case 'confirmed': return '#1D9E75'
      case 'probable': return '#378ADD'
      case 'possible': return '#EF9F27'
      case 'hypothetical': return '#888780'
      default: return '#D3D1C7'
    }
  }

  return (
    <div className="h-full w-full relative">
      {/* Controls Bar */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg p-2">
        <button
          onClick={handleFitView}
          className="px-3 py-1.5 bg-white border border-[#D3D1C7] rounded text-[11px] font-medium hover:border-[#EF9F27] transition-colors"
        >
          Fit to Screen
        </button>
        <button
          onClick={handleFocusMe}
          className="px-3 py-1.5 bg-white border border-[#D3D1C7] rounded text-[11px] font-medium hover:border-[#EF9F27] transition-colors"
        >
          Focus on Me
        </button>
        <select
          value={maxGenerations}
          onChange={(e) => setMaxGenerations(parseInt(e.target.value))}
          className="px-2 py-1.5 border border-[#D3D1C7] rounded text-[11px] focus:outline-none focus:border-[#EF9F27]"
        >
          <option value={3}>Show 3 gen</option>
          <option value={4}>Show 4 gen</option>
          <option value={5}>Show 5 gen</option>
          <option value={6}>Show 6 gen</option>
        </select>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={getNodeColor}
          position="bottom-right"
          style={{
            backgroundColor: '#FDFCFA',
            border: '0.5px solid #D3D1C7',
          }}
        />
      </ReactFlow>
    </div>
  )
}

export default function PedigreeView({ people }: PedigreeViewProps) {
  return (
    <ReactFlowProvider>
      <PedigreeFlowInner people={people} />
    </ReactFlowProvider>
  )
}
