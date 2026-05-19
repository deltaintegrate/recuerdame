import { getDb } from '@recuerdame/shared'

export async function findOrCreateUser (phoneNumber, name = null) {
  const db = getDb()
  const existing = await db.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber])
  if (existing.rows.length > 0) {
    if (name && !existing.rows[0].name) {
      await db.query('UPDATE users SET name = $1 WHERE phone_number = $2', [name, phoneNumber])
      existing.rows[0].name = name
    }
    return existing.rows[0]
  }
  const result = await db.query(
    'INSERT INTO users (phone_number, name) VALUES ($1, $2) RETURNING *',
    [phoneNumber, name]
  )
  return result.rows[0]
}

export async function getUpcomingAppointments (phoneNumber) {
  const db = getDb()
  const result = await db.query(
    `SELECT * FROM appointments
     WHERE phone_number = $1
       AND status = 'scheduled'
       AND (appointment_date > CURRENT_DATE
            OR (appointment_date = CURRENT_DATE AND appointment_time > CURRENT_TIME))
     ORDER BY appointment_date ASC, appointment_time ASC`,
    [phoneNumber]
  )
  return result.rows
}

export async function saveAppointment (phoneNumber, userId, { type, date, time, place }) {
  const db = getDb()
  const result = await db.query(
    `INSERT INTO appointments (user_id, phone_number, type, appointment_date, appointment_time, place)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, phoneNumber, type, date, time, place]
  )
  return result.rows[0]
}

export function formatAppointmentList (appointments) {
  if (appointments.length === 0) return null
  return appointments
    .map((a, i) => {
      const date = new Date(a.appointment_date + 'T' + a.appointment_time)
      return `${i + 1}. *${a.type}* — ${formatDate(a.appointment_date)} a las ${formatTime(a.appointment_time)} en ${a.place}`
    })
    .join('\n')
}

export function formatDate (dateStr) {
  const [year, month, day] = (dateStr instanceof Date
    ? dateStr.toISOString().split('T')[0]
    : dateStr
  ).split('-')
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`
}

export function formatTime (timeStr) {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${m} ${ampm}`
}
