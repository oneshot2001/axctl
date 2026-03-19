import { fleetStore } from './fleet-store.js'
import { credentialStore } from './credential-store.js'
import { VapixClient } from './vapix-client.js'

export interface FleetRunnerOptions {
  device?: string
  fleet?: string
  concurrency?: number
  continueOnError?: boolean
  verbose?: boolean
}

export interface FleetDeviceResult<T> {
  ip: string
  success: boolean
  data?: T
  error?: string
  duration: number
}

export class FleetRunner {
  private readonly concurrency: number
  private readonly continueOnError: boolean
  private readonly verbose: boolean
  private readonly opts: FleetRunnerOptions

  constructor(opts: FleetRunnerOptions) {
    this.opts = opts
    this.concurrency = opts.concurrency ?? 5
    this.continueOnError = opts.continueOnError ?? true
    this.verbose = opts.verbose ?? false
  }

  /** Resolve target device IPs from --device or --fleet. */
  resolveDevices(): string[] {
    if (this.opts.device) return [this.opts.device]
    if (this.opts.fleet) {
      const fleet = fleetStore.get(this.opts.fleet)
      if (!fleet) throw new Error(`Fleet "${this.opts.fleet}" not found`)
      return fleet.ips
    }
    throw new Error('Specify --device <ip> or --fleet <name>')
  }

  /** Run operation against all devices with concurrency control. */
  async run<T>(
    fn: (client: VapixClient, ip: string) => Promise<T>
  ): Promise<FleetDeviceResult<T>[]> {
    const devices = this.resolveDevices()
    const results: FleetDeviceResult<T>[] = []
    const pending = new Set<Promise<void>>()

    for (const ip of devices) {
      if (pending.size >= this.concurrency) {
        await Promise.race(pending)
      }

      const task = (async () => {
        const start = Date.now()
        try {
          if (this.verbose) process.stderr.write(`  → ${ip}: starting...\n`)

          const cred = credentialStore.get(ip)
          if (!cred) throw new Error(`No credentials — run: axctl auth add ${ip}`)
          const client = new VapixClient(ip, cred.username, cred.password)

          const data = await fn(client, ip)
          const duration = Date.now() - start
          if (this.verbose) process.stderr.write(`  ✓ ${ip}: done (${duration}ms)\n`)
          results.push({ ip, success: true, data, duration })
        } catch (err: unknown) {
          const duration = Date.now() - start
          const error = err instanceof Error ? err.message : String(err)
          if (this.verbose) process.stderr.write(`  ✗ ${ip}: ${error} (${duration}ms)\n`)
          results.push({ ip, success: false, error, duration })
          if (!this.continueOnError) {
            throw new Error(`Fleet operation aborted: ${ip} failed — ${error}`)
          }
        }
      })()

      const tracked = task.then(() => { pending.delete(tracked) })
      pending.add(tracked)
    }

    await Promise.all(pending)
    return results
  }

  /** Run operation in batches with optional callback between batches. */
  async runBatched<T>(
    fn: (client: VapixClient, ip: string) => Promise<T>,
    batchSize: number,
    betweenBatches?: (batchIndex: number, results: FleetDeviceResult<T>[]) => Promise<boolean>
  ): Promise<FleetDeviceResult<T>[]> {
    const devices = this.resolveDevices()
    const allResults: FleetDeviceResult<T>[] = []

    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize)
      const batchIndex = Math.floor(i / batchSize)

      if (this.verbose) {
        const batchNum = batchIndex + 1
        const totalBatches = Math.ceil(devices.length / batchSize)
        process.stderr.write(`\nBatch ${batchNum}/${totalBatches}: ${batch.join(', ')}\n`)
      }

      // Run batch in parallel
      const batchResults: FleetDeviceResult<T>[] = []
      await Promise.all(batch.map(async (ip) => {
        const start = Date.now()
        try {
          const cred = credentialStore.get(ip)
          if (!cred) throw new Error(`No credentials — run: axctl auth add ${ip}`)
          const client = new VapixClient(ip, cred.username, cred.password)
          const data = await fn(client, ip)
          batchResults.push({ ip, success: true, data, duration: Date.now() - start })
        } catch (err: unknown) {
          batchResults.push({
            ip, success: false,
            error: err instanceof Error ? err.message : String(err),
            duration: Date.now() - start,
          })
        }
      }))

      allResults.push(...batchResults)

      // Between-batch callback
      if (betweenBatches && i + batchSize < devices.length) {
        const shouldContinue = await betweenBatches(batchIndex, batchResults)
        if (!shouldContinue) {
          if (this.verbose) process.stderr.write(`\nFleet operation paused after batch ${batchIndex + 1}\n`)
          break
        }
      }
    }

    return allResults
  }
}

export function summarizeFleetResults<T>(results: FleetDeviceResult<T>[]): {
  total: number; succeeded: number; failed: number; totalDuration: number
} {
  return {
    total: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    totalDuration: results.length > 0 ? Math.max(...results.map(r => r.duration)) : 0,
  }
}
