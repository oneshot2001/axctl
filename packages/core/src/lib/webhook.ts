/**
 * Webhook delivery with retry logic.
 * Used by event streaming and health check commands.
 */

export interface WebhookOptions {
  /** Max retry attempts (default: 3). */
  maxRetries?: number
  /** Base delay in ms for exponential backoff (default: 1000). */
  baseDelayMs?: number
  /** Called on delivery failure after all retries exhausted. */
  onFailure?: (url: string, error: Error, attempts: number) => void
}

/**
 * POST JSON to a webhook URL with exponential backoff retry.
 * Non-blocking — returns a promise but callers can fire-and-forget.
 */
export async function postWebhook(
  url: string,
  payload: unknown,
  opts: WebhookOptions = {}
): Promise<boolean> {
  const maxRetries = opts.maxRetries ?? 3
  const baseDelay = opts.baseDelayMs ?? 1000
  const body = JSON.stringify(payload)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      })

      if (res.ok || res.status < 500) {
        // 2xx = success, 4xx = client error (retrying won't help)
        return res.ok
      }

      // 5xx = server error, worth retrying
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, delay))
      }
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, delay))
      } else {
        opts.onFailure?.(url, err instanceof Error ? err : new Error(String(err)), maxRetries)
        return false
      }
    }
  }

  return false
}
