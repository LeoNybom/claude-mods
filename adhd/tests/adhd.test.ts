import { expect, test } from 'claude-code/testing'

import { contextFor, FULL, OFF, REMINDER } from '../hooks/adhd'

test('the rules go out in full once, then a short reminder, and one line when turned off', () => {
  expect(contextFor(false, 'nothing')).toEqual({ text: null, told: 'nothing' })
  expect(contextFor(true, 'nothing')).toEqual({ text: FULL, told: 'rules' })
  expect(contextFor(true, 'rules')).toEqual({ text: REMINDER, told: 'rules' })
  expect(contextFor(false, 'rules')).toEqual({ text: OFF, told: 'off' })
  expect(contextFor(false, 'off')).toEqual({ text: null, told: 'off' })
  expect(contextFor(true, 'off')).toEqual({ text: FULL, told: 'rules' })
})

test('the full text carries the upstream rules', () => {
  expect(FULL).toContain('Lead with the next action')
  expect(FULL).toContain('Pre-send check')
})
