import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { supabase } from '../lib/supabase'
import { Person, FamilyRelationship } from '../lib/types'

interface FamilyData {
  id: string
  husband_id?: string
  wife_id?: string
  children_ids?: string[]
  marriage_date_confidence?: string
}

// Helper function to extract year from date string
function extractYear(dateStr: string | null | undefined): number | undefined {
  if (!dateStr) return undefined
  const yearMatch = dateStr.match(/\b(1\d{3}|20\d{2})\b/)
  return yearMatch ? parseInt(yearMatch[1]) : undefined
}

// Helper function to parse full name into given_name and surname
function parseName(fullName: string | undefined): { given_name?: string; surname?: string } {
  if (!fullName) return {}

  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { given_name: parts[0] }

  // Last part is surname, everything else is given name
  const surname = parts[parts.length - 1]
  const given_name = parts.slice(0, -1).join(' ')

  return { given_name, surname }
}

// Helper to get person's gender from their wiki file
function getPersonGender(personId: string, individualsPath: string): 'M' | 'F' | null {
  try {
    const files = fs.readdirSync(individualsPath)
    const personFile = files.find(f => f.includes(personId) && f.endsWith('.md'))

    if (!personFile) return null

    const filePath = path.join(individualsPath, personFile)
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data } = matter(content)

    return data.gender || null
  } catch {
    return null
  }
}

async function syncFamilyRelationships() {
  const familiesPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki', 'families')
  const individualsPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki', 'individuals')

  console.log('\n=== Syncing Family Relationships ===')
  console.log(`Reading from: ${familiesPath}`)

  if (!fs.existsSync(familiesPath)) {
    console.error(`Directory not found: ${familiesPath}`)
    return { successCount: 0, errorCount: 0 }
  }

  // First, clear existing relationships
  const { error: deleteError } = await supabase
    .from('family_relationships')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows

  if (deleteError) {
    console.error('Error clearing relationships:', deleteError.message)
  } else {
    console.log('✓ Cleared existing relationships')
  }

  const files = fs.readdirSync(familiesPath).filter(file => file.endsWith('.md'))
  console.log(`Found ${files.length} family files`)

  let relationshipCount = 0
  let errorCount = 0
  const relationships: any[] = []

  for (const file of files) {
    const filePath = path.join(familiesPath, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    try {
      const { data } = matter(content)
      const family: FamilyData = {
        id: data.id || file.replace('.md', ''),
        husband_id: data.husband_id,
        wife_id: data.wife_id,
        children_ids: data.children_ids || [],
        marriage_date_confidence: data.marriage_date_confidence
      }

      // Spouse relationships (bidirectional)
      if (family.husband_id && family.wife_id) {
        // Husband -> Wife
        relationships.push({
          person_id: family.husband_id,
          related_person_id: family.wife_id,
          relationship_type: 'spouse',
          notes: `Family ${family.id}`
        })

        // Wife -> Husband
        relationships.push({
          person_id: family.wife_id,
          related_person_id: family.husband_id,
          relationship_type: 'spouse',
          notes: `Family ${family.id}`
        })
      }

      // Parent-child relationships
      const children = family.children_ids || []

      // Father-child relationships
      if (family.husband_id) {
        for (const childId of children) {
          // Child -> Father
          relationships.push({
            person_id: childId,
            related_person_id: family.husband_id,
            relationship_type: 'father',
            notes: `Family ${family.id}`
          })

          // Father -> Child
          relationships.push({
            person_id: family.husband_id,
            related_person_id: childId,
            relationship_type: 'child',
            notes: `Family ${family.id}`
          })
        }
      }

      // Mother-child relationships
      if (family.wife_id) {
        for (const childId of children) {
          // Child -> Mother
          relationships.push({
            person_id: childId,
            related_person_id: family.wife_id,
            relationship_type: 'mother',
            notes: `Family ${family.id}`
          })

          // Mother -> Child
          relationships.push({
            person_id: family.wife_id,
            related_person_id: childId,
            relationship_type: 'child',
            notes: `Family ${family.id}`
          })
        }
      }

      // Sibling relationships
      if (children.length > 1) {
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            // Bidirectional sibling relationships
            relationships.push({
              person_id: children[i],
              related_person_id: children[j],
              relationship_type: 'sibling',
              notes: `Family ${family.id}`
            })

            relationships.push({
              person_id: children[j],
              related_person_id: children[i],
              relationship_type: 'sibling',
              notes: `Family ${family.id}`
            })
          }
        }
      }

    } catch (err: any) {
      console.error(`Exception processing ${file}:`, err.message || err)
      errorCount++
    }
  }

  // Debug: Log first few relationships
  if (relationships.length > 0) {
    console.log('\nSample relationships to insert:')
    console.log(JSON.stringify(relationships.slice(0, 3), null, 2))
  }

  // Insert relationships in batches
  const batchSize = 500
  for (let i = 0; i < relationships.length; i += batchSize) {
    const batch = relationships.slice(i, i + batchSize)
    const { error, data } = await supabase
      .from('family_relationships')
      .insert(batch)
      .select()

    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error.message)
      errorCount++
    } else {
      relationshipCount += batch.length
      console.log(`✓ Inserted batch ${i / batchSize + 1}: ${batch.length} relationships`)
    }
  }

  console.log(`\nRelationship sync complete: ${relationshipCount} relationships synced, ${errorCount} errors`)
  return { successCount: relationshipCount, errorCount }
}

