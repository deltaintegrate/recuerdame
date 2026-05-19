import 'dotenv/config'
import express from 'express'
import { initDb } from '@recuerdame/shared'
import { webhookRouter } from './routes/webhook.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'webhook' }))

app.use('/webhook', webhookRouter)

async function start () {
  await initDb()
  app.listen(PORT, () => {
    console.log(`[Webhook] Server running on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error('[Webhook] Fatal error:', err)
  process.exit(1)
})
