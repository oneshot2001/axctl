import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { postWebhook } from '../src/lib/webhook.js'

// We test the retry logic by mocking global fetch
const originalFetch = globalThis.fetch

describe('postWebhook', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns true on 200 OK', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response('ok', { status: 200 }))) as unknown as typeof fetch
    const result = await postWebhook('http://localhost/hook', { event: 'test' })
    expect(result).toBe(true)
  })

  test('returns false on 400 without retry', async () => {
    const mockFetch = mock(() => Promise.resolve(new Response('bad', { status: 400 }))) as unknown as typeof fetch
    globalThis.fetch = mockFetch
    const result = await postWebhook('http://localhost/hook', { event: 'test' })
    expect(result).toBe(false)
    // 4xx should not retry — only called once
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test('retries on 500 then succeeds', async () => {
    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      if (callCount === 1) return Promise.resolve(new Response('err', { status: 500 }))
      return Promise.resolve(new Response('ok', { status: 200 }))
    }) as unknown as typeof fetch

    const result = await postWebhook('http://localhost/hook', { event: 'test' }, {
      maxRetries: 3,
      baseDelayMs: 10, // fast for tests
    })
    expect(result).toBe(true)
    expect(callCount).toBe(2)
  })

  test('calls onFailure after all retries exhausted', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch

    let failureCalled = false
    let failureAttempts = 0
    await postWebhook('http://localhost/hook', { event: 'test' }, {
      maxRetries: 2,
      baseDelayMs: 10,
      onFailure: (_url, _err, attempts) => {
        failureCalled = true
        failureAttempts = attempts
      },
    })
    expect(failureCalled).toBe(true)
    expect(failureAttempts).toBe(2)
  })
})