async function syncWiki() {
  const wikiPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki', 'individuals')

  console.log(`Reading from: ${wikiPath}`)

  if (!fs.existsSync(wikiPath)) {
    console.error(`Directory not found: ${wikiPath}`)
    process.exit(1)
  }

  const files = fs.readdirSync(wikiPath).filter(file => file.endsWith('.md'))
  console.log(`Found ${files.length} markdown files`)

  let successCount = 0
  let errorCount = 0

  for (const file of files) {
    const filePath = path.join(wikiPath, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    try {
      const { data } = matter(content)

      // Parse name from name_full or name_display
      const nameInfo = parseName(data.name_full || data.name_display)

      // Map YAML frontmatter fields to actual database columns
      const person: Partial<Person> = {
        id: data.id || file.replace('.md', ''),
        given_name: nameInfo.given_name,
        surname: nameInfo.surname,
        name_variants: data.name_maiden || undefined,
        birth_year: extractYear(data.birth_date),
        birthplace_detail: data.birth_place || undefined,
        death_year: extractYear(data.death_date),
        death_place_detail: data.death_place || undefined,
        burial_place: data.burial_place || undefined,
        auto_created: false,
        creation_source: 'wiki_sync',
      }

      const { error } = await supabase
        .from('people')
        .upsert(person, { onConflict: 'id' })

      if (error) {
        console.error(`Error upserting ${file}:`, error.message)
        errorCount++
      } else {
        console.log(`✓ Synced: ${data.name_full || data.name_display || file}`)
        successCount++
      }
    } catch (err: any) {
      console.error(`Exception processing ${file}:`, err.message || err)
      errorCount++
    }
  }

  console.log(`\nSync complete: ${successCount} successful, ${errorCount} errors`)
  return { successCount, errorCount }
}

async function main() {
  console.log('=== Starting Wiki Sync ===\n')

  // Sync people first
  const peopleResult = await syncWiki()

  // Then sync family relationships
  const relationshipsResult = await syncFamilyRelationships()

  console.log('\n=== Summary ===')
  console.log(`People synced: ${peopleResult.successCount}`)
  console.log(`Relationships synced: ${relationshipsResult.successCount}`)
  console.log(`Total errors: ${peopleResult.errorCount + relationshipsResult.errorCount}`)
}

main().catch(console.error)
