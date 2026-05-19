import * as chrono from 'chrono-node'
import { getDb, sendWhatsAppMessage } from '@recuerdame/shared'
import {
  findOrCreateUser,
  getUpcomingAppointments,
  saveAppointment,
  formatAppointmentList,
  formatDate,
  formatTime
} from './appointment.js'

// ─── States ──────────────────────────────────────────────────────────────────
const STATES = {
  IDLE: 'IDLE',
  AWAITING_SCHEDULE_CONFIRM: 'AWAITING_SCHEDULE_CONFIRM',
  AWAITING_TYPE: 'AWAITING_TYPE',
  AWAITING_DATE: 'AWAITING_DATE',
  AWAITING_TIME: 'AWAITING_TIME',
  AWAITING_PLACE: 'AWAITING_PLACE',
  AWAITING_FINAL_CONFIRM: 'AWAITING_FINAL_CONFIRM'
}

// ─── State persistence ────────────────────────────────────────────────────────
async function getConversationState (phoneNumber) {
  const db = getDb()
  const result = await db.query(
    'SELECT state, context FROM conversation_states WHERE phone_number = $1',
    [phoneNumber]
  )
  if (result.rows.length === 0) {
    return { state: STATES.IDLE, context: {} }
  }
  return result.rows[0]
}

async function setConversationState (phoneNumber, state, context = {}) {
  const db = getDb()
  await db.query(
    `INSERT INTO conversation_states (phone_number, state, context, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (phone_number)
     DO UPDATE SET state = EXCLUDED.state, context = EXCLUDED.context, updated_at = NOW()`,
    [phoneNumber, state, JSON.stringify(context)]
  )
}

// ─── Intent detection ─────────────────────────────────────────────────────────
function isYes (text) {
  return /\b(s[ií]|claro|ok|dale|bueno|por supuesto|obvio|afirmativo|confirmo|confirm|yes|yep|yeah|quiero|deseo|agend|agenda|correcto|exacto|listo|perfecto)\b/i.test(text)
}

function isNo (text) {
  return /\b(no|nop|nel|neg|cancela|cancel|nunca)\b/i.test(text) && !isYes(text)
}

function isSocialNicety (text) {
  return /\b(gracias|thank|thanks|de nada|ok|okay|entendido|perfecto|genial|excelente|listo|hasta luego|adios|adi[oó]s|bye|chao|ciao|nos vemos)\b/i.test(text)
}

function isOffTopic (text) {
  const topicKeywords = /\b(cita|agendar|agenda|recordatorio|hora|fecha|lugar|tipo|citas|reserva|reservar)\b/i
  const greetings = /\b(hola|buenos|buenas|hi|hello)\b/i
  return !topicKeywords.test(text) && !greetings.test(text)
}

// ─── Normalización español → inglés para chrono ───────────────────────────────
function normalizeSpanish (text) {
  return text
    // Expresiones de tiempo coloquiales — ANTES de reemplazar números
    .replace(/de la ma[nñ]ana/gi, 'am')
    .replace(/de la tarde/gi, 'pm')
    .replace(/de la noche/gi, 'pm')
    .replace(/del mediod[ií]a/gi, 'pm')
    .replace(/mediod[ií]a/gi, '12:00 pm')
    .replace(/medianoche/gi, '12:00 am')
    .replace(/al mediod[ií]a/gi, '12:00 pm')
    // Preposiciones de tiempo
    .replace(/\ba las?\b/gi, 'at')
    .replace(/\blas?\b/gi, '')
    // Días
    .replace(/\bma[nñ]ana\b/gi, 'tomorrow')
    .replace(/\bhoy\b/gi, 'today')
    .replace(/\bpasado ma[nñ]ana\b/gi, 'day after tomorrow')
    .replace(/\blunes\b/gi, 'Monday')
    .replace(/\bmartes\b/gi, 'Tuesday')
    .replace(/\bmi[eé]rcoles\b/gi, 'Wednesday')
    .replace(/\bjueves\b/gi, 'Thursday')
    .replace(/\bviernes\b/gi, 'Friday')
    .replace(/\bs[aá]bado\b/gi, 'Saturday')
    .replace(/\bdomingo\b/gi, 'Sunday')
    // Meses
    .replace(/\benero\b/gi, 'January')
    .replace(/\bfebrero\b/gi, 'February')
    .replace(/\bmarzo\b/gi, 'March')
    .replace(/\babril\b/gi, 'April')
    .replace(/\bmayo\b/gi, 'May')
    .replace(/\bjunio\b/gi, 'June')
    .replace(/\bjulio\b/gi, 'July')
    .replace(/\bagosto\b/gi, 'August')
    .replace(/\bseptiembre\b/gi, 'September')
    .replace(/\boctubre\b/gi, 'October')
    .replace(/\bnoviembre\b/gi, 'November')
    .replace(/\bdiciembre\b/gi, 'December')
    // Conectores de fecha
    .replace(/\bel (pr[oó]ximo|que viene)\b/gi, 'next')
    .replace(/\bpr[oó]ximo\b/gi, 'next')
    .replace(/\bpara el\b/gi, 'on')
    .replace(/\bpara\b/gi, 'on')
    .replace(/\bdel\b/gi, 'of')
    .replace(/\bde\b/gi, 'of')
}

