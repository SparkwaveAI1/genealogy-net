import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { supabase } from '../lib/supabase'
import { Person, FamilyRelationship } from '../lib/types'

// Generate stable UUID from ahnentafel number
function generateStableUUID(ahnNumber: number): string {
  // Create a deterministic UUID based on the ahnentafel number
  const hash = crypto.createHash('sha256')
    .update(`ahnentafel-${ahnNumber}`)
    .digest('hex')

  // Format as UUID v4
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20),
    hash.substring(20, 32)
  ].join('-')
}

// Parse name into given_name and surname
function parseName(fullName: string): { given_name?: string; surname?: string } {
  // Remove ahnentafel number prefix if present (e.g., "2. Gordon Clint Johnson")
  fullName = fullName.replace(/^\d+\.\s*/, '')

  // Handle names with quotes (e.g., Alfred "Fred" Sackerson)
  // Remove quoted nicknames for parsing
  const nameWithoutNickname = fullName.replace(/"[^"]+"/g, '').trim()

  // Handle special cases
  if (fullName.includes('FNU ')) {
    // FNU = First Name Unknown
    return { surname: fullName.replace('FNU ', '') }
  }
  if (fullName.includes('LNU')) {
    // LNU = Last Name Unknown
    return { given_name: fullName.replace(' LNU', '').replace('LNU', '') }
  }
  if (fullName.startsWith('Unknown ') || fullName.startsWith('Mother ') || fullName.startsWith('Father ')) {
    return { given_name: fullName }
  }

  const parts = nameWithoutNickname.trim().split(/\s+/)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { given_name: parts[0] }

  // Last part is surname, everything else is given name
  const surname = parts[parts.length - 1]
  const given_name = parts.slice(0, -1).join(' ')

  return { given_name, surname }
}

// Extract year from birth date string
function extractYear(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined

  // Handle "Living"
  if (dateStr.toLowerCase().includes('living')) return undefined

  // Remove "about", "abt", "circa", "c.", "ca."
  const cleanedDate = dateStr.replace(/\b(about|abt|circa|c\.|ca\.)\s*/gi, '')

  // Match 4-digit year
  const yearMatch = cleanedDate.match(/\b(1\d{3}|20\d{2})\b/)
  return yearMatch ? parseInt(yearMatch[1]) : undefined
}

// Determine birth date confidence
function getBirthDateConfidence(dateStr: string | undefined): 'confirmed' | 'probable' | 'possible' | undefined {
  if (!dateStr) return undefined
  if (dateStr.toLowerCase().includes('living')) return undefined

  // Check if it's an approximate date
  const isApproximate = /\b(about|abt|circa|c\.|ca\.)\b/i.test(dateStr)

  // Check if it's a full date - various formats:
  // "13 May 1968" (day month year)
  // "May 14, 1945" (month day, year)
  // "14 Mar 1880" (day abbreviated-month year)
  const hasFullDate =
    /\d{1,2}\s+\w+\s+\d{4}/.test(dateStr) ||  // 13 May 1968
    /\w+\s+\d{1,2},\s+\d{4}/.test(dateStr) ||  // May 14, 1945
    /\d{1,2}\s+\w{3}\s+\d{4}/.test(dateStr)    // 14 Mar 1880

  if (hasFullDate && !isApproximate) return 'confirmed'
  if (hasFullDate && isApproximate) return 'probable'

  // Year only
  return 'possible'
}

interface AhnentafelEntry {
  number: number
  name: string
  birthDate?: string
  birthPlace?: string
  deathDate?: string
  deathPlace?: string
}

// Parse the ahnentafel file
function parseAhnentafelFile(filePath: string): AhnentafelEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const entries: AhnentafelEntry[] = []

  // Split into lines and process
  const lines = content.split('\n')
  let currentEntry: Partial<AhnentafelEntry> | null = null
  let expectingName = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Check for ahnentafel number in parentheses
    const numberMatch = line.match(/^\((\d+)\)$/)
    if (numberMatch) {
      // Save previous entry if exists
      if (currentEntry && currentEntry.number && currentEntry.name) {
        entries.push(currentEntry as AhnentafelEntry)
      }

      // Start new entry
      currentEntry = { number: parseInt(numberMatch[1]) }
      expectingName = true
      continue
    }

    // If we're expecting a name, the next non-empty, non-field line is the name
    // Skip lines that are: field labels, numbered prefixes, generation markers, asterisks, or ethnicity markers
    const isEthnicityLine = /^(Swedish|German|Ashkenazi Jewish|French)/i.test(line)
    if (expectingName && line && !line.includes(':') && !line.match(/^\d+\./) && !line.match(/^<Generation/) && line !== '*' && !isEthnicityLine) {
      currentEntry!.name = line
      expectingName = false
      continue
    }

    // Parse fields
    if (currentEntry) {
      if (line.startsWith('Birth Date:')) {
        currentEntry.birthDate = line.replace('Birth Date:', '').trim()
      } else if (line.startsWith('Birth Place:')) {
        currentEntry.birthPlace = line.replace('Birth Place:', '').trim()
      } else if (line.startsWith('Death Date:')) {
        currentEntry.deathDate = line.replace('Death Date:', '').trim()
      } else if (line.startsWith('Death Place:')) {
        currentEntry.deathPlace = line.replace('Death Place:', '').trim()
      } else if (line === '*') {
        // Entry separator - save current entry
        if (currentEntry && currentEntry.number && currentEntry.name) {
          entries.push(currentEntry as AhnentafelEntry)
        }
        currentEntry = null
        expectingName = false
      }
    }
  }

  // Save last entry if exists
  if (currentEntry && currentEntry.number && currentEntry.name) {
    entries.push(currentEntry as AhnentafelEntry)
  }

  return entries.sort((a, b) => a.number - b.number)
}

