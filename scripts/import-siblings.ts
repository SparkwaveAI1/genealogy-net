import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { supabase } from '../lib/supabase'
import { Person } from '../lib/types'
import { registerAhnentafelNumber, runValidation, printReport, saveReport } from './lib/validation'

// Generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID()
}

// Generate stable UUID from ahnentafel number (same as import-ahnentafel.ts)
function generateStableUUID(ahnNumber: number): string {
  const hash = crypto.createHash('sha256')
    .update(`ahnentafel-${ahnNumber}`)
    .digest('hex')

  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20),
    hash.substring(20, 32)
  ].join('-')
}

// GEDCOM Individual Record
interface GedcomIndividual {
  id: string
  name: string
  givenName?: string
  surname?: string
  sex?: 'M' | 'F'
  birthDate?: string
  birthPlace?: string
  deathDate?: string
  deathPlace?: string
  famcIds: string[] // families as child
  famsIds: string[] // families as spouse
}

// GEDCOM Family Record
interface GedcomFamily {
  id: string
  husbandId?: string
  wifeId?: string
  childIds: string[]
}

// Parse GEDCOM file
function parseGedcom(filePath: string): { individuals: Map<string, GedcomIndividual>, families: Map<string, GedcomFamily> } {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').map(l => l.trim())

  const individuals = new Map<string, GedcomIndividual>()
  const families = new Map<string, GedcomFamily>()

  let currentIndividual: GedcomIndividual | null = null
  let currentFamily: GedcomFamily | null = null
  let currentContext: 'BIRT' | 'DEAT' | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Individual record
    const indiMatch = line.match(/^0 (@[^@]+@) INDI$/)
    if (indiMatch) {
      if (currentIndividual) {
        individuals.set(currentIndividual.id, currentIndividual)
      }
      currentIndividual = {
        id: indiMatch[1],
        name: '',
        famcIds: [],
        famsIds: []
      }
      currentContext = null
      continue
    }

    // Family record
    const famMatch = line.match(/^0 (@[^@]+@) FAM$/)
    if (famMatch) {
      if (currentFamily) {
        families.set(currentFamily.id, currentFamily)
      }
      currentFamily = {
        id: famMatch[1],
        childIds: []
      }
      currentIndividual = null
      currentContext = null
      continue
    }

    // Parse individual fields
    if (currentIndividual) {
      if (line.startsWith('1 NAME ')) {
        const nameMatch = line.match(/1 NAME (.+)/)
        if (nameMatch && !currentIndividual.name) {
          // Only use the FIRST name variant (maiden name, not married names)
          currentIndividual.name = nameMatch[1].replace(/\//g, '').trim()
        }
      } else if (line.startsWith('2 GIVN ')) {
        if (!currentIndividual.givenName) {
          // Only use the FIRST given name
          currentIndividual.givenName = line.replace('2 GIVN ', '').trim()
        }
      } else if (line.startsWith('2 SURN ')) {
        if (!currentIndividual.surname) {
          // Only use the FIRST surname
          currentIndividual.surname = line.replace('2 SURN ', '').trim()
        }
      } else if (line.startsWith('1 SEX ')) {
        const sex = line.replace('1 SEX ', '').trim()
        if (sex === 'M' || sex === 'F') {
          currentIndividual.sex = sex
        }
      } else if (line.startsWith('1 BIRT')) {
        currentContext = 'BIRT'
      } else if (line.startsWith('1 DEAT')) {
        currentContext = 'DEAT'
      } else if (line.startsWith('2 DATE ') && currentContext) {
        const date = line.replace('2 DATE ', '').trim()
        if (currentContext === 'BIRT') {
          currentIndividual.birthDate = date
        } else if (currentContext === 'DEAT') {
          currentIndividual.deathDate = date
        }
      } else if (line.startsWith('2 PLAC ') && currentContext) {
        const place = line.replace('2 PLAC ', '').trim()
        if (currentContext === 'BIRT') {
          currentIndividual.birthPlace = place
        } else if (currentContext === 'DEAT') {
          currentIndividual.deathPlace = place
        }
      } else if (line.startsWith('1 FAMC ')) {
        const famcMatch = line.match(/1 FAMC (@[^@]+@)/)
        if (famcMatch) {
          currentIndividual.famcIds.push(famcMatch[1])
        }
      } else if (line.startsWith('1 FAMS ')) {
        const famsMatch = line.match(/1 FAMS (@[^@]+@)/)
        if (famsMatch) {
          currentIndividual.famsIds.push(famsMatch[1])
        }
      } else if (line.startsWith('1 ')) {
        // Reset context on any new level-1 tag
        currentContext = null
      }
    }

    // Parse family fields
    if (currentFamily) {
      if (line.startsWith('1 HUSB ')) {
        const husbMatch = line.match(/1 HUSB (@[^@]+@)/)
        if (husbMatch) {
          currentFamily.husbandId = husbMatch[1]
        }
      } else if (line.startsWith('1 WIFE ')) {
        const wifeMatch = line.match(/1 WIFE (@[^@]+@)/)
        if (wifeMatch) {
          currentFamily.wifeId = wifeMatch[1]
        }
      } else if (line.startsWith('1 CHIL ')) {
        const chilMatch = line.match(/1 CHIL (@[^@]+@)/)
        if (chilMatch) {
          currentFamily.childIds.push(chilMatch[1])
        }
      }
    }
  }

  // Save last records
  if (currentIndividual) {
    individuals.set(currentIndividual.id, currentIndividual)
  }
  if (currentFamily) {
    families.set(currentFamily.id, currentFamily)
  }

  return { individuals, families }
}

