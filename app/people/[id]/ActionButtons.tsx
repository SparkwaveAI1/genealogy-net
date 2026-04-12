'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Person } from '@/lib/types'
import PersonForm from '@/app/components/PersonForm'
import PersonSearch from '@/app/components/PersonSearch'

interface ActionButtonsProps {
  person: Person
  personId: string
}

export function EditFactsButton({ person, personId }: ActionButtonsProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleUpdate(data: any) {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        setShowModal(false)
        router.refresh()
      }
    } catch (error) {
      console.error('Error updating person:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full px-3 py-2 bg-white border border-[#D3D1C7] rounded text-[11px] font-medium hover:border-[#EF9F27] transition-colors"
      >
        Edit Facts
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFCFA] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[#D3D1C7]">
            <div className="p-6 border-b border-[#D3D1C7]">
              <h2 className="text-[18px] font-semibold">Edit Facts</h2>
            </div>
            <div className="p-6">
              <PersonForm
                person={person}
                onSubmit={handleUpdate}
                onCancel={() => setShowModal(false)}
                isLoading={isSubmitting}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function AddRelationshipButton({ type, personId }: { type: 'parent' | 'spouse' | 'child' | 'sibling'; personId: string }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [parentType, setParentType] = useState<'father' | 'mother'>('father')

  async function handleAddRelationship(relType: string, relatedPersonId: string) {
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: personId,
          related_person_id: relatedPersonId,
          relationship_type: relType,
        }),
      })

      if (response.ok) {
        setShowModal(false)
        setSelectedPerson(null)
        router.refresh()
      }
    } catch (error) {
      console.error('Error adding relationship:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCreateAndLink(data: any, relType: string) {
    setIsSubmitting(true)
    try {
      const createResponse = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const createResult = await createResponse.json()
      if (createResult.success && createResult.person) {
        await handleAddRelationship(relType, createResult.person.id)
      }
    } catch (error) {
      console.error('Error creating and linking person:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const labels = {
    parent: 'Add Parent',
    spouse: 'Add Spouse',
    child: 'Add Child',
    sibling: 'Add Sibling',
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-[11px] text-[#EF9F27] font-medium hover:underline"
      >
        + {labels[type]}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFCFA] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[#D3D1C7]">
            <div className="p-6 border-b border-[#D3D1C7]">
              <h2 className="text-[18px] font-semibold">{labels[type]}</h2>
            </div>
            <div className="p-6 space-y-4">
              {type === 'parent' && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                    Parent Type
                  </label>
                  <select
                    value={parentType}
                    onChange={(e) => setParentType(e.target.value as 'father' | 'mother')}
                    className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
                  >
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                  </select>
                </div>
              )}

              <div className="flex gap-2 border-b border-[#D3D1C7] pb-4">
                <button
                  onClick={() => setMode('search')}
                  className={`flex-1 px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    mode === 'search' ? 'bg-[#EF9F27] text-white' : 'bg-[#F5F2ED] text-gray-700'
                  }`}
                >
                  Search Existing
                </button>
                <button
                  onClick={() => setMode('create')}
                  className={`flex-1 px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    mode === 'create' ? 'bg-[#EF9F27] text-white' : 'bg-[#F5F2ED] text-gray-700'
                  }`}
                >
                  Create New
                </button>
              </div>

              {mode === 'search' ? (
                <div>
                  <PersonSearch
                    onSelect={setSelectedPerson}
                    selected={selectedPerson}
                    placeholder={`Search for ${type}...`}
                    exclude={[personId]}
                  />
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => {
                        setShowModal(false)
                        setSelectedPerson(null)
                      }}
                      className="px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-[#F5F2ED] rounded transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const relType = type === 'parent' ? parentType : type
                        selectedPerson && handleAddRelationship(relType, selectedPerson.id)
                      }}
                      disabled={!selectedPerson || isSubmitting}
                      className="px-4 py-2 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting ? 'Adding...' : labels[type]}
                    </button>
                  </div>
                </div>
              ) : (
                <PersonForm
                  onSubmit={async (data) => {
                    const relType = type === 'parent' ? parentType : type
                    await handleCreateAndLink(data, relType)
                  }}
                  onCancel={() => {
                    setShowModal(false)
                    setMode('search')
                  }}
                  isLoading={isSubmitting}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
