'use client'

import Link from 'next/link'
import { Person } from '@/lib/types'

interface AhnentafelViewProps {
  people: Person[]
}

export default function AhnentafelView({ people }: AhnentafelViewProps) {
  const getGeneration = (ahnentafel: number) => {
    return Math.floor(Math.log2(ahnentafel)) + 1
  }

  // Group people by generation
  const generations = people.reduce((acc, person) => {
    if (!person.ahnentafel) return acc

    const gen = getGeneration(person.ahnentafel)
    if (!acc[gen]) acc[gen] = []
    acc[gen].push(person)
    return acc
  }, {} as Record<number, Person[]>)

  // Get max ahnentafel to find missing slots
  const maxAhnentafel = people.reduce((max, p) =>
    p.ahnentafel && p.ahnentafel > max ? p.ahnentafel : max, 0
  )

  const existingNumbers = new Set(people.map(p => p.ahnentafel))

  // Find missing slots
  const missingSlots: number[] = []
  for (let i = 1; i <= maxAhnentafel; i++) {
    if (!existingNumbers.has(i)) {
      missingSlots.push(i)
    }
  }

  const getMissingRelationship = (ahnentafel: number) => {
    if (ahnentafel === 1) return 'You'

    const parentNum = Math.floor(ahnentafel / 2)
    const isEven = ahnentafel % 2 === 0

    if (ahnentafel === 2) return 'Father'
    if (ahnentafel === 3) return 'Mother'

    return `${isEven ? 'Father' : 'Mother'} of person ${parentNum}`
  }

  const handleExport = () => {
    const maxGen = Math.max(...Object.keys(generations).map(Number))
    let markdown = '# Genealogy Ahnentafel System\n\n'

    for (let gen = 1; gen <= maxGen; gen++) {
      const genPeople = generations[gen] || []
      const start = Math.pow(2, gen - 1)
      const end = Math.pow(2, gen) - 1

      markdown += `Generation ${gen} starts at ${start} and contains ${genPeople.length} ${genPeople.length === 1 ? 'name' : 'names'}`
      if (genPeople.length > 1) {
        markdown += `: ${start}-${end}`
      }
      markdown += '\n\n'

      genPeople.forEach(person => {
        markdown += `(${person.ahnentafel})\n`
        markdown += `${person.given_name} ${person.surname}\n`
        if (person.birth_year) {
          markdown += `Birth Date: ${person.birth_year}\n`
        }
        if (person.birthplace_detail) {
          markdown += `Birth Place: ${person.birthplace_detail}\n`
        }
        if (person.death_year) {
          markdown += `Death Date: ${person.death_year}\n`
        }
        if (person.death_place_detail) {
          markdown += `Death Place: ${person.death_place_detail}\n`
        }
        markdown += '\n'
      })
    }

    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Genealogy_Ahnentafel_${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    const text = people
      .map(person => {
        const lifeDates = person.birth_year && person.death_year
          ? `${person.birth_year}–${person.death_year}`
          : person.birth_year
          ? `${person.birth_year}–`
          : ''

        return `${person.ahnentafel}. ${person.given_name} ${person.surname} (${lifeDates})`
      })
      .join('\n')

    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const getConfidenceBadge = (confidence?: string) => {
    const styles = {
      confirmed: 'bg-[#EAF3DE] text-[#27500A]',
      probable: 'bg-[#E6F1FB] text-[#0C447C]',
      possible: 'bg-[#FAEEDA] text-[#633806]',
      hypothetical: 'bg-[#F1EFE8] text-[#5F5E5A]',
    }

    const style = styles[confidence as keyof typeof styles] || 'bg-[#F1EFE8] text-[#5F5E5A]'

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${style}`}>
        {confidence || 'unset'}
      </span>
    )
  }

  const maxGen = Math.max(...Object.keys(generations).map(Number), 0)

  return (
    <div className="h-full overflow-y-auto bg-[#F5F2ED] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Controls */}
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-white border border-[#D3D1C7] rounded text-[11px] font-medium hover:border-[#EF9F27] transition-colors"
          >
            Copy
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-[#EF9F27] text-white rounded text-[11px] font-medium hover:bg-[#D88E1F] transition-colors"
          >
            Export .md
          </button>
        </div>

        {/* Generations */}
        <div className="bg-[#FDFCFA] border border-[#D3D1C7] rounded-lg">
          {Array.from({ length: maxGen }, (_, i) => i + 1).map(gen => {
            const genPeople = generations[gen] || []

            return (
              <div key={gen}>
                <div className="px-6 py-4 border-b border-[#E8E4DC]">
                  <div className="text-[12px] uppercase text-[#888780] tracking-wider">
                    Generation {gen}
                  </div>
                </div>

                <div className="divide-y divide-[#F1EFE8]">
                  {genPeople.map(person => (
                    <div
                      key={person.id}
                      className="px-6 py-3 flex items-center gap-3 hover:bg-[#F5F2ED] transition-colors"
                    >
                      <div className="w-8 text-[12px] text-[#B4B2A9] text-right flex-shrink-0">
                        {person.ahnentafel}
                      </div>

                      <Link
                        href={`/people/${person.id}`}
                        className="flex-1 text-[13px] font-medium text-[#2C2C2A] hover:text-[#EF9F27] transition-colors"
                      >
                        {person.given_name} {person.surname}
                        {person.brick_wall && (
                          <span className="ml-1 text-[10px] text-[#EF9F27]">●</span>
                        )}
                      </Link>

                      <div className="text-[12px] text-[#888780]">
                        {person.birth_year && person.death_year
                          ? `b. ${person.birth_year} – d. ${person.death_year}`
                          : person.birth_year
                          ? `b. ${person.birth_year_type === 'circa' ? '~' : ''}${person.birth_year}`
                          : ''}
                      </div>

                      {getConfidenceBadge(person.confidence)}
                    </div>
                  ))}

                  {/* Missing slots for this generation */}
                  {missingSlots
                    .filter(num => getGeneration(num) === gen)
                    .map(num => (
                      <div
                        key={`missing-${num}`}
                        className="px-6 py-3 flex items-center gap-3"
                      >
                        <div className="w-8 text-[12px] text-[#B4B2A9] text-right flex-shrink-0">
                          {num}
                        </div>

                        <div className="flex-1 text-[13px] italic text-[#B4B2A9]">
                          Unknown — {getMissingRelationship(num)}
                        </div>

                        <Link
                          href="/people"
                          className="text-[11px] text-[#EF9F27] hover:underline"
                        >
                          Add person
                        </Link>
                      </div>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
