import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { supabase } from '../lib/supabase'
import { Person } from '../lib/types'

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
}

syncWiki().catch(console.error)
