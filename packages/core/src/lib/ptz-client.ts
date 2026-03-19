import { digestFetch } from './digest-auth.js'

export interface PtzPosition {
  pan: number
  tilt: number
  zoom: number
}

export interface PtzPreset {
  name: string
  position: number
}

export class PtzClient {
  private readonly baseUrl: string

  constructor(
    readonly host: string,
    private username: string,
    private password: string
  ) {
    this.baseUrl = `http://${host}`
  }

  private async cgiGet(params: string): Promise<string> {
    const url = `${this.baseUrl}/axis-cgi/com/ptz.cgi?${params}`
    const res = await digestFetch(url, 'GET', this.username, this.password)
    if (!res.ok) throw new Error(`PTZ error: ${res.status} ${res.statusText}`)
    return (await res.text()).trim()
  }

  async getPosition(): Promise<PtzPosition> {
    const text = await this.cgiGet('query=position')
    // Response: pan=0.0000\ntilt=0.0000\nzoom=1
    const props: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) props[line.substring(0, eq).trim()] = line.substring(eq + 1).trim()
    }
    return {
      pan: parseFloat(props['pan'] ?? '0'),
      tilt: parseFloat(props['tilt'] ?? '0'),
      zoom: parseFloat(props['zoom'] ?? '1'),
    }
  }

  async absoluteMove(pan?: number, tilt?: number, zoom?: number): Promise<void> {
    const params: string[] = []
    if (pan !== undefined) params.push(`pan=${pan}`)
    if (tilt !== undefined) params.push(`tilt=${tilt}`)
    if (zoom !== undefined) params.push(`zoom=${zoom}`)
    if (params.length === 0) throw new Error('Specify at least one of pan, tilt, or zoom')
    await this.cgiGet(params.join('&'))
  }

  async relativeMove(rpan?: number, rtilt?: number, rzoom?: number): Promise<void> {
    const params: string[] = []
    if (rpan !== undefined) params.push(`rpan=${rpan}`)
    if (rtilt !== undefined) params.push(`rtilt=${rtilt}`)
    if (rzoom !== undefined) params.push(`rzoom=${rzoom}`)
    if (params.length === 0) throw new Error('Specify at least one of rpan, rtilt, or rzoom')
    await this.cgiGet(params.join('&'))
  }

  async goHome(): Promise<void> {
    await this.cgiGet('move=home')
  }

  async gotoPreset(name: string): Promise<void> {
    await this.cgiGet(`gotoserverpresetname=${encodeURIComponent(name)}`)
  }

  async listPresets(): Promise<PtzPreset[]> {
    const text = await this.cgiGet('query=presetposall')
    // Response format: presetposno1=name1\npresetposno2=name2\n...
    const presets: PtzPreset[] = []
    for (const line of text.split('\n')) {
      const match = line.match(/presetposno(\d+)=(.+)/)
      if (match) {
        presets.push({ name: match[2]!.trim(), position: parseInt(match[1]!) })
      }
    }
    return presets
  }

  async stop(): Promise<void> {
    await this.cgiGet('continuouspantiltmove=0,0&continuouszoommove=0')
  }

  async createPreset(name: string): Promise<boolean> {
    // Find next available preset number
    const presets = await this.listPresets()
    const usedNumbers = presets.map(p => p.position)
    let nextNum = 1
    while (usedNumbers.includes(nextNum)) nextNum++
    const text = await this.cgiGet(`setserverpresetname=${encodeURIComponent(name)}&setserverpresetno=${nextNum}`)
    return !text.toLowerCase().includes('error')
  }

  async removePreset(name: string): Promise<boolean> {
    const text = await this.cgiGet(`removeserverpresetname=${encodeURIComponent(name)}`)
    return !text.toLowerCase().includes('error')
  }

  async listTours(): Promise<{ id: string; name: string; running: boolean }[]> {
    // Guard tours use param.cgi groups
    const url = `${this.baseUrl}/axis-cgi/param.cgi?action=list&group=root.GuardTour`
    const res = await digestFetch(url, 'GET', this.username, this.password)
    if (!res.ok) return []
    const text = await res.text()
    const tours: { id: string; name: string; running: boolean }[] = []
    // Parse GuardTour params — each tour has a CamNbr.TourNbr prefix
    const nameRe = /root\.GuardTour\.G(\d+)\.Tour\.T(\d+)\.Name=(.+)/
    for (const line of text.split('\n')) {
      const m = line.match(nameRe)
      if (m) {
        tours.push({ id: `G${m[1]}T${m[2]}`, name: m[3]!.trim(), running: false })
      }
    }
    return tours
  }

  async startTour(tourId: string): Promise<void> {
    await this.cgiGet(`gotoserverpresetname=${encodeURIComponent(tourId)}&continuouspantiltmove=0,0`)
    // Guard tours are started via the guard tour ID
    // The exact CGI param depends on firmware version
  }

  async stopTour(): Promise<void> {
    await this.cgiGet('stoptour=yes')
  }

  async getCapabilities(): Promise<{
    hasPan: boolean; hasTilt: boolean; hasZoom: boolean;
    isMechanical: boolean; maxPresets: number
  }> {
    // Query Properties.PTZ from param.cgi
    const url = `${this.baseUrl}/axis-cgi/param.cgi?action=list&group=root.Properties.PTZ`
    const res = await digestFetch(url, 'GET', this.username, this.password)
    if (!res.ok) return { hasPan: false, hasTilt: false, hasZoom: false, isMechanical: false, maxPresets: 0 }
    const text = await res.text()
    const has = (key: string) => text.includes(`${key}=yes`)
    const getVal = (key: string) => {
      const m = text.match(new RegExp(`${key}=(\\S+)`))
      return m?.[1] ?? ''
    }
    return {
      hasPan: has('root.Properties.PTZ.PTZ'),
      hasTilt: has('root.Properties.PTZ.PTZ'),
      hasZoom: has('root.Properties.PTZ.PTZ'),
      isMechanical: !has('root.Properties.PTZ.DigitalPTZ'),
      maxPresets: parseInt(getVal('root.Properties.PTZ.NbrOfSerPresets') || '20', 10),
    }
  }
}
