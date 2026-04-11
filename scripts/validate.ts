import crypto from 'crypto'
import { supabase } from '../lib/supabase'
import { registerAhnentafelNumber, runValidation, printReport, saveReport } from './lib/validation'

// Generate stable UUID from ahnentafel number (same algorithm as import)
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

async function validate() {
  console.log('=== Ahnentafel Validation ===')
  console.log('Loading people from Supabase...\n')

  // Register ahnentafel numbers for all possible entries (1-63)
  // This allows the validator to show ahnentafel numbers even if
  // we haven't re-imported
  for (let i = 1; i <= 63; i++) {
    const uuid = generateStableUUID(i)
    registerAhnentafelNumber(uuid, i)
  }

  // Run validation
  const report = await runValidation()
  printReport(report)
  await saveReport(report)
}

validate().catch(console.error)
