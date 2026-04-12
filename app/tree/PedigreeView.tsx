'use client'

import { useMemo, useState, useEffect } from 'react'
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

type TreeNode = {
  person: Person
  father: TreeNode | null
  mother: TreeNode | null
  generation: number
  y: number
}

const nodeTypes = {
  ancestryPerson: AncestryPersonNode,
}

function PedigreeFlowInner({ initialFocusId }: PedigreeViewProps) {
  const router = useRouter()
  const { fitView } = useReactFlow()
  const [focusPerson, setFocusPerson] = useState<Person | null>(null)
  const [allPeople, setAllPeople] = useState<Map<string, Person>>(new Map())
  const [maxGenerations, setMaxGenerations] = useState(5)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch all people upfront
  useEffect(() => {
    async function loadData() {
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

      setFocusPerson(focus)

      // Fetch all people with ahnentafel numbers (all ancestors)
      const { data: people } = await supabase
        .from('people')
        .select('*')
        .not('ahnentafel', 'is', null)

      const peopleMap = new Map<string, Person>()
      people?.forEach(p => peopleMap.set(p.id, p))

      setAllPeople(peopleMap)
      setIsLoading(false)
    }

    loadData()
  }, [initialFocusId])

  // Build tree structure recursively
  function buildTree(person: Person, generation: number): TreeNode {
    if (generation > maxGenerations) {
      return {
        person,
        father: null,
        mother: null,
        generation,
        y: 0,
      }
    }

    const father = person.father_id ? allPeople.get(person.father_id) : null
    const mother = person.mother_id ? allPeople.get(person.mother_id) : null

    return {
      person,
      father: father ? buildTree(father, generation + 1) : null,
      mother: mother ? buildTree(mother, generation + 1) : null,
      generation,
      y: 0,
    }
  }

  // Calculate Y positions bottom-up
  function assignPositions(node: TreeNode, leafIndex: { value: number }): number {
    // If this is a leaf node (no children in the tree), assign next position
    if (!node.father && !node.mother) {
      const y = leafIndex.value * 130
      leafIndex.value++
      node.y = y
      return y
    }

    // Recursively position children
    const fatherY = node.father ? assignPositions(node.father, leafIndex) : null
    const motherY = node.mother ? assignPositions(node.mother, leafIndex) : null

    // Position this node at midpoint of children
    let y = 0
    if (fatherY !== null && motherY !== null) {
      y = (fatherY + motherY) / 2
    } else {
      y = fatherY ?? motherY ?? 0
    }

    node.y = y
    return y
  }

  // Collect all nodes from tree
  function collectNodes(node: TreeNode | null, nodes: TreeNode[]) {
    if (!node) return
    nodes.push(node)
    collectNodes(node.father, nodes)
    collectNodes(node.mother, nodes)
  }

  // Build React Flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    if (!focusPerson || allPeople.size === 0) {
      return { nodes: [], edges: [] }
    }

    // Build tree
    const tree = buildTree(focusPerson, 1)

    // Calculate positions
    const leafIndex = { value: 0 }
    assignPositions(tree, leafIndex)

    // Collect all nodes
    const treeNodes: TreeNode[] = []
    collectNodes(tree, treeNodes)

    // Generation X positions
    const generationX: Record<number, number> = {
      1: 50,
      2: 330,
      3: 610,
      4: 890,
      5: 1170,
      6: 1450,
      7: 1730,
      8: 2010,
    }

    // Convert to React Flow nodes
    const nodesList: Node[] = []
    const edgesList: Edge[] = []

    treeNodes.forEach(treeNode => {
      const x = generationX[treeNode.generation] || 50
      const isFocus = treeNode.person.id === focusPerson.id

      // Count siblings for focus person
      let siblingCount = 0
      if (isFocus && focusPerson.father_id) {
        // This would need a query - for now set to 0
        siblingCount = 0
      }

      nodesList.push({
        id: treeNode.person.id,
        type: 'ancestryPerson',
        position: { x, y: treeNode.y },
        data: {
          person: { ...treeNode.person, siblingCount },
          isFocus,
          hasExpandArrow: false, // For now, no expansion
          onExpand: () => {},
          onClick: () => router.push(`/people/${treeNode.person.id}`),
        },
      })

      // Create edge to father (if father is in the tree)
      if (treeNode.father) {
        edgesList.push({
          id: `${treeNode.person.id}-father`,
          source: treeNode.person.id,
          target: treeNode.father.person.id,
          type: 'smoothstep',
          style: { stroke: '#D3D1C7', strokeWidth: 1 },
        })
      }

      // Create edge to mother (if mother is in the tree)
      if (treeNode.mother) {
        edgesList.push({
          id: `${treeNode.person.id}-mother`,
          source: treeNode.person.id,
          target: treeNode.mother.person.id,
          type: 'smoothstep',
          style: { stroke: '#D3D1C7', strokeWidth: 1 },
        })
      }
    })

    return { nodes: nodesList, edges: edgesList }
  }, [focusPerson, allPeople, maxGenerations, router])

  // Fit view after nodes are rendered
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100)
    }
  }, [nodes, fitView])

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
        <div className="text-[13px] font-semibold text-[#2C2C2A] px-4 border-r border-[#D3D1C7]">
          {focusPerson?.given_name} {focusPerson?.surname}
        </div>

        <div className="flex gap-2">
          {[3, 4, 5, 6, 7, 8].map(gen => (
            <button
              key={gen}
              onClick={() => setMaxGenerations(gen)}
              className={`px-3 py-1 rounded text-[11px] font-medium transition-colors ${
                maxGenerations === gen
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
