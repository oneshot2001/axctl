import { VapixClient } from './vapix-client.js'
import { buildDigestHeader } from './digest-auth.js'

// ---- Types -----------------------------------------------------------------

export interface AoaDevice {
  id: number
  name: string
  type: string
  channels?: number[]
}

export interface AoaScenario {
  id: number
  name: string
  type: string
  enabled: boolean
  devices: number[]
  filters?: Record<string, unknown>[]
  triggers?: Record<string, unknown>[]
  presets?: unknown[]
}

export interface AoaCapabilities {
  scenarios: string[]
  filters: string[]
  objects: string[]
}

// ---- Client ----------------------------------------------------------------

export class AoaClient {
  private client: VapixClient

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.client = new VapixClient(host, username, password)
  }

  private async call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const url = `http://${this.host}/local/objectanalytics/control.cgi`
    const body = JSON.stringify({ apiVersion: '1.3', method, params })

    // Probe for 401 challenge
    const probe = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })

    let res: Response
    if (probe.status === 401) {
      const wwwAuth = probe.headers.get('www-authenticate') ?? ''
      const fields: Record<string, string> = {}
      const re = /(\w+)="([^"]+)"/g
      let m
      while ((m = re.exec(wwwAuth)) !== null) fields[m[1]!] = m[2]!
      const challenge = {
        realm: fields.realm ?? '',
        nonce: fields.nonce ?? '',
        algorithm: fields.algorithm ?? 'MD5',
        qop: fields.qop,
        opaque: fields.opaque,
      }
      const uri = '/local/objectanalytics/control.cgi'
      const authHeader = buildDigestHeader('POST', uri, this.username, this.password, challenge)
      res = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      })
    } else {
      res = probe
    }

    if (!res.ok) {
      const text = await res.text()
      if (text.includes('DOCTYPE')) {
        throw new Error(`AOA API error ${res.status} — is AXIS Object Analytics app running? Try: axctl apps start <ip> objectanalytics`)
      }
      throw new Error(`AOA API error ${res.status}: ${text.slice(0, 200)}`)
    }

    const json = await res.json() as { data?: unknown; error?: { code: number; message: string } }
    if (json.error) throw new Error(`AOA error ${json.error.code}: ${json.error.message}`)
    return json.data
  }

  async getScenarios(): Promise<AoaScenario[]> {
    const data = await this.call('getScenarios', {}) as { scenarios?: AoaScenario[] }
    return data?.scenarios ?? []
  }

  async getDevices(): Promise<AoaDevice[]> {
    const data = await this.call('getDevices', {}) as { devices?: AoaDevice[] }
    return data?.devices ?? []
  }

  async getCapabilities(): Promise<AoaCapabilities> {
    const data = await this.call('getSupportedScenarioTypes', {}) as AoaCapabilities
    return data ?? { scenarios: [], filters: [], objects: [] }
  }

  async enableScenario(id: number): Promise<void> {
    await this.call('updateScenario', { id, enabled: true })
  }

  async disableScenario(id: number): Promise<void> {
    await this.call('updateScenario', { id, enabled: false })
  }
}
