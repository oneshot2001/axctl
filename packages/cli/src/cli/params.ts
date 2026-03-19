import { readFileSync, writeFileSync } from 'fs'
import { program } from './root.js'
import { VapixClient } from 'axctl-core'
import { ParamsClient } from 'axctl-core'
import { credentialStore } from 'axctl-core'
import { formatOutput } from 'axctl-core'
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

// axctl params export <ip> --output <path>
params
  .command('export <ip>')
  .description('export all device parameters to YAML')
  .requiredOption('--output <path>', 'output file path')
  .action(async (ip: string, opts: { output: string }) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const vapix = new VapixClient(ip, cred.username, cred.password)
      const info = await vapix.getDeviceInfo()
      const client = new ParamsClient(ip, cred.username, cred.password)
      const exported = await client.exportAll({
        model: info.Model ?? 'unknown',
        firmware: info.Version ?? 'unknown',
        serial: info.ProdSerialNumber ?? 'unknown',
        ip,
      })
      writeFileSync(opts.output, stringifyYaml(exported, { lineWidth: 120 }))
      console.error(`Exported ${Object.keys(exported.params).length} params to ${opts.output}`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl params diff <ip> --file <path>
params
  .command('diff <ip>')
  .description('compare device parameters against a baseline export')
  .requiredOption('--file <path>', 'baseline YAML file to diff against')
  .action(async (ip: string, opts: { file: string }) => {
    const fmt = program.opts().format as string
    try {
      const client = getClient(ip)
      const baselineYaml = readFileSync(opts.file, 'utf-8')
      const baseline = parseYaml(baselineYaml) as any
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
