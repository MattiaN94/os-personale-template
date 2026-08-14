const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function europeRomeDateTime(day: string, hour = 9, minute = 0) {
  if (!ISO_DAY.test(day) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('invalid_local_datetime')
  const probe = new Date(`${day}T12:00:00Z`)
  if (!Number.isFinite(probe.getTime()) || probe.toISOString().slice(0, 10) !== day) throw new Error('invalid_local_datetime')
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    timeZoneName: 'longOffset',
  }).formatToParts(probe).find((part) => part.type === 'timeZoneName')?.value
  const match = zone?.match(/^GMT([+-]\d{2}:\d{2})$/)
  if (!match) throw new Error('timezone_offset_unavailable')
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${match[1]}`
}
