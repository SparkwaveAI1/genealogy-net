const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://oxpkqnmuwqcnmzvavsuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94cGtxbm11d3Fjbm16dmF2c3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTQxMjksImV4cCI6MjA4NDE3MDEyOX0.Skd3A9eyGtwGzQeEdSGM9wZX5eUzHdfww1N8bliwkTY'
)

async function populateAhnentafel() {
  console.log('Starting ahnentafel population...\n')

  // Find Scott Christopher Johnson (root person)
  const { data: scott, error: scottError } = await supabase
    .from('people')
    .select('id, given_name, surname')
    .eq('given_name', 'Scott Christopher')
    .eq('surname', 'Johnson')
    .single()

  if (scottError || !scott) {
    console.error('Could not find Scott Christopher Johnson')
    return
  }

  console.log(`Found root person: ${scott.given_name} ${scott.surname}`)

  // Recursively assign ahnentafel numbers
  const assignments = new Map()

  async function assignNumber(personId, ahnentafelNum) {
    if (assignments.has(personId)) {
      return // Already processed
    }

    assignments.set(personId, ahnentafelNum)

    // Get person details
    const { data: person } = await supabase
      .from('people')
      .select('given_name, surname')
      .eq('id', personId)
      .single()

    console.log(`  ${ahnentafelNum}. ${person?.given_name} ${person?.surname}`)

    // Find father and mother
    const { data: relationships } = await supabase
      .from('family_relationships')
      .select('related_person_id, relationship_type')
      .eq('person_id', personId)
      .in('relationship_type', ['father', 'mother'])

    if (relationships) {
      const father = relationships.find(r => r.relationship_type === 'father')
      const mother = relationships.find(r => r.relationship_type === 'mother')

      if (father) {
        await assignNumber(father.related_person_id, ahnentafelNum * 2)
      }
      if (mother) {
        await assignNumber(mother.related_person_id, ahnentafelNum * 2 + 1)
      }
    }
  }

  // Start with Scott as #1
  await assignNumber(scott.id, 1)

  console.log(`\nAssigned ${assignments.size} ahnentafel numbers`)
  console.log('\nUpdating database...')

  // Update all people in database
  let updateCount = 0
  for (const [personId, ahnentafelNum] of assignments) {
    const { error } = await supabase
      .from('people')
      .update({ ahnentafel: ahnentafelNum })
      .eq('id', personId)

    if (error) {
      console.error(`Error updating person ${personId}:`, error)
    } else {
      updateCount++
    }
  }

  console.log(`✓ Updated ${updateCount} people with ahnentafel numbers`)

  // Verify
  const { data: withNumbers } = await supabase
    .from('people')
    .select('ahnentafel, given_name, surname')
    .not('ahnentafel', 'is', null)
    .order('ahnentafel', { ascending: true })

  console.log('\nFinal tree:')
  withNumbers?.forEach(p => {
    console.log(`  ${p.ahnentafel}. ${p.given_name} ${p.surname}`)
  })
}

populateAhnentafel()
  .then(() => {
    console.log('\n✓ Done!')
    process.exit(0)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
