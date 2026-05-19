const WHATSAPP_API_URL = 'https://graph.facebook.com/v25.0'

async function apiPost(path, body) {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set')
  }

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}${path}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('[WhatsApp] API error:', JSON.stringify(data))
    throw new Error(`WhatsApp API error: ${data.error?.message || response.statusText}`)
  }

  return data
}

export async function sendWhatsAppMessage(to, text) {
  console.log(`[WhatsApp] Sending message to ${to}: ${text.substring(0, 80)}...`)
  return apiPost('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text, preview_url: false }
  })
}

export async function markAsRead(messageId) {
  return apiPost('/messages', {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  })
}
