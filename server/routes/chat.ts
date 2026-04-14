import { Router } from 'express'

const router = Router()

interface ChatRequest {
  message: string
  personId?: string
  mysteryId?: string
  documentContext?: string
  contextMode: 'person' | 'mystery' | 'document' | 'briefing' | 'chat'
}

// In-memory conversation history (per session)
const conversationHistory: Map<string, any[]> = new Map()

router.post('/', async (req, res) => {
  try {
    const { message, personId, mysteryId, documentContext, contextMode } = req.body as ChatRequest
    const sessionId = req.headers['x-session-id'] as string || 'default'

    // Build context for Hermes
    let context = `Context mode: ${contextMode}\n`
    if (personId) context += `Person ID: ${personId}\n`
    if (mysteryId) context += `Mystery ID: ${mysteryId}\n`
    if (documentContext) context += `Document context: ${documentContext}\n`

    // Get conversation history
    const history = conversationHistory.get(sessionId) || []
    
    // Build prompt for MiniMax
    const fullPrompt = `${context}\n\nConversation history:\n${history.map((h: any) => `User: ${h.user}\nHermes: ${h.response}`).join('\n')}\n\nUser: ${message}\n\nHermes (GPS-compliant genealogy research assistant):`

    // Call MiniMax API
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'MINIMAX_API_KEY not configured on server' })
    }

    const response = await fetch('https://api.minimaxi.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        messages: [{ role: 'user', content: fullPrompt }],
        role_setting: {
          role: 'system',
          content: `You are Hermes, a GPS-compliant genealogy research intelligence agent. You follow the Genealogical Proof Standard: never fabricate sources or facts, distinguish primary from secondary information, classify evidence as direct/indirect/negative, and assign confidence levels (confirmed/probable/possible/hypothetical/contradicted). You specialize in Virginia, North Carolina, Tennessee, and Pennsylvania 1700s-1800s genealogy, using FAN (Family/Associates/Neighbors), witnesses, and waterways to disambiguate same-name individuals. You have access to the wiki (research knowledge base) and Gramps API (genealogy tree).`
        }
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).json({ error: `MiniMax API error: ${err}` })
    }

    const data: any = await response.json()
    const responseText = data.choices?.[0]?.message?.content || 'No response'

    // Save to history
    history.push({ user: message, response: responseText })
    conversationHistory.set(sessionId, history.slice(-20)) // keep last 20

    res.json({
      response: responseText,
      sources: [],
      relatedMysteries: []
    })
  } catch (err: any) {
    console.error('Chat error:', err)
    res.status(500).json({ error: err.message })
  }
})

export { router as chatRouter }