// Extract year from date string
function extractYear(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined
  // Remove "about", "abt", "circa", etc.
  const cleanedDate = dateStr.replace(/\b(about|abt|circa|c\.|ca\.)\\s*/gi, '')
  const yearMatch = cleanedDate.match(/\b(1\d{3}|20\d{2})\b/)
  return yearMatch ? parseInt(yearMatch[1]) : undefined
}

// Determine birth date confidence
function getBirthDateConfidence(dateStr: string | undefined, personName: string): 'confirmed' | 'probable' | 'possible' | 'hypothetical' | undefined {
  if (!dateStr) {
    // No date - check if name has placeholders
    if (personName.includes('Unknown') || personName.includes('FNU') ||
        personName.includes('LNU') || personName.includes('?')) {
      return 'hypothetical'
    }
    return undefined
  }

  if (dateStr.toLowerCase().includes('living')) return undefined

  // Check if name has placeholders (overrides date confidence)
  if (personName.includes('Unknown') || personName.includes('FNU') ||
      personName.includes('LNU') || personName.includes('?')) {
    return 'hypothetical'
  }

  // Check if it's an approximate date
  const isApproximate = /\b(about|abt|circa|c\.|ca\.)\b/i.test(dateStr)

  // Check if it's a full date
  const hasFullDate =
    /\d{1,2}\s+\w+\s+\d{4}/.test(dateStr) ||  // 13 May 1968
    /\w+\s+\d{1,2},\s+\d{4}/.test(dateStr) ||  // May 14, 1945
    /\d{1,2}\s+\w{3}\s+\d{4}/.test(dateStr)    // 14 Mar 1880

  if (hasFullDate && !isApproximate) return 'confirmed'
  if (isApproximate) return 'possible'  // "abt 1850" = possible

  // Year only (no day/month) = probable
  if (/^\d{4}$/.test(dateStr.trim())) return 'probable'

  // Default to probable for anything else
  return 'probable'
}

// Match person from Supabase to GEDCOM individual
function findGedcomMatch(
  person: Person,
  individuals: Map<string, GedcomIndividual>
): GedcomIndividual | null {
  // Try to match by name and birth year (within ±2 years tolerance)
  for (const indi of individuals.values()) {
    const givenMatch = person.given_name?.trim() === indi.givenName?.trim()
    const surnameMatch = person.surname?.trim() === indi.surname?.trim()

    if (!givenMatch || !surnameMatch) continue

    const personBirthYear = person.birth_year
    const gedcomBirthYear = extractYear(indi.birthDate)

    // If both have birth years, they must match (within ±2 years)
    if (personBirthYear && gedcomBirthYear) {
      const yearDiff = Math.abs(personBirthYear - gedcomBirthYear)
      if (yearDiff <= 2) {
        return indi
      }
    }
  }

  // Fallback: match by name only if unique
  // (handles cases where GEDCOM has no BIRT field)
  const nameMatches: GedcomIndividual[] = []
  for (const indi of individuals.values()) {
    const exactGivenMatch = person.given_name?.trim() === indi.givenName?.trim()
    const exactSurnameMatch = person.surname?.trim() === indi.surname?.trim()

    if (exactGivenMatch && exactSurnameMatch) {
      nameMatches.push(indi)
    }
  }

  return nameMatches.length === 1 ? nameMatches[0] : null
}

