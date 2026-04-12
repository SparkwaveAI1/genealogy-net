'use client'

import { useState } from 'react'
import { Person } from '@/lib/types'
import PersonSearch from './PersonSearch'

interface PersonFormProps {
  person?: Person
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export default function PersonForm({ person, onSubmit, onCancel, isLoading }: PersonFormProps) {
  const [formData, setFormData] = useState({
    given_name: person?.given_name || '',
    surname: person?.surname || '',
    birth_year: person?.birth_year || '',
    birth_year_type: person?.birth_year_type || 'exact',
    birthplace_detail: person?.birthplace_detail || '',
    death_year: person?.death_year || '',
    death_year_type: person?.death_year_type || 'exact',
    death_place_detail: person?.death_place_detail || '',
    confidence: person?.confidence || 'probable',
    ahnentafel: person?.ahnentafel || '',
    bio: person?.bio || '',
  })

  const [father, setFather] = useState<Person | null>(null)
  const [mother, setMother] = useState<Person | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const submitData = {
      ...formData,
      birth_year: formData.birth_year ? parseInt(formData.birth_year as any) : null,
      death_year: formData.death_year ? parseInt(formData.death_year as any) : null,
      ahnentafel: formData.ahnentafel ? parseInt(formData.ahnentafel as any) : null,
      father_id: father?.id || null,
      mother_id: mother?.id || null,
    }

    await onSubmit(submitData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Given Name
          </label>
          <input
            type="text"
            value={formData.given_name}
            onChange={(e) => setFormData({ ...formData, given_name: e.target.value })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
            required
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Surname
          </label>
          <input
            type="text"
            value={formData.surname}
            onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Birth Year
          </label>
          <input
            type="number"
            value={formData.birth_year}
            onChange={(e) => setFormData({ ...formData, birth_year: e.target.value })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Type
          </label>
          <select
            value={formData.birth_year_type}
            onChange={(e) => setFormData({ ...formData, birth_year_type: e.target.value as any })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          >
            <option value="exact">Exact</option>
            <option value="circa">Circa</option>
            <option value="before">Before</option>
            <option value="after">After</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
          Birthplace
        </label>
        <input
          type="text"
          value={formData.birthplace_detail}
          onChange={(e) => setFormData({ ...formData, birthplace_detail: e.target.value })}
          className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          placeholder="City, State, Country"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Death Year
          </label>
          <input
            type="number"
            value={formData.death_year}
            onChange={(e) => setFormData({ ...formData, death_year: e.target.value })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Type
          </label>
          <select
            value={formData.death_year_type}
            onChange={(e) => setFormData({ ...formData, death_year_type: e.target.value as any })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          >
            <option value="exact">Exact</option>
            <option value="circa">Circa</option>
            <option value="before">Before</option>
            <option value="after">After</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
          Death Place
        </label>
        <input
          type="text"
          value={formData.death_place_detail}
          onChange={(e) => setFormData({ ...formData, death_place_detail: e.target.value })}
          className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          placeholder="City, State, Country"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Confidence
          </label>
          <select
            value={formData.confidence}
            onChange={(e) => setFormData({ ...formData, confidence: e.target.value as any })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          >
            <option value="confirmed">Confirmed</option>
            <option value="probable">Probable</option>
            <option value="possible">Possible</option>
            <option value="hypothetical">Hypothetical</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
            Ahnentafel # (optional)
          </label>
          <input
            type="number"
            value={formData.ahnentafel}
            onChange={(e) => setFormData({ ...formData, ahnentafel: e.target.value })}
            className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
          />
        </div>
      </div>

      {!person && (
        <>
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              Father
            </label>
            <PersonSearch
              onSelect={setFather}
              selected={father}
              placeholder="Search for father..."
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
              Mother
            </label>
            <PersonSearch
              onSelect={setMother}
              selected={mother}
              placeholder="Search for mother..."
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
          Notes / Bio
        </label>
        <textarea
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          rows={4}
          className="w-full px-3 py-1.5 border border-[#D3D1C7] rounded text-[13px] focus:outline-none focus:border-[#EF9F27]"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-[#F5F2ED] rounded transition-colors"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-[#EF9F27] text-white text-[13px] font-medium rounded hover:bg-[#D88E1F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Saving...' : person ? 'Update Person' : 'Create Person'}
        </button>
      </div>
    </form>
  )
}
