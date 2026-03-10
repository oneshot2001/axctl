import { program } from './root.js'
import { AoaClient, SCENARIO_TYPES } from '../lib/aoa-client.js'
import { credentialStore } from '../lib/credential-store.js'
import { formatOutput } from '../formatters/index.js'

function getClient(ip: string): AoaClient {
  const cred = credentialStore.get(ip)
  if (!cred) {
    console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
    process.exit(1)
  }
  return new AoaClient(ip, cred.username, cred.password)
}

const aoa = program
  .command('aoa')
  .description('AXIS Object Analytics — read and manage scenarios')

// axctl aoa list <ip>
aoa
  .command('list <ip>')
  .description('list configured analytics scenarios')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const scenarios = await client.getScenarios()
      if (scenarios.length === 0) {
        console.log('No scenarios configured.')
        console.log(`Create one: axctl aoa create ${ip} "Entrance" motion`)
        return
      }
      const rows = scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        objects: s.objectClassifications.map((o) => o.type).join(', '),
        devices: s.devices.map((d) => d.id).join(', '),
        triggers: s.triggers.map((t) => t.type).join(', '),
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl aoa devices <ip>
aoa
  .command('devices <ip>')
  .description('list analytics devices (virtual cameras/channels)')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const client = getClient(ip)
    try {
      const devices = await client.getDevices()
      if (devices.length === 0) { console.log('No analytics devices found.'); return }
      const rows = devices.map((d) => ({
        id: d.id,
        type: d.type,
        active: d.isActive ? 'yes' : 'no',
        rotation: d.rotation,
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl aoa create <ip> <name> <type> [--objects human,vehicle]
aoa
  .command('create <ip> <name> <type>')
  .description(`create a new scenario. Types: ${SCENARIO_TYPES.join(', ')}`)
  .option('-o, --objects <classes>', 'comma-separated object classes (human,vehicle,bicycle...)', 'human,vehicle')
  .option('-d, --device <id>', 'analytics device ID', '1')
  .action(async (ip: string, name: string, type: string, opts: { objects: string; device: string }) => {
    if (!SCENARIO_TYPES.includes(type as typeof SCENARIO_TYPES[number])) {
      console.error(`Unknown type "${type}". Valid: ${SCENARIO_TYPES.join(', ')}`)
      process.exit(1)
    }
    const client = getClient(ip)
    const fmt = program.opts().format as string
    try {
      const objects = opts.objects.split(',').map((s) => s.trim()).filter(Boolean)
      const scenario = await client.addScenario(name, type, parseInt(opts.device), objects)
      console.log(`✓ Scenario created (id=${scenario.id})`)
      const row = {
        id: scenario.id,
        name: scenario.name,
        type: scenario.type,
        objects: objects.join(', '),
        devices: opts.device,
      }
      console.log(formatOutput(row, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl aoa remove <ip> <id>
aoa
  .command('remove <ip> <id>')
  .description('delete a scenario by ID')
  .action(async (ip: string, idStr: string) => {
    const client = getClient(ip)
    try {
      await client.removeScenario(parseInt(idStr))
      console.log(`✓ Scenario ${idStr} removed`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl aoa rename <ip> <id> <new-name>
aoa
  .command('rename <ip> <id> <newName>')
  .description('rename a scenario')
  .action(async (ip: string, idStr: string, newName: string) => {
    const client = getClient(ip)
    try {
      await client.updateScenarioName(parseInt(idStr), newName)
      console.log(`✓ Scenario ${idStr} renamed to "${newName}"`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })
