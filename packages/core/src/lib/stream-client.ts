import { VapixClient } from './vapix-client.js'

export type VideoCodec = 'h264' | 'h265' | 'av1' | 'mjpeg'
export type ZipstreamStrength = 'off' | 'low' | 'medium' | 'high' | 'higher' | 'extreme'

export interface StreamProfile {
  name: string
  description: string
  params: Record<string, string>
}

export interface StreamProfileConfig {
  name: string
  description?: string
  codec: VideoCodec
  resolution: string
  fps: number
  compression?: number
  gop?: number
}

export interface ZipstreamConfig {
  strength: ZipstreamStrength
  minFps?: number
  maxGop?: number
}

export interface SnapshotOptions {
  resolution?: string
  compression?: number
  camera?: number
}

export class StreamClient {
  private vapix: VapixClient

  constructor(host: string, username: string, password: string) {
    this.vapix = new VapixClient(host, username, password)
  }

  async listProfiles(): Promise<StreamProfile[]> {
    const res = await this.vapix.postJson('/axis-cgi/streamprofile.cgi', {
      method: 'list',
      apiVersion: '1.0',
    }) as { data?: { streamProfile?: StreamProfile[] } }
    return res?.data?.streamProfile ?? []
  }

  async createProfile(config: StreamProfileConfig): Promise<boolean> {
    const params: Record<string, string> = {
      videoCoding: config.codec,
      resolution: config.resolution,
      fps: String(config.fps),
    }
    if (config.compression !== undefined) params['compression'] = String(config.compression)
    if (config.gop !== undefined) params['govLength'] = String(config.gop)

    const res = await this.vapix.postJson('/axis-cgi/streamprofile.cgi', {
      method: 'create',
      apiVersion: '1.0',
      params: {
        streamProfile: [{
          name: config.name,
          description: config.description ?? '',
          parameters: params,
        }],
      },
    }) as { error?: { message: string } }
    if (res?.error) throw new Error(`Create profile failed: ${res.error.message}`)
    return true
  }

  async deleteProfile(name: string): Promise<boolean> {
    const res = await this.vapix.postJson('/axis-cgi/streamprofile.cgi', {
      method: 'remove',
      apiVersion: '1.0',
      params: { streamProfile: [name] },
    }) as { error?: { message: string } }
    if (res?.error) throw new Error(`Delete profile failed: ${res.error.message}`)
    return true
  }

  async getZipstreamConfig(): Promise<ZipstreamConfig> {
    const text = await this.vapix.get(
      '/axis-cgi/param.cgi?action=list&group=root.ImageSource.I0.Sensor.Zipstream'
    ) as string
    const params: Record<string, string> = {}
    if (typeof text === 'string') {
      for (const line of text.split('\n')) {
        const eq = line.indexOf('=')
        if (eq > 0) params[line.substring(0, eq).trim()] = line.substring(eq + 1).trim()
      }
    }
    // Find the strength value from available keys
    const strengthKey = Object.keys(params).find(k => k.toLowerCase().includes('strength'))
    const strength = (strengthKey ? params[strengthKey] : 'off') as ZipstreamStrength
    return { strength }
  }

  async setZipstreamStrength(strength: ZipstreamStrength): Promise<boolean> {
    const text = await this.vapix.get(
      `/axis-cgi/param.cgi?action=update&root.ImageSource.I0.Sensor.ZipStrength=${strength}`
    ) as string
    return typeof text === 'string' && text.includes('OK')
  }

  async captureSnapshot(opts?: SnapshotOptions): Promise<Buffer> {
    const params = new URLSearchParams()
    if (opts?.resolution) params.set('resolution', opts.resolution)
    if (opts?.compression !== undefined) params.set('compression', String(opts.compression))
    if (opts?.camera !== undefined) params.set('camera', String(opts.camera))
    const qs = params.toString()
    const path = `/axis-cgi/jpg/image.cgi${qs ? '?' + qs : ''}`
    return this.vapix.getBuffer(path)
  }
}