function parseDate (text) {
  const normalized = normalizeSpanish(text)
  const results = chrono.parse(normalized, new Date(), { forwardDate: true })
  if (results.length === 0) return null
  return results[0].start.date()
}

function parseTime (text) {
  const normalized = normalizeSpanish(text)
  const results = chrono.parse(normalized, new Date(), { forwardDate: true })
  if (results.length === 0) return null
  const d = results[0].start.date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}:00`
}

// Extrae lugar del texto eliminando las partes de fecha/hora
function extractPlace (text) {
  // Elimina patrones comunes de fecha y hora del texto para quedarse con el lugar
  const cleaned = text
    .replace(/para el \w+/gi, '')
    .replace(/el \w+/gi, '')
    .replace(/a las?\s+\d+(\s*(am|pm|de la tarde|de la mañana|de la noche))?/gi, '')
    .replace(/\d+\s*(am|pm|:00|:30|:15|:45)/gi, '')
    .replace(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, '')
    .replace(/\b(ma[nñ]ana|hoy|pasado ma[nñ]ana)\b/gi, '')
    .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi, '')
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '')
    .replace(/\b(en|con|al|es|la|el|de|del|para)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[\s,]+|[\s,]+$/g, '')

  return cleaned.length >= 3 ? cleaned : null
}

// ─── Extracción inteligente de fecha+hora+lugar de un solo mensaje ────────────
function extractAll (text) {
  const date = parseDate(text)
  const time = parseTime(text)
  const place = extractPlace(text)
  return { date, time, place }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleIncomingMessage (phoneNumber, text, contactName) {
  const trimmed = text.trim()

  const user = await findOrCreateUser(phoneNumber, contactName)
  const { state, context } = await getConversationState(phoneNumber)
  const firstName = user.name ? user.name.split(' ')[0] : 'amigo/a'

  console.log(`[Conversation] ${phoneNumber} | state: ${state} | text: "${trimmed}"`)

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (state === STATES.IDLE) {
    // Frases sociales — responder cordialmente sin mostrar citas
    if (isSocialNicety(trimmed)) {
      await send(phoneNumber, `¡Con gusto, ${firstName}! 😊 Si necesitas agendar una cita, aquí estaré. ¡Hasta pronto!`)
      return
    }

    const upcoming = await getUpcomingAppointments(phoneNumber)
    const list = formatAppointmentList(upcoming)

    if (isOffTopic(trimmed) && upcoming.length === 0) {
      await send(phoneNumber, `¡Hola! 😊 Soy *Recuérdame*, tu asistente para agendar citas. Solo puedo ayudarte con eso. ¿Te gustaría agendar una cita?`)
      await setConversationState(phoneNumber, STATES.AWAITING_SCHEDULE_CONFIRM, {})
      return
    }

    if (upcoming.length > 0) {
      await send(phoneNumber, `¡Hola, ${firstName}! 👋 Tienes ${upcoming.length} cita(s) próxima(s):\n\n${list}\n\n¿Te gustaría agendar otra cita?`)
      await setConversationState(phoneNumber, STATES.AWAITING_SCHEDULE_CONFIRM, {})
    } else {
      await send(phoneNumber, `¡Hola, ${firstName}! 👋 Soy *Recuérdame*, tu asistente de citas. No tienes citas próximas agendadas. ¿Te gustaría agendar una?`)
      await setConversationState(phoneNumber, STATES.AWAITING_SCHEDULE_CONFIRM, {})
    }
    return
  }

  // ── AWAITING_SCHEDULE_CONFIRM ─────────────────────────────────────────────
  if (state === STATES.AWAITING_SCHEDULE_CONFIRM) {
    if (isYes(trimmed)) {
      await send(phoneNumber, `¡Perfecto! 📋 ¿Qué *tipo de cita* deseas agendar? Por ejemplo: médica, dental, legal, personal, etc.`)
      await setConversationState(phoneNumber, STATES.AWAITING_TYPE, {})
    } else if (isNo(trimmed)) {
      await send(phoneNumber, `¡Está bien! Si en algún momento deseas agendar una cita, escríbeme. ¡Hasta luego! 👋`)
      await setConversationState(phoneNumber, STATES.IDLE, {})
    } else if (isOffTopic(trimmed)) {
      await send(phoneNumber, `Lo siento, solo puedo ayudarte a agendar citas. ¿Deseas agendar una cita? Responde *sí* o *no*.`)
    } else {
      await send(phoneNumber, `No entendí tu respuesta. ¿Deseas agendar una cita? Responde *sí* o *no*.`)
    }
    return
  }

  // ── AWAITING_TYPE ─────────────────────────────────────────────────────────
  if (state === STATES.AWAITING_TYPE) {
    if (trimmed.length < 2) {
      await send(phoneNumber, `Por favor, dime el tipo de cita que deseas agendar. Por ejemplo: médica, dental, legal, etc.`)
      return
    }
    const newContext = { ...context, type: trimmed }
    await send(phoneNumber, `Entendido, una cita *${trimmed}*. 📅 ¿Para qué *fecha*, *hora* y *lugar* sería? Puedes dármelos todos juntos, por ejemplo: "el viernes a las 2pm en Clínica del Norte".`)
    await setConversationState(phoneNumber, STATES.AWAITING_DATE, newContext)
    return
  }

  // ── AWAITING_DATE ─────────────────────────────────────────────────────────
  if (state === STATES.AWAITING_DATE) {
    const { date: parsedDate, time: parsedTime, place: parsedPlace } = extractAll(trimmed)

    if (!parsedDate) {
      await send(phoneNumber, `No pude entender la fecha. 🤔 Intenta con algo como "el viernes a las 2pm en Clínica del Norte" o simplemente "20 de junio".`)
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (parsedDate < today) {
      await send(phoneNumber, `Esa fecha ya pasó. 📅 Por favor indica una fecha futura.`)
      return
    }

    const dateStr = parsedDate.toISOString().split('T')[0]
    const newContext = { ...context, date: dateStr }

    // Si también vino la hora
    if (parsedTime) newContext.time = parsedTime
    // Si también vino el lugar
    if (parsedPlace) newContext.place = parsedPlace

    // Saltar estados ya cubiertos
    if (newContext.time && newContext.place) {
      const summary = buildSummary(newContext)
      await send(phoneNumber, `¡Casi listo! ✅ Por favor confirma los datos de tu cita:\n\n${summary}\n\n¿Es correcto? Responde *sí* para confirmar o *no* para cancelar.`)
      await setConversationState(phoneNumber, STATES.AWAITING_FINAL_CONFIRM, newContext)
    } else if (newContext.time) {
      await send(phoneNumber, `Perfecto, *${formatDate(dateStr)}* a las *${formatTime(newContext.time)}*. 📍 ¿Cuál es el *lugar* de la cita?`)
      await setConversationState(phoneNumber, STATES.AWAITING_PLACE, newContext)
    } else {
      await send(phoneNumber, `Perfecto, *${formatDate(dateStr)}*. ⏰ ¿A qué *hora* sería la cita? Por ejemplo: "10am", "3:30 pm", "las 2 de la tarde".`)
      await setConversationState(phoneNumber, STATES.AWAITING_TIME, newContext)
    }
    return
  }

  // ── AWAITING_TIME ─────────────────────────────────────────────────────────
  if (state === STATES.AWAITING_TIME) {
    const parsed = parseTime(trimmed)
    if (!parsed) {
      await send(phoneNumber, `No pude entender esa hora. ⏰ Intenta con algo como "10am", "3:30 pm", "las 2 de la tarde" o "14:00".`)
      return
    }
    const newContext = { ...context, time: parsed }

    // Si el usuario también incluyó el lugar en este mensaje, extraerlo
    const possiblePlace = extractPlace(trimmed)
    if (possiblePlace) newContext.place = possiblePlace

    if (newContext.place) {
      const summary = buildSummary(newContext)
      await send(phoneNumber, `¡Casi listo! ✅ Por favor confirma los datos de tu cita:\n\n${summary}\n\n¿Es correcto? Responde *sí* para confirmar o *no* para cancelar.`)
      await setConversationState(phoneNumber, STATES.AWAITING_FINAL_CONFIRM, newContext)
    } else {
      await send(phoneNumber, `Muy bien, a las *${formatTime(parsed)}*. 📍 ¿Cuál es el *lugar* de la cita? Por ejemplo: "Clínica del Norte", "Consultorio Dr. García, Calle 5", etc.`)
      await setConversationState(phoneNumber, STATES.AWAITING_PLACE, newContext)
    }
    return
  }

  // ── AWAITING_PLACE ────────────────────────────────────────────────────────
  if (state === STATES.AWAITING_PLACE) {
    if (trimmed.length < 2) {
      await send(phoneNumber, `Por favor, dime el lugar de la cita.`)
      return
    }
    const newContext = { ...context, place: trimmed }
    const summary = buildSummary(newContext)
    await send(phoneNumber, `¡Casi listo! ✅ Por favor confirma los datos de tu cita:\n\n${summary}\n\n¿Es correcto? Responde *sí* para confirmar o *no* para cancelar.`)
    await setConversationState(phoneNumber, STATES.AWAITING_FINAL_CONFIRM, newContext)
    return
  }

  // ── AWAITING_FINAL_CONFIRM ────────────────────────────────────────────────
  if (state === STATES.AWAITING_FINAL_CONFIRM) {
    if (isYes(trimmed)) {
      await saveAppointment(phoneNumber, user.id, context)
      await setConversationState(phoneNumber, STATES.IDLE, {})
      await send(phoneNumber,
        `🎉 ¡Tu cita ha sido agendada con éxito!\n\n${buildSummary(context)}\n\nTe enviaré recordatorios 2 días antes, el mismo día y 1 hora antes de tu cita. ¡Hasta pronto! 😊`
      )
    } else if (isNo(trimmed)) {
      await setConversationState(phoneNumber, STATES.IDLE, {})
      await send(phoneNumber, `De acuerdo, he cancelado el proceso. Si deseas agendar una cita en otro momento, escríbeme. ¡Hasta luego! 👋`)
    } else {
      await send(phoneNumber, `Por favor responde *sí* para confirmar la cita o *no* para cancelar.`)
    }
    return
  }

  // Fallback
  await send(phoneNumber, `Lo siento, algo salió mal. Escribe *hola* para comenzar de nuevo.`)
  await setConversationState(phoneNumber, STATES.IDLE, {})
}

function buildSummary (context) {
  return [
    `📋 *Tipo:* ${context.type || '—'}`,
    `📅 *Fecha:* ${context.date ? formatDate(context.date) : '—'}`,
    `⏰ *Hora:* ${context.time ? formatTime(context.time) : '—'}`,
    `📍 *Lugar:* ${context.place || '—'}`
  ].join('\n')
}

async function send (phoneNumber, text) {
  return sendWhatsAppMessage(phoneNumber, text)
}
