import { program } from './root.js'
import { ApiDiscoveryClient } from 'axctl-core'
import { credentialStore } from 'axctl-core'
import { formatOutput } from 'axctl-core'
import { fleetExec } from 'axctl-core'

const api = program
  .command('api')
  .description('API Discovery — query supported device APIs')

// axctl api list <ip>
api
  .command('list <ip>')
  .description('list all APIs supported by a device')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const client = new ApiDiscoveryClient(ip, cred.username, cred.password)
      const apis = await client.getApis()
      const rows = apis.map((a: { id: string; version: string; name: string }) => ({ id: a.id, version: a.version, name: a.name }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl api check <ip> --api <id>
api
  .command('check <ip>')
  .description('check if a specific API is available')
  .requiredOption('--api <id>', 'API identifier (e.g., object-analytics)')
  .action(async (ip: string, opts: { api: string }) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const client = new ApiDiscoveryClient(ip, cred.username, cred.password)
      const version = await client.getApiVersion(opts.api)
      if (version) {
        console.log(`✓ ${opts.api} v${version}`)
      } else {
        console.log(`✗ ${opts.api} not supported`)
        process.exit(1)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl api compare <fleet>
api
  .command('compare <fleet>')
  .description('fleet API capability matrix')
  .action(async (fleetName: string) => {
    const fmt = program.opts().format as string

    const results = await fleetExec(fleetName, async (ip, user, pass) => {
      const client = new ApiDiscoveryClient(ip, user, pass)
      const apis = await client.getApis()
      return apis.reduce((acc: Record<string, string>, a: { id: string; version: string }) => ({ ...acc, [a.id]: a.version }), {} as Record<string, string>)
    })

    // Build matrix — collect all API IDs across fleet
    const allApiIds = new Set<string>()
    for (const r of results) {
      if (r.result) Object.keys(r.result).forEach((id) => allApiIds.add(id))
    }

    const rows = results.map((r) => {
      const row: Record<string, string> = { device: r.ip }
      if (r.error) { row.error = r.error; return row }
      for (const id of [...allApiIds].sort()) {
        row[id] = r.result?.[id] ?? '✗'
      }
      return row
    })

    console.log(formatOutput(rows, fmt))

    // Summary line for table format
    if (fmt === 'table') {
      const total = rows.length
      const errors = rows.filter((r) => r.error).length
      process.stderr.write(`\n${total} device${total === 1 ? '' : 's'} queried`)
      if (errors > 0) process.stderr.write(` — ${errors} error${errors === 1 ? '' : 's'}`)
      process.stderr.write(` — ${allApiIds.size} unique API${allApiIds.size === 1 ? '' : 's'} found\n`)
    }
  })
