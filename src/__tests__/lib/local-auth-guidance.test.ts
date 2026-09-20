import { describe, expect, test } from 'vitest'
import { extractMagicLink, localAuthGuidance } from '@/lib/local-auth-guidance'

describe('local auth guidance', () => {
  test('stays disabled in production', () => {
    expect(
      localAuthGuidance({
        NODE_ENV: 'production',
        DOC_MAILPIT_URL: 'http://localhost:8025',
        DOC_LOCAL_AUTH_HINT: '1',
      })
    ).toEqual({ enabled: false, mailpitUrl: null })
  })

  test('enables outside production on loopback Mailpit by default', () => {
    expect(localAuthGuidance({ NODE_ENV: 'development' })).toEqual({
      enabled: true,
      mailpitUrl: 'http://localhost:8025',
    })
  })

  test('uses an explicit loopback Mailpit URL', () => {
    expect(localAuthGuidance({ NODE_ENV: 'development', DOC_MAILPIT_URL: 'http://127.0.0.1:8025' })).toEqual({
      enabled: true,
      mailpitUrl: 'http://127.0.0.1:8025',
    })
  })

  test('can be opted out outside production', () => {
    expect(
      localAuthGuidance({
        NODE_ENV: 'development',
        DOC_LOCAL_AUTH_HINT: '0',
        DOC_MAILPIT_URL: 'http://localhost:8025',
      })
    ).toEqual({ enabled: false, mailpitUrl: null })
  })

  test('does not enable assist against a non-loopback inbox', () => {
    expect(
      localAuthGuidance({
        NODE_ENV: 'development',
        DOC_MAILPIT_URL: 'https://mailpit.example.test',
      })
    ).toEqual({ enabled: false, mailpitUrl: null })
  })

  test('extracts the Auth.js callback from mail HTML', () => {
    expect(
      extractMagicLink(
        '<a href="http://localhost:3100/api/auth/callback/nodemailer?callbackUrl=%2F&token=abc&email=a%40b.c">Sign in</a>'
      )
    ).toBe('http://localhost:3100/api/auth/callback/nodemailer?callbackUrl=%2F&token=abc&email=a%40b.c')
  })
})
