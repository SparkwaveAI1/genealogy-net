import express from 'express'
import cors from 'cors'
import { chatRouter } from './routes/chat'
import { grampsRouter } from './routes/gramps'
import { wikiRouter } from './routes/wiki'
import { researchRouter } from './routes/research'
import { hermesRouter } from './routes/hermes'

const app = express()
const PORT = process.env.PORT || 3001

// CORS - allow Vercel frontend
app.use(cors({
  origin: ['https://genealogy-net.vercel.app', 'http://localhost:3000'],
  credentials: true
}))

app.use(express.json({ limit: '50mb' }))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'hermes-server', timestamp: new Date().toISOString() })
})

// Routes
app.use('/chat', chatRouter)
app.use('/gramps', grampsRouter)
app.use('/wiki', wikiRouter)
app.use('/research', researchRouter)
app.use('/hermes', hermesRouter)

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Hermes server running on port ${PORT}`)
  console.log(`Health: http://localhost:${PORT}/health`)
})

export default app