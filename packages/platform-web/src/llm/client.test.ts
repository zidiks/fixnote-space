import { describe, expect, it } from 'vitest'
import { toLocal } from './client'

describe('chat messages for a small on-device model', () => {
  it('keeps the system prompt first and turns tool results into notes from the user', () => {
    expect(
      toLocal([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'What about Lisbon?' },
        { role: 'assistant', content: '' },
        { role: 'tool', content: '# Lisbon in March\nFlights booked.' },
      ]),
    ).toEqual([
      { role: 'system', content: 'Be brief.' },
      {
        role: 'user',
        content: 'What about Lisbon?\n\nResult from the notes:\n# Lisbon in March\nFlights booked.',
      },
    ])
  })

  it('reads text parts and drops empty turns', () => {
    expect(
      toLocal([
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: '   ' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ])
  })
})
