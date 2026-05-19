import { Router } from 'express'
import { handleIncomingMessage } from '../services/conversation.js'
import { markAsRead } from '@recuerdame/shared'

export const webhookRouter = Router()

// Meta webhook verification
webhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] Verification successful')
    return res.status(200).send(challenge)
  }

  console.warn('[Webhook] Verification failed')
  res.sendStatus(403)
})

// Incoming messages
webhookRouter.post('/', async (req, res) => {
  // Acknowledge immediately to Meta (must respond within 5 seconds)
  res.sendStatus(200)

  try {
    const body = req.body
    if (body.object !== 'whatsapp_business_account') return

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const messages = value.messages || []
        const contacts = value.contacts || []

        for (const message of messages) {
          if (message.type !== 'text') {
            console.log(`[Webhook] Skipping non-text message type: ${message.type}`)
            continue
          }

          const from = message.from
          const text = message.text?.body || ''
          const contactName = contacts.find(c => c.wa_id === from)?.profile?.name || null

          console.log(`[Webhook] Message from ${from}: ${text}`)

          // Mark as read
          await markAsRead(message.id).catch(e => console.warn('[Webhook] Could not mark as read:', e.message))

          // Process message
          await handleIncomingMessage(from, text, contactName)
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Error processing message:', err)
  }
})
