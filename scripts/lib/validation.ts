import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { Person } from '../../lib/types'

interface ValidationIssue {
  severity: 'error' | 'warning'
  personId: string
  personName: string
  ahnentafelNumber?: number
  issue: string
  suggestion: string
}

interface ValidationReport {
  timestamp: Date
  totalPeople: number
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

// Map of person IDs to ahnentafel numbers (if available)
const ahnentafelMap = new Map<string, number>()

export function registerAhnentafelNumber(personId: string, ahnNumber: number) {
  ahnentafelMap.set(personId, ahnNumber)
}

function getPersonDisplay(person: Person): string {
  const name = `${person.given_name || ''} ${person.surname || ''}`.trim() || 'Unknown'
  const ahnNum = ahnentafelMap.get(person.id!)
  return ahnNum ? `#${ahnNum} ${name}` : name
}

function getAhnentafelGeneration(ahnNumber: number): number {
  if (ahnNumber === 0) return 0
  return Math.floor(Math.log2(ahnNumber)) + 1
}

export async function runValidation(): Promise<ValidationReport> {
  const report: ValidationReport = {
    timestamp: new Date(),
    totalPeople: 0,
    errors: [],
    warnings: []
  }

  // Fetch all people
  const { data: people, error: peopleError } = await supabase
    .from('people')
    .select('*')
    .eq('creation_source', 'ahnentafel_import')

  if (peopleError || !people) {
    console.error('Error fetching people:', peopleError)
    return report
  }

  report.totalPeople = people.length

  // Fetch all relationships
  const { data: relationships } = await supabase
    .from('family_relationships')
    .select('*')

  // Build parent/child maps
  const childToParents = new Map<string, { fatherId?: string; motherId?: string }>()
  const parentToChildren = new Map<string, string[]>()

  relationships?.forEach(rel => {
    if (rel.relationship_type === 'father') {
      const existing = childToParents.get(rel.person_id) || {}
      childToParents.set(rel.person_id, { ...existing, fatherId: rel.related_person_id })
    } else if (rel.relationship_type === 'mother') {
      const existing = childToParents.get(rel.person_id) || {}
      childToParents.set(rel.person_id, { ...existing, motherId: rel.related_person_id })
    } else if (rel.relationship_type === 'child') {
      const children = parentToChildren.get(rel.person_id) || []
      children.push(rel.related_person_id)
      parentToChildren.set(rel.person_id, children)
    }
  })

  // Create lookup maps
  const personById = new Map<string, Person>()
  people.forEach(p => personById.set(p.id!, p))

  // Run validation checks
  for (const person of people) {
    const ahnNum = ahnentafelMap.get(person.id!)
    const generation = ahnNum ? getAhnentafelGeneration(ahnNum) : 0

    // === TIMELINE CHECKS ===

    // Death before birth
    if (person.birth_year && person.death_year && person.death_year < person.birth_year) {
      report.errors.push({
        severity: 'error',
        personId: person.id!,
        personName: getPersonDisplay(person),
        ahnentafelNumber: ahnNum,
        issue: `Death year (${person.death_year}) is before birth year (${person.birth_year})`,
        suggestion: 'Verify birth and death dates from primary sources'
      })
    }

    // Check age at death
    if (person.birth_year && person.death_year) {
      const age = person.death_year - person.birth_year
      if (age > 110) {
        report.warnings.push({
          severity: 'warning',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `Lived ${age} years (over 110)`,
          suggestion: 'Verify birth and death dates - unusual longevity'
        })
      }
    }

    // Check parent ages vs children
    const children = parentToChildren.get(person.id!) || []
    for (const childId of children) {
      const child = personById.get(childId)
      if (!child || !child.birth_year || !person.birth_year) continue

      const parentAgeAtBirth = child.birth_year - person.birth_year

      // Birth after child's birth
      if (parentAgeAtBirth < 0) {
        report.errors.push({
          severity: 'error',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `Born in ${person.birth_year}, after child ${getPersonDisplay(child)} was born in ${child.birth_year}`,
          suggestion: 'Verify parent and child birth years'
        })
      }
      // Parent too young
      else if (parentAgeAtBirth < 14) {
        report.warnings.push({
          severity: 'warning',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `Only ${parentAgeAtBirth} years old when child ${getPersonDisplay(child)} was born`,
          suggestion: 'Verify birth years - unusually young parent'
        })
      }
      // Parent too old
      else if (parentAgeAtBirth > 70) {
        report.warnings.push({
          severity: 'warning',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `${parentAgeAtBirth} years old when child ${getPersonDisplay(child)} was born`,
          suggestion: 'Verify birth years - unusually old parent'
        })
      }

      // Death before child's birth
      if (person.death_year && child.birth_year && person.death_year < child.birth_year) {
        report.errors.push({
          severity: 'error',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `Died in ${person.death_year}, before child ${getPersonDisplay(child)} was born in ${child.birth_year}`,
          suggestion: 'Verify death year and child birth year'
        })
      }
    }

    // === COMPLETENESS CHECKS ===

    // Missing birth year in generations 1-5
    if (generation >= 1 && generation <= 5 && !person.birth_year) {
      report.warnings.push({
        severity: 'warning',
        personId: person.id!,
        personName: getPersonDisplay(person),
        ahnentafelNumber: ahnNum,
        issue: `Generation ${generation} person missing birth year`,
        suggestion: 'Research birth records, census data, or family documents'
      })
    }

    // Missing parents in generations 1-5 (except gen 6 boundary)
    if (generation >= 1 && generation <= 5) {
      const parents = childToParents.get(person.id!)
      if (!parents?.fatherId && !parents?.motherId) {
        // Only flag if not at generation boundary
        if (generation < 5 || ahnNum! < 32) {
          report.warnings.push({
            severity: 'warning',
            personId: person.id!,
            personName: getPersonDisplay(person),
            ahnentafelNumber: ahnNum,
            issue: `Generation ${generation} person has no parents recorded`,
            suggestion: 'Add parent information if available'
          })
        }
      } else if (!parents?.fatherId) {
        report.warnings.push({
          severity: 'warning',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `Missing father`,
          suggestion: 'Research father\'s identity'
        })
      } else if (!parents?.motherId) {
        report.warnings.push({
          severity: 'warning',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `Missing mother`,
          suggestion: 'Research mother\'s identity'
        })
      }
    }

    // Names with Unknown, FNU, LNU, or ?
    const fullName = `${person.given_name || ''} ${person.surname || ''}`
    if (fullName.includes('Unknown') || fullName.includes('FNU') || fullName.includes('LNU') || fullName.includes('?')) {
      report.warnings.push({
        severity: 'warning',
        personId: person.id!,
        personName: getPersonDisplay(person),
        ahnentafelNumber: ahnNum,
        issue: `Name contains placeholder: "${fullName.trim()}"`,
        suggestion: 'Research actual name from records'
      })
    }

    // === CONFIDENCE CHECKS ===

    // Low confidence for direct ancestors (generations 1-5)
    if (generation >= 1 && generation <= 5) {
      if (person.confidence === 'possible' || !person.confidence) {
        report.warnings.push({
          severity: 'warning',
          personId: person.id!,
          personName: getPersonDisplay(person),
          ahnentafelNumber: ahnNum,
          issue: `Generation ${generation} direct ancestor has ${person.confidence || 'no'} confidence level`,
          suggestion: 'Strengthen evidence with primary sources to increase confidence'
        })
      }
    }
  }

  // Sort by ahnentafel number
  const sortByAhn = (a: ValidationIssue, b: ValidationIssue) => {
    const aNum = a.ahnentafelNumber || 9999
    const bNum = b.ahnentafelNumber || 9999
    return aNum - bNum
  }

  report.errors.sort(sortByAhn)
  report.warnings.sort(sortByAhn)

  return report
}

export function printReport(report: ValidationReport) {
  console.log('\n' + '='.repeat(70))
  console.log('AHNENTAFEL VALIDATION REPORT')
  console.log('='.repeat(70))
  console.log(`Generated: ${report.timestamp.toLocaleString()}`)
  console.log(`Total people checked: ${report.totalPeople}`)
  console.log('')

  if (report.errors.length === 0 && report.warnings.length === 0) {
    console.log('✅ PASSED - No issues found!')
    return
  }

  // Print errors
  if (report.errors.length > 0) {
    console.log(`❌ ERRORS (${report.errors.length})`)
    console.log('-'.repeat(70))
    report.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. ${err.personName}`)
      console.log(`   Issue: ${err.issue}`)
      console.log(`   Fix: ${err.suggestion}`)
      console.log('')
    })
  }

  // Print warnings
  if (report.warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${report.warnings.length})`)
    console.log('-'.repeat(70))
    report.warnings.forEach((warn, idx) => {
      console.log(`${idx + 1}. ${warn.personName}`)
      console.log(`   Issue: ${warn.issue}`)
      console.log(`   Fix: ${warn.suggestion}`)
      console.log('')
    })
  }