interface SiblingPreview {
  ahnNumber: number
  ancestorName: string
  ancestorId: string
  fatherId?: string
  fatherName?: string
  motherId?: string
  motherName?: string
  siblings: Array<{
    name: string
    birthDate?: string
    deathDate?: string
    gedcomId: string
    alreadyInDb: boolean
  }>
}

async function findSiblingsForGeneration(
  genNumber: number,
  individuals: Map<string, GedcomIndividual>,
  families: Map<string, GedcomFamily>
): Promise<SiblingPreview[]> {
  // Calculate ahnentafel range for this generation
  const startAhn = Math.pow(2, genNumber - 1)
  const endAhn = Math.pow(2, genNumber) - 1

  console.log(`\n${'='.repeat(70)}`)
  console.log(`GENERATION ${genNumber} (Ahnentafel ${startAhn}-${endAhn})`)
  console.log('='.repeat(70))

  const previews: SiblingPreview[] = []

  for (let ahnNumber = startAhn; ahnNumber <= endAhn; ahnNumber++) {
    // Get the ancestor from Supabase using stable UUID
    const ancestorId = generateStableUUID(ahnNumber)
    const { data: ancestor } = await supabase
      .from('people')
      .select('*')
      .eq('id', ancestorId)
      .single()

    if (!ancestor) {
      console.log(`\n⚠️  Ahnentafel #${ahnNumber} not found in database`)
      continue
    }

    console.log(`\n📍 #${ahnNumber} ${ancestor.given_name} ${ancestor.surname}`)

    // Get parents from Supabase using family_relationships
    const { data: parentRels } = await supabase
      .from('family_relationships')
      .select('related_person_id, relationship_type')
      .eq('person_id', ancestor.id)
      .in('relationship_type', ['father', 'mother'])

    if (!parentRels || parentRels.length === 0) {
      console.log(`   ⚠️  No parents found`)
      continue
    }

    const parentIds = parentRels.map(r => r.related_person_id)
    const { data: parents } = await supabase
      .from('people')
      .select('*')
      .in('id', parentIds)

    if (!parents || parents.length === 0) {
      console.log(`   ⚠️  Parent records not found`)
      continue
    }

    // Find father and mother
    const father = parents.find(p =>
      parentRels.find(r => r.related_person_id === p.id && r.relationship_type === 'father')
    )
    const mother = parents.find(p =>
      parentRels.find(r => r.related_person_id === p.id && r.relationship_type === 'mother')
    )

    console.log(`   Father: ${father ? `${father.given_name} ${father.surname}` : 'Not found'}`)
    console.log(`   Mother: ${mother ? `${mother.given_name} ${mother.surname}` : 'Not found'}`)

    // Match ancestor in GEDCOM
    const ancestorGedcom = findGedcomMatch(ancestor, individuals)
    if (!ancestorGedcom) {
      console.log(`   ⚠️  Ancestor not found in GEDCOM`)
      continue
    }
    console.log(`   ✓ Found in GEDCOM: ${ancestorGedcom.id}`)

    // Get the family this person was a child in
    if (ancestorGedcom.famcIds.length === 0) {
      console.log(`   ⚠️  No FAMC (family as child) in GEDCOM`)
      continue
    }

    const familyId = ancestorGedcom.famcIds[0]
    const family = families.get(familyId)
    if (!family) {
      console.log(`   ⚠️  Family ${familyId} not found`)
      continue
    }

    console.log(`   ✓ Family ${familyId}: ${family.childIds.length} children`)

    // Get all siblings (exclude the ancestor themselves)
    const siblingIds = family.childIds.filter(id => id !== ancestorGedcom.id)
    const siblings = siblingIds.map(id => individuals.get(id)!).filter(Boolean)

    console.log(`   ✓ Found ${siblings.length} siblings`)

    // Check which siblings are already in the database
    const siblingsWithStatus = await Promise.all(siblings.map(async (sib) => {
      // Check if this person is already in our database by name and birth year
      const birthYear = extractYear(sib.birthDate)
      const { data: existing } = await supabase
        .from('people')
        .select('id')
        .eq('given_name', sib.givenName || '')
        .eq('surname', sib.surname || '')
        .eq('birth_year', birthYear)
        .limit(1)

      const alreadyInDb = !!existing && existing.length > 0

      return {
        name: sib.name,
        birthDate: sib.birthDate,
        deathDate: sib.deathDate,
        gedcomId: sib.id,
        alreadyInDb
      }
    }))

    if (siblings.length > 0) {
      siblingsWithStatus.forEach(sib => {
        const status = sib.alreadyInDb ? '(already in DB)' : '(new)'
        console.log(`      - ${sib.name} ${status}`)
      })
    }

    previews.push({
      ahnNumber,
      ancestorName: `${ancestor.given_name} ${ancestor.surname}`,
      ancestorId: ancestor.id,
      fatherId: father?.id,
      fatherName: father ? `${father.given_name} ${father.surname}` : undefined,
      motherId: mother?.id,
      motherName: mother ? `${mother.given_name} ${mother.surname}` : undefined,
      siblings: siblingsWithStatus
    })
  }

  return previews
}

