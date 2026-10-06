import { describe, expect, it } from 'vitest'
import { thisWeek, visibleItems } from './helpers'
import type { RecordData } from './types'

const records = [
  { id: 'one', lawFirmId: 'firm-a', responsibleLawyerId: 'azriel' },
  { id: 'two', lawFirmId: 'firm-a', responsibleLawyerId: 'francisco' },
  { id: 'three', lawFirmId: 'firm-a', responsibleLawyerId: null },
] as RecordData[]

describe('responsibility filters', () => {
  it('keeps unassigned requests visible to the whole firm', () => {
    expect(visibleItems(records, 'all', 'azriel')).toHaveLength(3)
    expect(visibleItems(records, 'mine', 'azriel').map(item => item.id)).toEqual(['one'])
  })
  it('shows the selected lawyer’s records', () => {
    expect(visibleItems(records, 'lawyer:francisco', 'azriel').map(item => item.id)).toEqual(['two'])
  })
  it('includes an agenda participant in that lawyer’s agenda', () => {
    const appointment = { id: 'hearing', lawFirmId: 'firm-a', responsibleLawyerId: 'azriel', participants: ['francisco'] }
    expect(visibleItems([appointment], 'mine', 'francisco', true)).toHaveLength(1)
  })
})

describe('weekly deadlines', () => {
  it('uses Monday through Sunday', () => {
    const wednesday = new Date(2026, 9, 7)
    expect(thisWeek('2026-10-05', wednesday)).toBe(true)
    expect(thisWeek('2026-10-11', wednesday)).toBe(true)
    expect(thisWeek('2026-10-12', wednesday)).toBe(false)
  })
})
