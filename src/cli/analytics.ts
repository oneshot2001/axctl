import { program } from './root.js'
import { AoaClient } from '../lib/aoa-client.js'
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
        console.log('No scenarios configured. Set them up at: http://' + ip + '/local/objectanalytics/')
        return
      }
      const rows = scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        enabled: s.enabled ? 'yes' : 'no',
        devices: s.devices.join(', '),
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
        name: d.name,
        type: d.type,
        channels: (d.channels ?? []).join(', '),
      }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl aoa types <ip>
aoa
  .command('types <ip>')
  .description('show supported scenario types')
  .action(async (ip: string) => {
    const client = getClient(ip)
    try {
      const caps = await client.getCapabilities()
      console.log('Supported scenario types:', caps.scenarios.join(', ') || 'none reported')
      console.log('Object classes:', caps.objects.join(', ') || 'none reported')
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl aoa enable <ip> <id>
aoa
  .command('enable <ip> <id>')
  .description('enable a scenario by ID')
  .action(async (ip: string, idStr: string) => {
    const client = getClient(ip)
    try {
      await client.enableScenario(parseInt(idStr))
      console.log(`✓ Scenario ${idStr} enabled`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl aoa disable <ip> <id>
aoa
  .command('disable <ip> <id>')
  .description('disable a scenario by ID')
  .action(async (ip: string, idStr: string) => {
    const client = getClient(ip)
    try {
      await client.disableScenario(parseInt(idStr))
      console.log(`✓ Scenario ${idStr} disabled`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })
