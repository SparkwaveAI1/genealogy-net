import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const router = Router()

const WIKI_BASE = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki')

interface ResearchRequest {
  query: string
  personId?: string
  mysteryId?: string
  grampsId?: string
  searchSpace: 'person' | 'mystery' | 'tree' | 'location' | 'general'
}

// Call MiniMax for analysis
async function callAI(prompt: string): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) throw new Error('MINIMAX_API_KEY not configured')
  
  const response = await fetch('https://api.minimaxi.chat/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'MiniMax-Text-01',
      messages: [{ role: 'user', content: prompt }],
      role_setting: {
        role: 'system',
        content: `You are Hermes, a GPS-compliant genealogy research intelligence agent. Follow the Genealogical Proof Standard strictly. Never fabricate sources or facts. Use correct terminology: Original/Derivative/Authored sources; Primary/Secondary/Indeterminate information; Direct/Indirect/Negative evidence. Confidence levels: confirmed/probable/possible/hypothetical/contradicted.`
      }
    })
  })
  
  const data: any = await response.json()
  return data.choices?.[0]?.message?.content || 'No response'
}

router.post('/', async (req, res) => {
  try {
    const { query, personId, mysteryId, grampsId, searchSpace } = req.body as ResearchRequest

    // Gather context from wiki
    let context = `Research query: ${query}\nSearch space: ${searchSpace}\n`
    
    if (personId) {
      const personPath = path.join(WIKI_BASE, 'people', `${personId}.md`)
      if (fs.existsSync(personPath)) {
        const content = fs.readFileSync(personPath, 'utf-8')
        const { data, content: body } = matter(content)
        context += `\n=== Person from Wiki ===\n${JSON.stringify(data, null, 2)}\n${body || ''}\n`
      }
    }

    if (mysteryId) {
      const mysteryPath = path.join(WIKI_BASE, 'mysteries', `${mysteryId}.md`)
      if (fs.existsSync(mysteryPath)) {
        const content = fs.readFileSync(mysteryPath, 'utf-8')
        const { data, content: body } = matter(content)
        context += `\n=== Mystery from Wiki ===\n${JSON.stringify(data, null, 2)}\n${body || ''}\n`
      }
    }

    // Build research prompt
    const researchPrompt = `${context}

Perform genealogical research following the GPS. Analyze the above context and provide:
1. Key findings (with source citations)
2. Confidence assessment
3. Evidence for/against any hypotheses
4. Recommended next research steps
5. Any conflicts or contradictions detected

Format response as structured markdown.`

    const response = await callAI(researchPrompt)

    res.json({
      findings: response,
      confidence: 'possible',
      sources: [],
      nextSteps: []
    })
  } catch (err: any) {
    console.error('Research error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Analyze a document (base64 or text)
router.post('/analyze-document', async (req, res) => {
  try {
    const { documentText, documentType, personId, mysteryId, researchContext } = req.body

    const analysisPrompt = `You are Hermes, a GPS-compliant genealogy research assistant.

Analyze this genealogical document and extract structured information.

Document type: ${documentType || 'Unknown'}
${personId ? `Person of interest: ${personId}` : ''}
${mysteryId ? `Related mystery: ${mysteryId}` : ''}
${researchContext ? `Research context: ${researchContext}` : ''}

Document content:
${documentText}

Extract and return as JSON:
{
  "names_mentioned": ["list of all names found"],
  "dates_found": [{"date": "string", "context": "string"}],
  "places_found": [{"place": "string", "context": "string"}],
  "witnesses_associates": ["people who appear as witnesses, neighbors, or associates"],
  "source_classification": "Original|Derivative|Authored",
  "information_type": "Primary|Secondary|Indeterminate",
  "direct_evidence_for": ["list of facts directly stated"],
  "indirect_evidence": ["inferences from context"],
  "possible_conflicts": ["potential conflicts with existing records"],
  "confidence": "confirmed|probable|possible|hypothetical",
  "relevant_mysteries": ["any mysteries this document might inform"],
  "research_notes": "observations about witnesses, associates, or contextual details"
}

Focus especially on witnesses, associates, and anyone who appears in margins or supporting roles — they are often key to disambiguating same-name individuals in 1700s-1800s research.`

    const response = await callAI(analysisPrompt)

    res.json({
      analysis: response,
      raw: documentText.substring(0, 500)
    })
  } catch (err: any) {
    console.error('Document analysis error:', err)
    res.status(500).json({ error: err.message })
  }
})

export { router as researchRouter }
