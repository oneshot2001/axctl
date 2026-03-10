import { buildDigestHeader } from './digest-auth.js'

// ---- Types matching real AOA v1.6 API structure ----------------------------

export interface AoaDevice {
  id: number
  isActive: boolean
  rotation: number
  type: string
}

export interface AoaFilter {
  type: string
  [key: string]: unknown
}

export interface AoaTrigger {
  type: string
  vertices?: [number, number][]
  [key: string]: unknown
}

export interface AoaObjectClass {
  type: string
  subTypes?: { type: string }[]
}

export interface AoaScenario {
  id: number
  name: string
  type: string
  devices: { id: number }[]
  filters: AoaFilter[]
  triggers: AoaTrigger[]
  objectClassifications: AoaObjectClass[]
  metadataOverlay?: number
}

export interface AoaConfiguration {
  devices: AoaDevice[]
  scenarios: AoaScenario[]
  metadataOverlay?: unknown[]
}

// Scenario types supported by AOA on ARTPEC-9 / v1.6
export const SCENARIO_TYPES = ['motion'] as const
export type ScenarioType = typeof SCENARIO_TYPES[number]

// Default full-frame trigger zone
const FULL_FRAME_VERTICES: [number, number][] = [
  [-0.97, -0.97], [-0.97, 0.97], [0.97, 0.97], [0.97, -0.97]
]

// Default filters for a new scenario
const DEFAULT_FILTERS: AoaFilter[] = [
  { type: 'distanceSwayingObject', distance: 5 },
  { type: 'timeShortLivedLimit', time: 1 },
  { type: 'sizePercentage', height: 3, width: 3 },
]

// ---- Client ----------------------------------------------------------------

export class AoaClient {
  private readonly url: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.url = `http://${host}/local/objectanalytics/control.cgi`
  }

  private async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify({ apiVersion: '1.6', method, ...(params ? { params } : {}) })

    const probe = await fetch(this.url, {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' }
    })

    let res: Response
    if (probe.status === 401) {
      const wwwAuth = probe.headers.get('www-authenticate') ?? ''
      const fields: Record<string, string> = {}
      const re = /(\w+)="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(wwwAuth)) !== null) fields[m[1]!] = m[2]!
      const challenge = { realm: fields.realm ?? '', nonce: fields.nonce ?? '', algorithm: 'MD5', qop: fields.qop, opaque: fields.opaque }
      const authHeader = buildDigestHeader('POST', '/local/objectanalytics/control.cgi', this.username, this.password, challenge)
      res = await fetch(this.url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Authorization: authHeader } })
    } else {
      res = probe
    }

    if (!res.ok) throw new Error(`AOA HTTP ${res.status}`)
    const json = await res.json() as { data?: unknown; error?: { code: string; message: string } }
    if (json.error) throw new Error(`AOA error ${json.error.code}: ${json.error.message}`)
    return json.data
  }

  async getConfiguration(): Promise<AoaConfiguration> {
    return (await this.call('getConfiguration')) as AoaConfiguration
  }

  async setConfiguration(config: AoaConfiguration): Promise<void> {
    await this.call('setConfiguration', config as unknown as Record<string, unknown>)
  }

  // ---- Convenience helpers ------------------------------------------------

  async getScenarios(): Promise<AoaScenario[]> {
    return (await this.getConfiguration()).scenarios ?? []
  }

  async getDevices(): Promise<AoaDevice[]> {
    return (await this.getConfiguration()).devices ?? []
  }

  async addScenario(
    name: string,
    type: string,
    deviceId = 1,
    objects: string[] = ['human', 'vehicle']
  ): Promise<AoaScenario> {
    const config = await this.getConfiguration()
    const nextId = Math.max(0, ...config.scenarios.map((s) => s.id)) + 1

    const objectClassifications: AoaObjectClass[] = objects.map((o) => {
      if (o === 'vehicle') {
        return { type: 'vehicle', subTypes: [{ type: 'bus' }, { type: 'car' }, { type: 'motorcycle/bicycle' }, { type: 'truck' }, { type: 'unknown' }] }
      }
      return { type: o }
    })

    const triggerType = 'includeArea'
    const scenario: AoaScenario = {
      id: nextId,
      name,
      type,
      devices: [{ id: deviceId }],
      filters: DEFAULT_FILTERS,
      triggers: [{ type: triggerType, vertices: FULL_FRAME_VERTICES }],
      objectClassifications,
      metadataOverlay: config.metadataOverlay?.[0] ? (config.metadataOverlay[0] as { id: number }).id : undefined,
    }

    config.scenarios.push(scenario)
    await this.setConfiguration(config)
    return scenario
  }

  async removeScenario(id: number): Promise<void> {
    const config = await this.getConfiguration()
    const before = config.scenarios.length
    config.scenarios = config.scenarios.filter((s) => s.id !== id)
    if (config.scenarios.length === before) throw new Error(`Scenario ${id} not found`)
    await this.setConfiguration(config)
  }

  async updateScenarioName(id: number, name: string): Promise<void> {
    const config = await this.getConfiguration()
    const scenario = config.scenarios.find((s) => s.id === id)
    if (!scenario) throw new Error(`Scenario ${id} not found`)
    scenario.name = name
    await this.setConfiguration(config)
  }
}
