import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { program } from './root.js'
import { VapixClient } from 'axctl-core'
import { ParamsClient } from 'axctl-core'
import { credentialStore } from 'axctl-core'
import { formatOutput } from 'axctl-core'
import { FleetRunner, summarizeFleetResults } from 'axctl-core'
import yaml from 'js-yaml'
const { load: parseYaml, dump: stringifyYaml } = yaml

function getClient(ip: string): ParamsClient {
  const cred = credentialStore.get(ip)
  if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
  return new ParamsClient(ip, cred.username, cred.password)
}

const params = program
  .command('params')
  .description('read, write, export, and diff device parameters')

// axctl params get <ip> --param <key>
params
  .command('get <ip>')
  .description('get a single parameter value')
  .requiredOption('--param <key>', 'full parameter path')
  .action(async (ip: string, opts: { param: string }) => {
    try {
      const client = getClient(ip)
      const value = await client.get(opts.param)
      console.log(`${opts.param}=${value}`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl params set <ip> --param <key> --value <v>
params
  .command('set <ip>')
  .description('set a single parameter value')
  .requiredOption('--param <key>', 'full parameter path')
  .requiredOption('--value <v>', 'new value')
  .action(async (ip: string, opts: { param: string; value: string }) => {
    try {
      const client = getClient(ip)

      if (program.opts().dryRun) {
        const current = await client.get(opts.param)
        console.log(`[dry-run] ${opts.param}: ${current} → ${opts.value}`)
        return
      }

      const success = await client.set(opts.param, opts.value)
      if (success) {
        console.log(`✓ ${opts.param}=${opts.value}`)
      } else {
        console.error(`✗ Failed to set ${opts.param}`)
        process.exit(1)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl params list <ip> --group <group>
params
  .command('list <ip>')
  .description('list all parameters in a group')
  .requiredOption('--group <group>', 'parameter group (e.g., root.Image)')
  .action(async (ip: string, opts: { group: string }) => {
    const fmt = program.opts().format as string
    try {
      const client = getClient(ip)
      const result = await client.list(opts.group)
      const rows = Object.entries(result).map(([k, v]) => ({ param: k, value: v }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl params export [ip] --output <path> [--fleet <name>]
params
  .command('export [ip]')
  .description('export all device parameters to YAML')
  .requiredOption('--output <path>', 'output file path (or directory for fleet)')
  .option('--fleet <name>', 'target fleet (exports one file per device)')
  .action(async (ip: string | undefined, opts: { output: string; fleet?: string }) => {
    if (!ip && !opts.fleet) { console.error('Specify device IP or --fleet <name>'); process.exit(1) }

    try {
      if (opts.fleet) {
        // Fleet export: one YAML per device in output directory
        if (!existsSync(opts.output)) mkdirSync(opts.output, { recursive: true })

        const runner = new FleetRunner({ fleet: opts.fleet, verbose: true })
        const results = await runner.run(async (client, deviceIp) => {
          const info = await client.getDeviceInfo()
          const cred = credentialStore.get(deviceIp)
          if (!cred) throw new Error('No credentials')
          const pc = new ParamsClient(deviceIp, cred.username, cred.password)
          const exported = await pc.exportAll({
            model: (info as any).ProdFullName ?? 'unknown',
            firmware: (info as any).Version ?? 'unknown',
            serial: (info as any).SerialNumber ?? (info as any).ProdSerialNumber ?? 'unknown',
            ip: deviceIp,
          })
          const serial = (info as any).SerialNumber ?? (info as any).ProdSerialNumber ?? deviceIp.replace(/\./g, '-')
          const filePath = `${opts.output}/${serial}-params.yaml`
          writeFileSync(filePath, stringifyYaml(exported, { lineWidth: 120 }))
          return { file: filePath, paramCount: Object.keys(exported.params).length }
        })

        const s = summarizeFleetResults(results)
        for (const r of results) {
          if (r.success) console.log(`✓ ${r.ip}: ${r.data!.paramCount} params → ${r.data!.file}`)
          else console.error(`✗ ${r.ip}: ${r.error}`)
        }
        process.stderr.write(`\n${s.succeeded}/${s.total} exported\n`)
      } else {
        // Single device export
        const cred = credentialStore.get(ip!)
        if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
        const vapix = new VapixClient(ip!, cred.username, cred.password)
        const info = await vapix.getDeviceInfo()
        const client = new ParamsClient(ip!, cred.username, cred.password)
        const exported = await client.exportAll({
          model: info.Model ?? 'unknown',
          firmware: info.Version ?? 'unknown',
          serial: info.ProdSerialNumber ?? 'unknown',
          ip: ip!,
        })
        writeFileSync(opts.output, stringifyYaml(exported, { lineWidth: 120 }))
        console.error(`Exported ${Object.keys(exported.params).length} params to ${opts.output}`)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl params diff [ip] --file <path> [--fleet <name>]
params
  .command('diff [ip]')
  .description('compare device parameters against a baseline export')
  .requiredOption('--file <path>', 'baseline YAML file to diff against')
  .option('--fleet <name>', 'target fleet for fleet-wide drift report')
  .action(async (ip: string | undefined, opts: { file: string; fleet?: string }) => {
    if (!ip && !opts.fleet) { console.error('Specify device IP or --fleet <name>'); process.exit(1) }
    const fmt = program.opts().format as string

    try {
      const baselineYaml = readFileSync(opts.file, 'utf-8')
      const baseline = parseYaml(baselineYaml) as any

      if (opts.fleet) {
        // Fleet-wide diff
        const runner = new FleetRunner({ fleet: opts.fleet, verbose: true })
        const results = await runner.run(async (_client, deviceIp) => {
          const cred = credentialStore.get(deviceIp)
          if (!cred) throw new Error('No credentials')
          const pc = new ParamsClient(deviceIp, cred.username, cred.password)
          const diffs = await pc.diff(baseline)
          const driftCount = diffs.filter(d => d.status === 'drift').length
          const missingCount = diffs.filter(d => d.status === 'missing_on_device').length
          return { totalParams: Object.keys(baseline.params).length, drifted: driftCount, missing: missingCount }
        })

        // Summary table
        const rows = results.map(r => {
          if (!r.success) return { device: r.ip, status: 'error', totalParams: '-', matching: '-', drifted: '-', error: r.error ?? '' }
          const d = r.data!
          const matching = d.totalParams - d.drifted - d.missing
          return {
            device: r.ip,
            status: d.drifted === 0 && d.missing === 0 ? '✓ match' : '⚠ drift',
            totalParams: String(d.totalParams),
            matching: String(matching),
            drifted: String(d.drifted),
          }
        })
        console.log(formatOutput(rows, fmt))

        const s = summarizeFleetResults(results)
        const driftDevices = results.filter(r => r.success && (r.data!.drifted > 0 || r.data!.missing > 0)).length
        process.stderr.write(`\n${s.total} device${s.total === 1 ? '' : 's'} checked — ${driftDevices} with drift, ${s.failed} errors\n`)
      } else {
        // Single device diff
        const client = getClient(ip!)
        const diffs = await client.diff(baseline)
        if (diffs.length === 0) {
          console.log('✓ No drift detected — device matches baseline')
        } else {
          const rows = diffs.map((d) => ({
            param: d.param,
            baseline: d.baseline ?? '(none)',
            current: d.current ?? '(none)',
            status: d.status,
          }))
          console.log(formatOutput(rows, fmt))
        }
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl params search <ip> --query <text>
params
  .command('search <ip>')
  .description('search parameters by name or value substring')
  .requiredOption('--query <text>', 'search string')
  .option('--group <group>', 'limit search to parameter group', 'root')
  .action(async (ip: string, opts: { query: string; group: string }) => {
    const fmt = program.opts().format as string
    try {
      const client = getClient(ip)
      const matches = await client.search(opts.group, opts.query)
      const rows = Object.entries(matches).map(([k, v]) => ({ param: k, value: v }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })
