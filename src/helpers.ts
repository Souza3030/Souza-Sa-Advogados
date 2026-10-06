import type { CollectionName, RecordData } from './types'

export function mine(item: RecordData, uid: string) {
  return item.responsibleLawyerId === uid
}

export function visibleItems(items: RecordData[], filter: string, uid: string, includeParticipants = false) {
  const assigned = (item: RecordData, lawyerId: string) => item.responsibleLawyerId === lawyerId || (includeParticipants && item.participants?.includes(lawyerId))
  if (filter === 'mine') return items.filter(item => assigned(item, uid))
  if (filter.startsWith('lawyer:')) return items.filter(item => assigned(item, filter.slice(7)))
  return items
}

export function displayName(item: RecordData, collection: CollectionName) {
  if (collection === 'processes') return item.number || item.title || 'Processo sem número'
  if (collection === 'documents') return item.fileName || item.title || 'Documento'
  return item.name || item.title || 'Sem título'
}

export function dateLabel(value?: string) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR').format(date)
}

export function appointmentLabel(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function thisWeek(value?: string, now = new Date()) {
  if (!value) return false
  const target = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(target.getTime())) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = (today.getDay() + 6) % 7
  const start = new Date(today)
  start.setDate(today.getDate() - day)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return target >= start && target < end
}
