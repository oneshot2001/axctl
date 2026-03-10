import { digestFetch } from './digest-auth.js'

export class VapixClient {
  private baseUrl: string

  constructor(
    private host: string,
    private username: string,
    private password: string
  ) {
    this.baseUrl = `http://${host}`
  }

  async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const res = await digestFetch(url, 'GET', this.username, this.password)
    if (!res.ok) throw new Error(`VAPIX GET ${path} → ${res.status} ${res.statusText}`)
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return text // some VAPIX endpoints return XML or plain text
    }
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const res = await digestFetch(url, 'POST', this.username, this.password, JSON.stringify(body))
    if (!res.ok) throw new Error(`VAPIX POST ${path} → ${res.status} ${res.statusText}`)
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  async getDeviceInfo(): Promise<Record<string, string>> {
    const res = await this.get('/axis-cgi/basicdeviceinfo.cgi') as Record<string, Record<string, unknown>>
    const data = res?.data as Record<string, unknown> | undefined
    return ((data?.propertyList as Record<string, string>) ?? res) as Record<string, string>
  }
}