async function importSiblings(
  previews: SiblingPreview[],
  individuals: Map<string, GedcomIndividual>
) {
  console.log(`\n${'='.repeat(70)}`)
  console.log('IMPORTING SIBLINGS')
  console.log('='.repeat(70))

  let totalImported = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const preview of previews) {
    const newSiblings = preview.siblings.filter(s => !s.alreadyInDb)
    if (newSiblings.length === 0) {
      console.log(`\n#${preview.ahnNumber} ${preview.ancestorName}: No new siblings to import`)
      continue
    }

    console.log(`\n#${preview.ahnNumber} ${preview.ancestorName}: Importing ${newSiblings.length} siblings`)

    for (const sib of newSiblings) {
      const gedcomPerson = individuals.get(sib.gedcomId)
      if (!gedcomPerson) {
        console.log(`   ⚠️  ${sib.name}: GEDCOM record not found`)
        totalErrors++
        continue
      }

      const birthYear = extractYear(gedcomPerson.birthDate)
      const deathYear = extractYear(gedcomPerson.deathDate)
      const confidence = getBirthDateConfidence(gedcomPerson.birthDate, gedcomPerson.name)

      const personData: any = {
        id: generateUUID(),
        given_name: gedcomPerson.givenName || 'Unknown',
        surname: gedcomPerson.surname || 'Unknown',
        birth_year: birthYear,
        birthplace_detail: gedcomPerson.birthPlace,
        death_year: deathYear,
        death_place_detail: gedcomPerson.deathPlace,
        auto_created: false,
        creation_source: 'sibling_import'
      }

      // TODO: Re-enable confidence once database constraint is updated to accept:
      // 'confirmed' | 'probable' | 'possible' | 'hypothetical'
      // Currently database only accepts: 'confirmed' | 'probable' | 'possible'
      // if (confidence && confidence !== 'hypothetical') {
      //   personData.confidence = confidence
      // }

      // Insert person
      const { data: insertedPerson, error: insertError } = await supabase
        .from('people')
        .insert(personData)
        .select()
        .single()

      if (insertError || !insertedPerson) {
        console.log(`   ❌ ${sib.name}: ${insertError?.message}`)
        totalErrors++
        continue
      }

      console.log(`   ✓ ${sib.name}`)
      totalImported++

      // Create relationships
      const relationships: any[] = []

      // Child -> Father
      if (preview.fatherId) {
        relationships.push({
          person_id: insertedPerson.id,
          related_person_id: preview.fatherId,
          relationship_type: 'father',
          notes: `Sibling import - child of ${preview.fatherName}`
        })

        // Father -> Child
        relationships.push({
          person_id: preview.fatherId,
          related_person_id: insertedPerson.id,
          relationship_type: 'child',
          notes: `Sibling import`
        })
      }

      // Child -> Mother
      if (preview.motherId) {
        relationships.push({
          person_id: insertedPerson.id,
          related_person_id: preview.motherId,
          relationship_type: 'mother',
          notes: `Sibling import - child of ${preview.motherName}`
        })

        // Mother -> Child
        relationships.push({
          person_id: preview.motherId,
          related_person_id: insertedPerson.id,
          relationship_type: 'child',
          notes: `Sibling import`
        })
      }

      // Sibling relationship with direct ancestor
      relationships.push({
        person_id: insertedPerson.id,
        related_person_id: preview.ancestorId,
        relationship_type: 'sibling',
        notes: `Sibling of ${preview.ancestorName}`
      })

      relationships.push({
        person_id: preview.ancestorId,
        related_person_id: insertedPerson.id,
        relationship_type: 'sibling',
        notes: `Sibling import`
      })

      // Insert relationships
      if (relationships.length > 0) {
        const { error: relError } = await supabase
          .from('family_relationships')
          .upsert(relationships, {
            onConflict: 'person_id,related_person_id,relationship_type',
            ignoreDuplicates: true
          })

        if (relError) {
          console.log(`   ⚠️  ${sib.name}: Relationship error: ${relError.message}`)
        }
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log('IMPORT SUMMARY')
  console.log('='.repeat(70))
  console.log(`✓ Imported: ${totalImported}`)
  console.log(`⊘ Skipped (already in DB): ${totalSkipped}`)
  console.log(`❌ Errors: ${totalErrors}`)

  return { totalImported, totalSkipped, totalErrors }
}

async function main() {
  const gedcomPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'raw', 'gedcom', 'Johnson_Schoenberg-7.ged')

  console.log('=== SIBLING IMPORT - ALL GENERATIONS ===\n')
  console.log(`Reading GEDCOM: ${gedcomPath}`)

  const { individuals, families } = parseGedcom(gedcomPath)
  console.log(`Parsed ${individuals.size} individuals and ${families.size} families\n`)

  // Get command line argument for phase
  const args = process.argv.slice(2)
  const phase = args[0] || 'preview-1'

  if (phase === 'preview-1') {
    // Phase 1 Preview: Generation 3 siblings
    console.log('=== PHASE 1 PREVIEW: Generation 3 Siblings ===')
    const gen3Previews = await findSiblingsForGeneration(3, individuals, families)

    console.log(`\n${'='.repeat(70)}`)
    console.log('PHASE 1 SUMMARY')
    console.log('='.repeat(70))

    let totalNew = 0
    gen3Previews.forEach(p => {
      const newCount = p.siblings.filter(s => !s.alreadyInDb).length
      console.log(`\n#${p.ahnNumber} ${p.ancestorName}:`)
      console.log(`  Parents: ${p.fatherName || '?'} & ${p.motherName || '?'}`)
      console.log(`  Siblings: ${p.siblings.length} total, ${newCount} new`)
      if (newCount > 0) {
        p.siblings.filter(s => !s.alreadyInDb).forEach(s => {
          console.log(`    + ${s.name}`)
        })
      }
      totalNew += newCount
    })

    console.log(`\n📊 Total new siblings to import: ${totalNew}`)
    console.log('\n✋ No data imported yet. Run with "import-1" to proceed with Phase 1.')

  } else if (phase === 'import-1') {
    // Import Phase 1
    const gen3Previews = await findSiblingsForGeneration(3, individuals, families)
    await importSiblings(gen3Previews, individuals)

    // Run validation
    console.log('\n=== Running Validation ===')
    const report = await runValidation()
    printReport(report)
    await saveReport(report)

    console.log('\n✅ Phase 1 complete. Run with "preview-2" for Phase 2.')

  } else if (phase === 'preview-2') {
    // Phase 2 Preview: Generation 4 siblings
    console.log('=== PHASE 2 PREVIEW: Generation 4 Siblings ===')
    const gen4Previews = await findSiblingsForGeneration(4, individuals, families)

    console.log(`\n${'='.repeat(70)}`)
    console.log('PHASE 2 SUMMARY')
    console.log('='.repeat(70))

    let totalNew = 0
    gen4Previews.forEach(p => {
      const newCount = p.siblings.filter(s => !s.alreadyInDb).length
      if (newCount > 0) {
        console.log(`\n#${p.ahnNumber} ${p.ancestorName}: ${newCount} new siblings`)
        totalNew += newCount
      }
    })

    console.log(`\n📊 Total new siblings to import: ${totalNew}`)
    console.log('\n✋ No data imported yet. Run with "import-2" to proceed with Phase 2.')

  } else if (phase === 'import-2') {
    // Import Phase 2
    const gen4Previews = await findSiblingsForGeneration(4, individuals, families)
    await importSiblings(gen4Previews, individuals)

    // Run validation
    console.log('\n=== Running Validation ===')
    const report = await runValidation()
    printReport(report)
    await saveReport(report)

    console.log('\n✅ Phase 2 complete. Run with "preview-3" for Phase 3.')

  } else if (phase === 'preview-3') {
    // Phase 3 Preview: Generation 5 siblings
    console.log('=== PHASE 3 PREVIEW: Generation 5 Siblings ===')
    const gen5Previews = await findSiblingsForGeneration(5, individuals, families)

    console.log(`\n${'='.repeat(70)}`)
    console.log('PHASE 3 SUMMARY')
    console.log('='.repeat(70))

    let totalNew = 0
    gen5Previews.forEach(p => {
      const newCount = p.siblings.filter(s => !s.alreadyInDb).length
      if (newCount > 0) {
        console.log(`\n#${p.ahnNumber} ${p.ancestorName}: ${newCount} new siblings`)
        totalNew += newCount
      }
    })

    console.log(`\n📊 Total new siblings to import: ${totalNew}`)
    console.log('\n✋ No data imported yet. Run with "import-3" to proceed with Phase 3.')

  } else if (phase === 'import-3') {
    // Import Phase 3
    const gen5Previews = await findSiblingsForGeneration(5, individuals, families)
    await importSiblings(gen5Previews, individuals)

    // Run validation
    console.log('\n=== Running Validation ===')
    const report = await runValidation()
    printReport(report)
    await saveReport(report)

    console.log('\n✅ Phase 3 complete. Run with "preview-4" for Phase 4.')

  } else if (phase === 'preview-4') {
    // Phase 4 Preview: Generation 6 siblings
    console.log('=== PHASE 4 PREVIEW: Generation 6 Siblings ===')
    const gen6Previews = await findSiblingsForGeneration(6, individuals, families)

    console.log(`\n${'='.repeat(70)}`)
    console.log('PHASE 4 SUMMARY')
    console.log('='.repeat(70))

    let totalNew = 0
    gen6Previews.forEach(p => {
      const newCount = p.siblings.filter(s => !s.alreadyInDb).length
      if (newCount > 0) {
        console.log(`\n#${p.ahnNumber} ${p.ancestorName}: ${newCount} new siblings`)
        totalNew += newCount
      }
    })

    console.log(`\n📊 Total new siblings to import: ${totalNew}`)
    console.log('\n✋ No data imported yet. Run with "import-4" to proceed with Phase 4.')

  } else if (phase === 'import-4') {
    // Import Phase 4
    const gen6Previews = await findSiblingsForGeneration(6, individuals, families)
    await importSiblings(gen6Previews, individuals)

    // Run validation
    console.log('\n=== Running Validation ===')
    const report = await runValidation()
    printReport(report)
    await saveReport(report)

    console.log('\n✅ All phases complete!')

  } else {
    console.log('Unknown phase. Use one of:')
    console.log('  preview-1   Preview Generation 3 siblings')
    console.log('  import-1    Import Generation 3 siblings')
    console.log('  preview-2   Preview Generation 4 siblings')
    console.log('  import-2    Import Generation 4 siblings')
    console.log('  preview-3   Preview Generation 5 siblings')
    console.log('  import-3    Import Generation 5 siblings')
    console.log('  preview-4   Preview Generation 6 siblings')
    console.log('  import-4    Import Generation 6 siblings')
  }
}

main().catch(console.error)
