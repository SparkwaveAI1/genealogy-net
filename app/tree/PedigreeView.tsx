'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Person } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import AncestryPersonNode from './AncestryPersonNode'

interface PedigreeViewProps {
  initialFocusId?: string
}

interface TreePerson extends Person {
  fatherId?: string
  motherId?: string
  hasParents?: boolean
  siblingCount?: number
}

const nodeTypes = {
  ancestryPerson: AncestryPersonNode,
}

function PedigreeFlowInner({ initialFocusId }: PedigreeViewProps) {
  const router = useRouter()
  const { fitView } = useReactFlow()
  const [focusPerson, setFocusPerson] = useState<TreePerson | null>(null)
  const [generations, setGenerations] = useState(4)
  const [history, setHistory] = useState<string[]>([])
  const [treeData, setTreeData] = useState<Map<string, TreePerson>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [coupleBrackets, setCoupleBrackets] = useState<Array<{ x: number; y1: number; y2: number }>>([])

  // Fetch focus person and their ancestors
  useEffect(() => {
    async function loadTreeData() {
      setIsLoading(true)

      // Find focus person (default to ahnentafel 1)
      const focusQuery = initialFocusId
        ? supabase.from('people').select('*').eq('id', initialFocusId).single()
        : supabase.from('people').select('*').eq('ahnentafel', 1).single()

      const { data: focus, error: focusError } = await focusQuery

      if (focusError || !focus) {
        console.error('Could not load focus person:', focusError)
        setIsLoading(false)
        return
      }

      // Count siblings (people who share same father)
      let siblingCount = 0
      if (focus.father_id) {
        const { count } = await supabase
          .from('people')
          .select('*', { count: 'exact', head: true })
          .eq('father_id', focus.father_id)
          .neq('id', focus.id)
        siblingCount = count || 0
      }

      const focusWithRels: TreePerson = {
        ...focus,
        fatherId: focus.father_id,
        motherId: focus.mother_id,
        hasParents: !!(focus.father_id || focus.mother_id),
        siblingCount,
      }

      setFocusPerson(focusWithRels)

      // Recursively fetch ancestors
      const personMap = new Map<string, TreePerson>()
      personMap.set(focus.id, focusWithRels)

      await fetchAncestors(focusWithRels, personMap, generations - 1)

      setTreeData(personMap)
      setIsLoading(false)

      // Fit view after data loads
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100)
    }

    loadTreeData()
  }, [initialFocusId, generations, fitView])

  async function fetchAncestors(person: TreePerson, map: Map<string, TreePerson>, depth: number) {
    if (depth <= 0) return

    const parentIds = [person.fatherId, person.motherId].filter(Boolean) as string[]
    if (parentIds.length === 0) return

    const { data: parents } = await supabase
      .from('people')
      .select('*')
      .in('id', parentIds)

    if (!parents) return

    for (const parent of parents) {
      const parentWithRels: TreePerson = {
        ...parent,
        fatherId: parent.father_id,
        motherId: parent.mother_id,
        hasParents: !!(parent.father_id || parent.mother_id),
      }

      map.set(parent.id, parentWithRels)

      // Recurse
      await fetchAncestors(parentWithRels, map, depth - 1)
    }
  }

  // Build tree structure from focus person
  const buildTreeLevels = useCallback(() => {
    if (!focusPerson) return []

    const levels: TreePerson[][] = [[focusPerson]]

    for (let i = 1; i < generations; i++) {
      const prevLevel = levels[i - 1]
      const nextLevel: TreePerson[] = []

      for (const person of prevLevel) {
        if (person.fatherId) {
          const father = treeData.get(person.fatherId)
          if (father) nextLevel.push(father)
        }
        if (person.motherId) {
          const mother = treeData.get(person.motherId)
          if (mother) nextLevel.push(mother)
        }
      }

      if (nextLevel.length === 0) break
      levels.push(nextLevel)
    }

    return levels
  }, [focusPerson, treeData, generations])

  // Calculate positions using right-to-left algorithm
  const { nodes, edges } = useMemo(() => {
    if (!focusPerson || treeData.size === 0) {
      return { nodes: [], edges: [] }
    }

    const levels = buildTreeLevels()
    if (levels.length === 0) return { nodes: [], edges: [] }

    const nodesList: Node[] = []
    const edgesList: Edge[] = []
    const brackets: Array<{ x: number; y1: number; y2: number }> = []

    // Column x positions
    const colXPositions = [80, 380, 680, 980, 1280]
    const nodeWidth = 240
    const nodeHeight = 90
    const verticalSpacing = 20

    // Position map: person id -> { x, y }
    const positions = new Map<string, { x: number; y: number }>()

    // STEP 1: Position rightmost generation evenly
    const rightmostLevel = levels[levels.length - 1]
    const rightmostGen = levels.length - 1
    const rightmostX = colXPositions[rightmostGen] || 980

    const totalHeight = (rightmostLevel.length * nodeHeight) + ((rightmostLevel.length - 1) * verticalSpacing)
    const canvasHeight = 1000
    let startY = (canvasHeight - totalHeight) / 2

    rightmostLevel.forEach((person, index) => {
      const y = startY + (index * (nodeHeight + verticalSpacing))
      positions.set(person.id, { x: rightmostX, y })
    })

    // STEP 2: Work backwards, positioning each parent pair at midpoint of children
    for (let genIndex = levels.length - 2; genIndex >= 0; genIndex--) {
      const currentLevel = levels[genIndex]
      const childLevel = levels[genIndex + 1]
      const currentX = colXPositions[genIndex]

      currentLevel.forEach(person => {
        // Find this person's children in the next level
        const children = childLevel.filter(
          child => child.fatherId === person.id || child.motherId === person.id
        )

        if (children.length === 0) {
          // Shouldn't happen, but fallback
          positions.set(person.id, { x: currentX, y: canvasHeight / 2 })
          return
        }

        // Calculate midpoint of children's Y positions
        const childYs = children.map(c => positions.get(c.id)?.y || 0)
        const minY = Math.min(...childYs)
        const maxY = Math.max(...childYs)
        const midY = (minY + maxY) / 2

        // For couples, offset father up and mother down
        const spouse = currentLevel.find(
          p => p.id !== person.id &&
          ((person.fatherId === p.id) || (person.motherId === p.id) ||
           (p.fatherId === person.id) || (p.motherId === person.id))
        )

        // Check if this person is father or mother
        const isFather = children.some(c => c.fatherId === person.id)
        const isMother = children.some(c => c.motherId === person.id)

        let y = midY
        if (isFather && spouse) {
          y = midY - 55 // Father above
        } else if (isMother && spouse) {
          y = midY + 55 // Mother below
        }

        positions.set(person.id, { x: currentX, y })
      })
    }

    // STEP 3: Create nodes
    treeData.forEach((person, id) => {
      const pos = positions.get(id)
      if (!pos) return

      const isFocus = id === focusPerson.id
      const genIndex = levels.findIndex(level => level.some(p => p.id === id))

      // Check if this person has parents not currently shown
      const hasMoreGenerations = person.hasParents && genIndex === levels.length - 1

      nodesList.push({
        id: person.id,
        type: 'ancestryPerson',
        position: pos,
        data: {
          person,
          isFocus,
          hasExpandArrow: hasMoreGenerations,
          onExpand: () => handleExpandPerson(person),
          onClick: () => router.push(`/people/${person.id}`),
        },
      })
    })

    // STEP 4: Create edges
    treeData.forEach((person) => {
      if (person.fatherId && treeData.has(person.fatherId)) {
        edgesList.push({
          id: `${person.id}-father`,
          source: person.id,
          target: person.fatherId,
          type: 'smoothstep',
          style: { stroke: '#D3D1C7', strokeWidth: 1 },
        })
      }
      if (person.motherId && treeData.has(person.motherId)) {
        edgesList.push({
          id: `${person.id}-mother`,
          source: person.id,
          target: person.motherId,
          type: 'smoothstep',
          style: { stroke: '#D3D1C7', strokeWidth: 1 },
        })
      }
    })

    // STEP 5: Create couple brackets
    levels.forEach((level, genIndex) => {
      const genX = colXPositions[genIndex]
      const couples = new Map<string, TreePerson[]>()

      // Group by shared children
      level.forEach(person => {
        const childLevel = levels[genIndex - 1]
        if (!childLevel) return

        const sharedChildren = childLevel.filter(
          c => (c.fatherId === person.id || c.motherId === person.id)
        )

        if (sharedChildren.length > 0) {
          const key = sharedChildren[0].id
          if (!couples.has(key)) couples.set(key, [])
          couples.get(key)!.push(person)
        }
      })

      couples.forEach(couple => {
        if (couple.length === 2) {
          const pos1 = positions.get(couple[0].id)
          const pos2 = positions.get(couple[1].id)
          if (pos1 && pos2) {
            const y1 = pos1.y + nodeHeight / 2
            const y2 = pos2.y + nodeHeight / 2
            brackets.push({
              x: genX + nodeWidth + 4,
              y1: Math.min(y1, y2),
              y2: Math.max(y1, y2),
            })
          }
        }
      })
    })

    setCoupleBrackets(brackets)

    return { nodes: nodesList, edges: edgesList }
  }, [focusPerson, treeData, generations, buildTreeLevels, router])

  const handleExpandPerson = (person: TreePerson) => {
    setHistory([...history, focusPerson!.id])
    setFocusPerson(person)
    setTreeData(new Map()) // Will trigger reload
  }

  const handleBack = () => {
    if (history.length === 0) return
    const prevId = history[history.length - 1]
    setHistory(history.slice(0, -1))
    // Reload with previous person as focus
    window.location.href = `/tree?focus=${prevId}`
  }

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-[13px] text-gray-500">Loading pedigree...</div>
      </div>
    )
  }

  return (
    <div className="h-full w-full relative">
      {/* Controls Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg px-4 py-2">
        <button
          onClick={handleBack}
          disabled={history.length === 0}
          className="text-[12px] font-medium text-[#888780] hover:text-[#2C2C2A] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Back
        </button>

        <div className="text-[13px] font-semibold text-[#2C2C2A] px-4 border-x border-[#D3D1C7]">
          {focusPerson?.given_name} {focusPerson?.surname}
        </div>

        <div className="flex gap-2">
          {[3, 4, 5].map(gen => (
            <button
              key={gen}
              onClick={() => setGenerations(gen)}
              className={`px-3 py-1 rounded text-[11px] font-medium transition-colors ${
                generations === gen
                  ? 'bg-[#EF9F27] text-white'
                  : 'bg-white border border-[#D3D1C7] text-[#888780] hover:border-[#EF9F27]'
              }`}
            >
              {gen} gen
            </button>
          ))}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        panOnDrag
        zoomOnScroll
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background />
        <Controls />

        {/* Couple Brackets SVG Overlay */}
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          {coupleBrackets.map((bracket, i) => (
            <line
              key={i}
              x1={bracket.x}
              y1={bracket.y1}
              x2={bracket.x}
              y2={bracket.y2}
              stroke="#D3D1C7"
              strokeWidth="1"
            />
          ))}
        </svg>
      </ReactFlow>
    </div>
  )
}

export default function PedigreeView({ initialFocusId }: PedigreeViewProps) {
  return (
    <ReactFlowProvider>
      <PedigreeFlowInner initialFocusId={initialFocusId} />
    </ReactFlowProvider>
  )
}
