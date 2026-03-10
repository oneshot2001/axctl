import { program } from './root.js'
import { credentialStore } from '../lib/credential-store.js'
import { fleetStore } from '../lib/fleet-store.js'
import { discoverAll } from '../lib/discovery.js'
import { formatOutput } from '../formatters/index.js'
import { fleetExec } from '../lib/fleet-ops.js'
import { VapixClient } from '../lib/vapix-client.js'
import { AoaClient } from '../lib/aoa-client.js'

const fleet = program
  .command('fleet')
  .description('manage named groups of cameras')

// ---- CRUD ------------------------------------------------------------------

fleet
  .command('create <name>')
  .description('create a fleet from a device list or discovery')
  .option('-d, --devices <ips>', 'comma-separated IPs (e.g. 192.168.1.33,192.168.1.34)')
  .option('--from-discover', 'populate from live discovery scan (5s scan)')
  .action(async (name: string, opts: { devices?: string; fromDiscover?: boolean }) => {
    let ips: string[] = []

    if (opts.devices) {
      ips = opts.devices.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (opts.fromDiscover) {
      process.stderr.write('Scanning for devices (5s)...\n')
      const found = await discoverAll(5000)
      ips = found.map((d) => d.ip)
      if (ips.length === 0) { console.error('No devices found.'); process.exit(1) }
      console.log(`Found: ${ips.join(', ')}`)
    } else {
      console.error('Specify --devices <ips> or --from-discover')
      process.exit(1)
    }

    fleetStore.create(name, ips)
    console.log(`✓ Fleet "${name}" created with ${ips.length} device${ips.length === 1 ? '' : 's'}: ${ips.join(', ')}`)
  })

fleet
  .command('list')
  .description('list all fleets')
  .action(() => {
    const fmt = program.opts().format as string
    const fleets = fleetStore.list()
    if (fleets.length === 0) { console.log('No fleets. Use: axctl fleet create <name> --devices <ips>'); return }
    const rows = fleets.map((f) => ({ name: f.name, devices: f.ips.length, ips: f.ips.join(', ') }))
    console.log(formatOutput(rows, fmt))
  })

fleet
  .command('show <name>')
  .description('show fleet members')
  .action((name: string) => {
    const fmt = program.opts().format as string
    const f = fleetStore.get(name)
    if (!f) { console.error(`Fleet "${name}" not found`); process.exit(1) }
    const rows = f.ips.map((ip) => ({
      ip,
      credentials: credentialStore.has(ip) ? 'stored' : 'none — run: axctl auth add ' + ip,
    }))
    if (fmt === 'table') console.log(`Fleet: ${f.name} (${f.ips.length} devices)`)
    console.log(formatOutput(rows, fmt))
  })

fleet
  .command('delete <name>')
  .description('remove a fleet')
  .action((name: string) => {
    if (fleetStore.remove(name)) {
      console.log(`✓ Fleet "${name}" deleted`)
    } else {
      console.error(`Fleet "${name}" not found`)
      process.exit(1)
    }
  })

// ---- PARALLEL OPS ----------------------------------------------------------

fleet
  .command('ping <name>')
  .description('check reachability of all cameras in a fleet')
  .action(async (name: string) => {
    const fmt = program.opts().format as string
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new VapixClient(ip, user, pass)
      const start = Date.now()
      const online = await client.ping()
      return { online, ms: Date.now() - start }
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, status: 'error', ms: '-', detail: r.error }
      const d = r.result!
      return { ip: r.ip, status: d.online ? 'online' : 'offline', ms: d.online ? d.ms : '-', detail: '' }
    })
    console.log(formatOutput(rows, fmt))
  })

fleet
  .command('status <name>')
  .description('get model/firmware/serial for all cameras in a fleet')
  .action(async (name: string) => {
    const fmt = program.opts().format as string
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new VapixClient(ip, user, pass)
      return client.getDeviceInfo()
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, model: 'error', firmware: '-', serial: '-', detail: r.error }
      const d = r.result!
      return { ip: r.ip, model: d.ProdShortName ?? d.Model ?? '?', firmware: d.Version ?? '?', serial: d.ProdSerialNumber ?? '?', detail: '' }
    })
    console.log(formatOutput(rows, fmt))
  })

// ---- FLEET AOA SUBGROUP ----------------------------------------------------

const fleetAoa = fleet
  .command('aoa')
  .description('run AOA operations across an entire fleet')

fleetAoa
  .command('list <name>')
  .description('list AOA scenarios across all cameras in a fleet')
  .action(async (name: string) => {
    const fmt = program.opts().format as string
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AoaClient(ip, user, pass)
      return client.getScenarios()
    })

    const rows: Record<string, unknown>[] = []
    for (const r of results) {
      if (r.error) {
        rows.push({ ip: r.ip, id: '-', name: 'error', type: '-', objects: r.error })
        continue
      }
      if (!r.result || r.result.length === 0) {
        rows.push({ ip: r.ip, id: '-', name: '(no scenarios)', type: '-', objects: '-' })
        continue
      }
      for (const s of r.result) {
        rows.push({
          ip: r.ip,
          id: s.id,
          name: s.name,
          type: s.type,
          objects: s.objectClassifications.map((o) => o.type).join(', '),
          trigger: s.triggers[0]?.type ?? '?',
        })
      }
    }
    console.log(formatOutput(rows, fmt))
  })

fleetAoa
  .command('counts <name> <scenarioId>')
  .description('get accumulated crossing counts across all cameras (crosslinecounting scenarios)')
  .action(async (name: string, idStr: string) => {
    const fmt = program.opts().format as string
    const id = parseInt(idStr)
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AoaClient(ip, user, pass)
      return client.getAccumulatedCounts(id)
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, total: 'error', human: '-', vehicle: '-', detail: r.error }
      const d = r.result!
      return {
        ip: r.ip,
        total: d.total ?? 0,
        human: d.totalHuman ?? '-',
        car: d.totalCar ?? '-',
        truck: d.totalTruck ?? '-',
        bus: d.totalBus ?? '-',
        resetTime: d.resetTime ?? '-',
      }
    })
    console.log(formatOutput(rows, fmt))
  })

fleetAoa
  .command('create <name> <scenarioName> <type>')
  .description('create the same scenario on all cameras in a fleet')
  .option('-o, --objects <classes>', 'object classes (human,vehicle)', 'human,vehicle')
  .option('-d, --device <id>', 'analytics device ID', '1')
  .action(async (name: string, scenarioName: string, type: string, opts: { objects: string; device: string }) => {
    const objects = opts.objects.split(',').map((s) => s.trim()).filter(Boolean)
    const deviceId = parseInt(opts.device)
    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new AoaClient(ip, user, pass)
      return client.addScenario(scenarioName, type, deviceId, objects)
    })

    const rows = results.map((r) => {
      if (r.error) return { ip: r.ip, status: 'error', id: '-', detail: r.error }
      return { ip: r.ip, status: '✓ created', id: r.result!.id, detail: '' }
    })
    console.log(formatOutput(rows, 'table'))
  })
