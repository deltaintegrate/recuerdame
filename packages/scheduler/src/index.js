import 'dotenv/config'
import cron from 'node-cron'
import { initDb, getDb, sendWhatsAppMessage, closeDb } from '@recuerdame/shared'

// Format helpers (duplicated from shared to avoid circular deps)
function formatDate (dateStr) {
  const [year, month, day] = String(dateStr).split('T')[0].split('-')
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`
}

function formatTime (timeStr) {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${m} ${ampm}`
}

async function sendReminders () {
  const db = getDb()
  const now = new Date()

  console.log('[Scheduler] Checking reminders at', now.toISOString())

  // ── 2 days before ──────────────────────────────────────────────────────────
  const twoDaysAhead = new Date(now)
  twoDaysAhead.setDate(twoDaysAhead.getDate() + 2)
  const twoDaysDate = twoDaysAhead.toISOString().split('T')[0]

  const twoDayReminders = await db.query(
    `SELECT * FROM appointments
     WHERE appointment_date = $1
       AND status = 'scheduled'
       AND reminder_2days_sent = FALSE`,
    [twoDaysDate]
  )

  for (const appt of twoDayReminders.rows) {
    try {
      await sendWhatsAppMessage(
        appt.phone_number,
        `⏰ *Recordatorio de cita* — Tienes una cita *${appt.type}* en 2 días:\n\n📅 Fecha: ${formatDate(appt.appointment_date)}\n⏰ Hora: ${formatTime(appt.appointment_time)}\n📍 Lugar: ${appt.place}\n\n¡Te esperamos!`
      )
      await db.query('UPDATE appointments SET reminder_2days_sent = TRUE WHERE id = $1', [appt.id])
      console.log(`[Scheduler] 2-day reminder sent to ${appt.phone_number} for appointment ${appt.id}`)
    } catch (err) {
      console.error(`[Scheduler] Error sending 2-day reminder to ${appt.phone_number}:`, err.message)
    }
  }

  // ── Same day ───────────────────────────────────────────────────────────────
  const todayDate = now.toISOString().split('T')[0]

  const sameDayReminders = await db.query(
    `SELECT * FROM appointments
     WHERE appointment_date = $1
       AND status = 'scheduled'
       AND reminder_same_day_sent = FALSE
       AND appointment_time > $2::time`,
    [todayDate, now.toTimeString().split(' ')[0]]
  )

  for (const appt of sameDayReminders.rows) {
    try {
      await sendWhatsAppMessage(
        appt.phone_number,
        `🌅 *¡Hoy es tu cita!* — Tienes una cita *${appt.type}* hoy:\n\n⏰ Hora: ${formatTime(appt.appointment_time)}\n📍 Lugar: ${appt.place}\n\n¡No olvides asistir! 😊`
      )
      await db.query('UPDATE appointments SET reminder_same_day_sent = TRUE WHERE id = $1', [appt.id])
      console.log(`[Scheduler] Same-day reminder sent to ${appt.phone_number} for appointment ${appt.id}`)
    } catch (err) {
      console.error(`[Scheduler] Error sending same-day reminder to ${appt.phone_number}:`, err.message)
    }
  }

  // ── 1 hour before ─────────────────────────────────────────────────────────
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
  // Window: appointments between now+50min and now+70min to avoid missing due to cron drift
  const windowStart = new Date(now.getTime() + 50 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 70 * 60 * 1000)

  const oneHourReminders = await db.query(
    `SELECT * FROM appointments
     WHERE appointment_date = $1
       AND status = 'scheduled'
       AND reminder_1hour_sent = FALSE
       AND appointment_time >= $2::time
       AND appointment_time <= $3::time`,
    [
      todayDate,
      windowStart.toTimeString().split(' ')[0],
      windowEnd.toTimeString().split(' ')[0]
    ]
  )

  for (const appt of oneHourReminders.rows) {
    try {
      await sendWhatsAppMessage(
        appt.phone_number,
        `🔔 *¡Tu cita es en 1 hora!* — Recuerda tu cita *${appt.type}*:\n\n⏰ Hora: ${formatTime(appt.appointment_time)}\n📍 Lugar: ${appt.place}\n\n¡Te esperamos pronto! 🙌`
      )
      await db.query('UPDATE appointments SET reminder_1hour_sent = TRUE WHERE id = $1', [appt.id])
      console.log(`[Scheduler] 1-hour reminder sent to ${appt.phone_number} for appointment ${appt.id}`)
    } catch (err) {
      console.error(`[Scheduler] Error sending 1-hour reminder to ${appt.phone_number}:`, err.message)
    }
  }

  // ── Mark past appointments as completed ────────────────────────────────────
  await db.query(
    `UPDATE appointments
     SET status = 'completed'
     WHERE status = 'scheduled'
       AND (appointment_date < CURRENT_DATE
            OR (appointment_date = CURRENT_DATE AND appointment_time < CURRENT_TIME))`
  )
}

async function start () {
  await initDb()
  console.log('[Scheduler] Service started')

  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await sendReminders()
    } catch (err) {
      console.error('[Scheduler] Unhandled error in reminder job:', err)
    }
  })

  // Also run immediately on start
  await sendReminders().catch(err => console.error('[Scheduler] Initial run error:', err))
}

process.on('SIGTERM', async () => {
  console.log('[Scheduler] Shutting down...')
  await closeDb()
  process.exit(0)
})

start().catch((err) => {
  console.error('[Scheduler] Fatal error:', err)
  process.exit(1)
})