  // Summary
  console.log('='.repeat(70))
  console.log(`SUMMARY: ${report.errors.length} errors, ${report.warnings.length} warnings`)
  console.log(`${report.errors.length + report.warnings.length} people need attention`)
  console.log('='.repeat(70))
}

export async function saveReport(report: ValidationReport) {
  const wikiPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki', 'research')

  // Create directory if it doesn't exist
  if (!fs.existsSync(wikiPath)) {
    fs.mkdirSync(wikiPath, { recursive: true })
  }

  const dateStr = report.timestamp.toISOString().split('T')[0]
  const filename = `import-validation-${dateStr}.md`
  const filePath = path.join(wikiPath, filename)

  let markdown = `# Ahnentafel Import Validation Report\n\n`
  markdown += `**Generated:** ${report.timestamp.toLocaleString()}\n`
  markdown += `**Total People:** ${report.totalPeople}\n\n`

  if (report.errors.length === 0 && report.warnings.length === 0) {
    markdown += `## ✅ PASSED\n\nNo issues found!\n`
  } else {
    markdown += `## Summary\n\n`
    markdown += `- ❌ **Errors:** ${report.errors.length}\n`
    markdown += `- ⚠️  **Warnings:** ${report.warnings.length}\n`
    markdown += `- **Total Issues:** ${report.errors.length + report.warnings.length}\n\n`

    if (report.errors.length > 0) {
      markdown += `## ❌ Errors\n\n`
      report.errors.forEach((err, idx) => {
        markdown += `### ${idx + 1}. ${err.personName}\n\n`
        markdown += `**Issue:** ${err.issue}\n\n`
        markdown += `**Suggestion:** ${err.suggestion}\n\n`
        markdown += `---\n\n`
      })
    }

    if (report.warnings.length > 0) {
      markdown += `## ⚠️ Warnings\n\n`
      report.warnings.forEach((warn, idx) => {
        markdown += `### ${idx + 1}. ${warn.personName}\n\n`
        markdown += `**Issue:** ${warn.issue}\n\n`
        markdown += `**Suggestion:** ${warn.suggestion}\n\n`
        markdown += `---\n\n`
      })
    }
  }

  fs.writeFileSync(filePath, markdown, 'utf-8')
  console.log(`\n📄 Report saved to: ${filePath}`)
}
