import { describe, expect, it } from 'vitest'
import { detectSecrets } from './detect'

function matches(text: string) {
  return detectSecrets(text).map(({ from, to, kind }) => [kind, text.slice(from, to)])
}

describe('local secret suggestions', () => {
  it('finds exact values after clear labels in notes and configuration', () => {
    expect(
      matches(
        '🔧 Пароль от сервера: summer2026\n' +
          '{"client_secret": "sample-configuration-value"}\n' +
          'Код домофона: 4821\n| Номер паспорта | AB 1234567 |',
      ),
    ).toEqual([
      ['password', 'summer2026'],
      ['token', 'sample-configuration-value'],
      ['accessCode', '4821'],
      ['personalData', 'AB 1234567'],
    ])
  })

  it('groups a complete private key and deduplicates a token found by two rules', () => {
    const key = '-----BEGIN OPENSSH PRIVATE KEY-----\r\nYWJj\r\n-----END OPENSSH PRIVATE KEY-----'
    const token = 'ghp_012345678901234567890123456789012345'
    expect(matches([key, 'Authorization: Bearer ' + token].join('\r\n'))).toEqual([
      ['privateKey', key],
      ['token', token],
    ])
  })

  it('skips ordinary prose, public keys, dates and explicit placeholders', () => {
    expect(
      matches(
        [
          'Встреча 21 ноября в 18:30, Иван',
          '4821',
          'API_KEY = YOUR_API_KEY',
          'Password: <password>',
          'PIN: 12:00',
          'sha256: 31ac603826ae2654a904ac4c585510bdbb68',
          '-----BEGIN PUBLIC KEY-----\nYWJj\n-----END PUBLIC KEY-----',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('ignores incomplete or mismatched private key blocks', () => {
    expect(
      matches('-----BEGIN RSA PRIVATE KEY-----\nYWJj\n-----END OPENSSH PRIVATE KEY-----'),
    ).toEqual([])
  })
})