async function importAhnentafel() {
  const filePath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'raw', 'ahnentafel', 'Genealogy Ahnentafel system.md')

  console.log('=== Importing Ahnentafel ===')
  console.log(`Reading from: ${filePath}`)

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const entries = parseAhnentafelFile(filePath)
  console.log(`Found ${entries.length} ahnentafel entries\n`)

  if (entries.length > 0) {
    console.log('First few entries:')
    entries.slice(0, 5).forEach(e => {
      console.log(`  ${e.number}. ${e.name} (${e.birthDate || 'no birth date'})`)
    })
  }

  // Create person records
  const people: Partial<Person>[] = []
  const uuidMap = new Map<number, string>()

  for (const entry of entries) {
    const uuid = generateStableUUID(entry.number)
    uuidMap.set(entry.number, uuid)

    const { given_name, surname } = parseName(entry.name)
    const birth_year = extractYear(entry.birthDate)
    const death_year = extractYear(entry.deathDate)
    const confidence = getBirthDateConfidence(entry.birthDate)

    // Don't include confidence for now - seems to be causing issues with DB constraint
    const personData: any = {
      id: uuid,
      given_name,
      surname: surname || 'Unknown',  // Provide default surname if missing
      birth_year,
      birthplace_detail: entry.birthPlace,
      death_year,
      death_place_detail: entry.deathPlace,
      auto_created: false,
      creation_source: 'ahnentafel_import',
    }

    // Only add confidence if we have a value
    // if (confidence) {
    //   personData.confidence = confidence
    // }

    people.push(personData)
  }

  // Insert people
  console.log('\nInserting people...')
  let insertedCount = 0
  let errorCount = 0

  for (const person of people) {
    const { error } = await supabase
      .from('people')
      .upsert(person, { onConflict: 'id' })

    if (error) {
      console.error(`Error inserting ${person.given_name} ${person.surname}:`, error.message)
      errorCount++
    } else {
      insertedCount++
      if (insertedCount <= 10 || insertedCount % 10 === 0) {
        console.log(`✓ ${person.given_name || ''} ${person.surname || ''}`)
      }
    }
  }

  console.log(`\nPeople import: ${insertedCount} successful, ${errorCount} errors`)

  // Create family relationships based on ahnentafel math
  console.log('\n=== Creating Family Relationships ===')
  const relationships: any[] = []

  for (const entry of entries) {
    const childId = uuidMap.get(entry.number)
    if (!childId) continue

    // Father is 2N
    const fatherNumber = entry.number * 2
    const fatherId = uuidMap.get(fatherNumber)

    // Mother is 2N+1
    const motherNumber = entry.number * 2 + 1
    const motherId = uuidMap.get(motherNumber)

    // Child -> Father
    if (fatherId) {
      relationships.push({
        person_id: childId,
        related_person_id: fatherId,
        relationship_type: 'father',
        notes: `Ahnentafel ${entry.number} -> ${fatherNumber}`
      })

      // Father -> Child
      relationships.push({
        person_id: fatherId,
        related_person_id: childId,
        relationship_type: 'child',
        notes: `Ahnentafel ${fatherNumber} -> ${entry.number}`
      })
    }

    // Child -> Mother
    if (motherId) {
      relationships.push({
        person_id: childId,
        related_person_id: motherId,
        relationship_type: 'mother',
        notes: `Ahnentafel ${entry.number} -> ${motherNumber}`
      })

      // Mother -> Child
      relationships.push({
        person_id: motherId,
        related_person_id: childId,
        relationship_type: 'child',
        notes: `Ahnentafel ${motherNumber} -> ${entry.number}`
      })
    }

    // Spouse relationship between parents
    if (fatherId && motherId) {
      relationships.push({
        person_id: fatherId,
        related_person_id: motherId,
        relationship_type: 'spouse',
        notes: `Ahnentafel parents of ${entry.number}`
      })

      relationships.push({
        person_id: motherId,
        related_person_id: fatherId,
        relationship_type: 'spouse',
        notes: `Ahnentafel parents of ${entry.number}`
      })
    }
  }

  // Insert relationships in batches
  console.log(`Inserting ${relationships.length} relationships...`)
  let relInsertedCount = 0
  let relErrorCount = 0

  const batchSize = 100
  for (let i = 0; i < relationships.length; i += batchSize) {
    const batch = relationships.slice(i, i + batchSize)
    const { error } = await supabase
      .from('family_relationships')
      .upsert(batch, {
        onConflict: 'person_id,related_person_id,relationship_type',
        ignoreDuplicates: true
      })

    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error.message)
      relErrorCount++
    } else {
      relInsertedCount += batch.length
      console.log(`✓ Batch ${i / batchSize + 1}: ${batch.length} relationships`)
    }
  }

  console.log(`\n=== Summary ===`)
  console.log(`People imported: ${insertedCount}`)
  console.log(`People errors: ${errorCount}`)
  console.log(`Relationships created: ${relInsertedCount}`)
  console.log(`Relationship errors: ${relErrorCount}`)
}

importAhnentafel().catch(console.error)
