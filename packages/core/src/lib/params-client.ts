import { VapixClient } from './vapix-client.js'

export interface ParamExport {
  axctlVersion: string
  exportedAt: string
  deviceModel: string
  firmwareVersion: string
  serial: string
  ip: string
  params: Record<string, string>
}

export type ParamDiffStatus = 'match' | 'drift' | 'missing_on_device' | 'extra_on_device'

export interface ParamDiff {
  param: string
  baseline: string | undefined
  current: string | undefined
  status: ParamDiffStatus
}

const PARAM_GROUPS = [
  'root.Image', 'root.StreamProfile', 'root.Network', 'root.MQTTClient',
  'root.Properties', 'root.PTZ', 'root.Brand', 'root.Audio', 'root.Recording', 'root.Event',
]

const SENSITIVE_PATTERNS = ['root.Network.Wireless', 'root.HTTPS', 'root.RemoteService']

export class ParamsClient {
  private vapix: VapixClient

  constructor(host: string, username: string, password: string) {
    this.vapix = new VapixClient(host, username, password)
  }

  async get(param: string): Promise<string> {
    const text = await this.vapix.get(
      `/axis-cgi/param.cgi?action=list&group=${encodeURIComponent(param)}`
    ) as string
    const parsed = parseParamResponse(text)
    return parsed[param] ?? Object.values(parsed)[0] ?? ''
  }

  async set(param: string, value: string): Promise<boolean> {
    const text = await this.vapix.get(
      `/axis-cgi/param.cgi?action=update&${encodeURIComponent(param)}=${encodeURIComponent(value)}`
    ) as string
    return typeof text === 'string' && text.includes('OK')
  }

  async list(group: string): Promise<Record<string, string>> {
    const text = await this.vapix.get(
      `/axis-cgi/param.cgi?action=list&group=${encodeURIComponent(group)}`
    ) as string
    return parseParamResponse(text)
  }

  async exportAll(deviceInfo?: { model: string; firmware: string; serial: string; ip: string }): Promise<ParamExport> {
    const params: Record<string, string> = {}
    for (const group of PARAM_GROUPS) {
      try {
        const groupParams = await this.list(group)
        for (const [key, value] of Object.entries(groupParams)) {
          if (SENSITIVE_PATTERNS.some(p => key.startsWith(p))) continue
          params[key] = value
        }
      } catch {
        // Group may not exist on all devices
      }
    }
    return {
      axctlVersion: '1.5',
      exportedAt: new Date().toISOString(),
      deviceModel: deviceInfo?.model ?? 'unknown',
      firmwareVersion: deviceInfo?.firmware ?? 'unknown',
      serial: deviceInfo?.serial ?? 'unknown',
      ip: deviceInfo?.ip ?? 'unknown',
      params,
    }
  }

  async diff(baseline: ParamExport): Promise<ParamDiff[]> {
    const diffs: ParamDiff[] = []
    const groups = new Set<string>()
    for (const key of Object.keys(baseline.params)) {
      const parts = key.split('.')
      if (parts.length >= 2) groups.add(parts.slice(0, 2).join('.'))
    }

    const currentParams: Record<string, string> = {}
    for (const group of groups) {
      try {
        Object.assign(currentParams, await this.list(group))
      } catch { /* skip unavailable groups */ }
    }

    for (const [param, baselineValue] of Object.entries(baseline.params)) {
      const currentValue = currentParams[param]
      if (currentValue === undefined) {
        diffs.push({ param, baseline: baselineValue, current: undefined, status: 'missing_on_device' })
      } else if (currentValue !== baselineValue) {
        diffs.push({ param, baseline: baselineValue, current: currentValue, status: 'drift' })
      }
    }

    for (const [param, currentValue] of Object.entries(currentParams)) {
      if (!(param in baseline.params)) {
        diffs.push({ param, baseline: undefined, current: currentValue, status: 'extra_on_device' })
      }
    }

    return diffs
  }

  async search(group: string, query: string): Promise<Record<string, string>> {
    const all = await this.list(group)
    const matches: Record<string, string> = {}
    const lowerQuery = query.toLowerCase()
    for (const [key, value] of Object.entries(all)) {
      if (key.toLowerCase().includes(lowerQuery) || value.toLowerCase().includes(lowerQuery)) {
        matches[key] = value
      }
    }
    return matches
  }
}

export function parseParamResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (typeof text !== 'string') return result
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      result[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
    }
  }
  return result
}
