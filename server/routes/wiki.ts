import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const router = Router()

const WIKI_BASE = path.join(process.env.HOME || '~', 'genealogy-wiki', 'wiki')

// Read person page
router.get('/people/:name', (req, res) => {
  try {
    const { name } = req.params
    const filePath = path.join(WIKI_BASE, 'people', `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Person not found' })
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)
    res.json({ frontmatter: data, body })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// List people pages
router.get('/people', (req, res) => {
  try {
    const peoplePath = path.join(WIKI_BASE, 'people')
    if (!fs.existsSync(peoplePath)) {
      return res.json([])
    }
    const files = fs.readdirSync(peoplePath).filter(f => f.endsWith('.md'))
    const people = files.map(f => {
      const content = fs.readFileSync(path.join(peoplePath, f), 'utf-8')
      const { data } = matter(content)
      return { name: f.replace('.md', ''), ...data }
    })
    res.json(people)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Read mystery page
router.get('/mysteries/:name', (req, res) => {
  try {
    const { name } = req.params
    const filePath = path.join(WIKI_BASE, 'mysteries', `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Mystery not found' })
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)
    res.json({ frontmatter: data, body })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// List mystery pages
router.get('/mysteries', (req, res) => {
  try {
    const mysteriesPath = path.join(WIKI_BASE, 'mysteries')
    if (!fs.existsSync(mysteriesPath)) {
      return res.json([])
    }
    const files = fs.readdirSync(mysteriesPath).filter(f => f.endsWith('.md'))
    const mysteries = files.map(f => {
      const content = fs.readFileSync(path.join(mysteriesPath, f), 'utf-8')
      const { data } = matter(content)
      return { name: f.replace('.md', ''), ...data }
    })
    res.json(mysteries)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Read source page
router.get('/sources/:name', (req, res) => {
  try {
    const { name } = req.params
    const filePath = path.join(WIKI_BASE, 'sources', `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Source not found' })
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)
    res.json({ frontmatter: data, body })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Get recent log entries
router.get('/log', (req, res) => {
  try {
    const logPath = path.join(process.env.HOME || '~', 'genealogy-wiki', 'log.md')
    if (!fs.existsSync(logPath)) {
      return res.json([])
    }
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').slice(-20)
    res.json(lines)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export { router as wikiRouter }
