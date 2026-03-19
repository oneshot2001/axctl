import { buildDigestHeader } from './digest-auth.js'

// VAPIX application management — list, start, stop ACAP apps

export interface AcapApp {
  name: string
  niceName: string
  version: string
  status: 'Running' | 'Stopped' | 'Crashed'
  license: string
  configPage?: string
}

function parseAppList(xml: string): AcapApp[] {
  const apps: AcapApp[] = []
  const re = /<application\s([^>]+)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const attr = (key: string) => m![1]?.match(new RegExp(`${key}="([^"]+)"`))?.[1] ?? ''
    apps.push({
      name: attr('Name'),
      niceName: attr('NiceName'),
      version: attr('Version'),
      status: (attr('Status') as AcapApp['status']) || 'Stopped',
      license: attr('License'),
      configPage: attr('ConfigurationPage') || undefined,
    })
  }
  return apps
}

async function formFetch(
  host: string, path: string, username: string, password: string, body: string
): Promise<Response> {
  const url = `http://${host}${path}`
  const probe = await fetch(url, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  if (probe.status !== 401) return probe

  const wwwAuth = probe.headers.get('www-authenticate') ?? ''
  const fields: Record<string, string> = {}
  const re = /(\w+)="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(wwwAuth)) !== null) fields[m[1]!] = m[2]!
  const challenge = { realm: fields.realm ?? '', nonce: fields.nonce ?? '', algorithm: 'MD5', qop: fields.qop, opaque: fields.opaque }
  const authHeader = buildDigestHeader('POST', path, username, password, challenge)

  return fetch(url, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: authHeader }
  })
}

import { digestFetch } from './digest-auth.js'

export const appsClient = {
  async list(host: string, username: string, password: string): Promise<AcapApp[]> {
    const r = await digestFetch(`http://${host}/axis-cgi/applications/list.cgi`, 'GET', username, password)
    if (!r.ok) throw new Error(`Apps list failed: ${r.status}`)
    return parseAppList(await r.text())
  },

  async start(host: string, username: string, password: string, packageName: string): Promise<void> {
    // Fire and forget — camera resets the connection on app start
    const r = await formFetch(host, '/axis-cgi/applications/control.cgi', username, password,
      `action=start&package=${encodeURIComponent(packageName)}`)
    // 200 = accepted, connection reset is normal
    if (r.status !== 200) throw new Error(`Start failed: ${r.status}`)
  },

  async stop(host: string, username: string, password: string, packageName: string): Promise<void> {
    const r = await formFetch(host, '/axis-cgi/applications/control.cgi', username, password,
      `action=stop&package=${encodeURIComponent(packageName)}`)
    if (r.status !== 200) throw new Error(`Stop failed: ${r.status}`)
  },

  async install(host: string, username: string, password: string, eapData: Buffer, filename: string): Promise<string> {
    const { VapixClient } = await import('./vapix-client.js')
    const vapix = new VapixClient(host, username, password)
    return vapix.postMultipart('/axis-cgi/applications/upload.cgi', 'packfil', eapData, filename)
  },

  async remove(host: string, username: string, password: string, packageName: string): Promise<void> {
    const r = await formFetch(host, '/axis-cgi/applications/control.cgi', username, password,
      `action=remove&package=${encodeURIComponent(packageName)}`)
    if (r.status !== 200) throw new Error(`Remove failed: ${r.status}`)
  },

  async restart(host: string, username: string, password: string, packageName: string): Promise<void> {
    const r = await formFetch(host, '/axis-cgi/applications/control.cgi', username, password,
      `action=restart&package=${encodeURIComponent(packageName)}`)
    if (r.status !== 200) throw new Error(`Restart failed: ${r.status}`)
  },

  async getConfig(host: string, username: string, password: string, packageName: string): Promise<Record<string, string>> {
    const r = await formFetch(host, '/axis-cgi/applications/config.cgi', username, password,
      `action=list&package=${encodeURIComponent(packageName)}`)
    if (!r.ok) throw new Error(`Config list failed: ${r.status}`)
    const text = await r.text()
    const config: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) config[line.substring(0, eq).trim()] = line.substring(eq + 1).trim()
    }
    return config
  },

  async setConfig(host: string, username: string, password: string, packageName: string, params: Record<string, string>): Promise<void> {
    const paramStr = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    const r = await formFetch(host, '/axis-cgi/applications/config.cgi', username, password,
      `action=set&package=${encodeURIComponent(packageName)}&${paramStr}`)
    if (!r.ok) throw new Error(`Config set failed: ${r.status}`)
  },
}
