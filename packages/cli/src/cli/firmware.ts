import { existsSync } from 'fs'
import { createInterface } from 'readline'
import { program } from './root.js'
import { FirmwareClient } from 'axctl-core'
import { credentialStore } from 'axctl-core'
import { formatOutput } from 'axctl-core'
import { fleetExec } from 'axctl-core'
import { FleetRunner, summarizeFleetResults } from 'axctl-core'

const firmware = program
  .command('firmware')
  .description('firmware management')

// axctl firmware status <ip>
firmware
  .command('status <ip>')
  .description('show firmware version, model, and build date')
  .action(async (ip: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    const fmt = program.opts().format as string

    try {
      const client = new FirmwareClient(ip, cred.username, cred.password)
      const status = await client.getStatus()
      const row = {
        ip,
        model: status.modelName,
        firmware: status.firmwareVersion,
        buildDate: status.buildDate,
        serial: status.serialNumber,
      }
      console.log(formatOutput(row, fmt))
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  })

// axctl firmware upgrade <ip> --file <path>
firmware
  .command('upgrade <ip>')
  .description('upload firmware file to a camera')
  .requiredOption('--file <path>', 'path to firmware .bin file')
  .option('-y, --yes', 'skip confirmation prompt')
  .action(async (ip: string, opts: { file: string; yes?: boolean }) => {
    const cred = credentialStore.get(ip)
    if (!cred) {
      console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`)
      process.exit(1)
    }

    if (!existsSync(opts.file)) {
      console.error(`File not found: ${opts.file}`)
      process.exit(1)
    }

    const fileSize = FirmwareClient.fileSize(opts.file)
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1)
    const filename = opts.file.split('/').pop() ?? opts.file

    if (program.opts().dryRun) {
      console.log(`[dry-run] Would upload ${filename} (${sizeMB} MB) to ${ip}`)
      return
    }

    // Confirmation prompt unless --yes
    if (!opts.yes) {
      process.stderr.write(`\nFirmware upgrade:\n`)
      process.stderr.write(`  Target:   ${ip}\n`)
      process.stderr.write(`  File:     ${filename}\n`)
      process.stderr.write(`  Size:     ${sizeMB} MB\n`)
      process.stderr.write(`\n⚠ The camera will reboot after upgrade.\n`)

      const confirmed = await promptConfirm('Proceed? (y/N) ')
      if (!confirmed) {
        console.log('Aborted.')
        return
      }
    }

    try {
      const client = new FirmwareClient(ip, cred.username, cred.password)
      process.stderr.write(`Uploading ${filename} to ${ip}...\n`)
      const result = await client.upgrade(opts.file)
      console.log(`✓ Firmware upgrade initiated on ${ip}`)
      if (result) console.log(`  Response: ${result}`)
      console.log(`  The camera will reboot to apply the update.`)
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`)
      process.exit(1)
    }
  })

// axctl firmware check <fleet-name>
firmware
  .command('check <name>')
  .description('fleet-wide firmware audit — show version per camera')
  .option('--min-firmware <version>', 'flag cameras below this firmware version')
  .action(async (name: string, opts: { minFirmware?: string }) => {
    const fmt = program.opts().format as string

    const results = await fleetExec(name, async (ip, user, pass) => {
      const client = new FirmwareClient(ip, user, pass)
      return client.getStatus()
    })

    const rows = results.map((r) => {
      if (r.error) {
        return { ip: r.ip, model: 'error', firmware: '-', buildDate: '-', flags: r.error }
      }

      const d = r.result!
      const flags: string[] = []

      // Check firmware version against minimum
      if (opts.minFirmware && d.firmwareVersion !== 'unknown') {
        const minParts = opts.minFirmware.split('.').map(Number)
        const fwParts = d.firmwareVersion.split('.').map(Number)
        let below = false
        for (let i = 0; i < Math.max(minParts.length, fwParts.length); i++) {
          const a = fwParts[i] ?? 0
          const b = minParts[i] ?? 0
          if (a < b) { below = true; break }
          if (a > b) break
        }
        if (below) flags.push(`fw < ${opts.minFirmware}`)
      }

      return {
        ip: r.ip,
        model: d.modelName,
        firmware: d.firmwareVersion,
        buildDate: d.buildDate,
        flags: flags.join(', ') || '-',
      }
    })

    console.log(formatOutput(rows, fmt))

    // Summary line for table format
    if (fmt === 'table') {
      const total = rows.length
      const errors = rows.filter((r) => r.model === 'error').length
      const flagged = rows.filter((r) => r.flags !== '-' && r.model !== 'error').length
      process.stderr.write(`\n${total} camera${total === 1 ? '' : 's'} checked`)
      if (flagged > 0) process.stderr.write(` — ${flagged} flagged`)
      if (errors > 0) process.stderr.write(` — ${errors} error${errors === 1 ? '' : 's'}`)
      process.stderr.write('\n')
    }
  })

// axctl firmware upgrade-fleet <fleet> --file <path>
firmware
  .command('upgrade-fleet <fleet>')
  .description('rolling firmware upgrade across a fleet')
  .requiredOption('--file <path>', 'path to firmware .bin file')
  .option('--batch-size <n>', 'devices per batch', '3')
  .option('--health-timeout <seconds>', 'max wait for device reboot', '300')
  .option('-y, --yes', 'skip confirmation prompt')
  .action(async (fleetName: string, opts: { file: string; batchSize: string; healthTimeout: string; yes?: boolean }) => {
    if (!existsSync(opts.file)) {
      console.error(`File not found: ${opts.file}`)
      process.exit(1)
    }

    const fileSize = FirmwareClient.fileSize(opts.file)
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1)
    const filename = opts.file.split('/').pop() ?? opts.file
    const batchSize = parseInt(opts.batchSize, 10)
    const healthTimeout = parseInt(opts.healthTimeout, 10) * 1000
    const fmt = program.opts().format as string

    const runner = new FleetRunner({ fleet: fleetName, verbose: true })
    const devices = runner.resolveDevices()

    if (program.opts().dryRun) {
      console.log(`[dry-run] Would upgrade ${devices.length} devices in fleet "${fleetName}"`)
      console.log(`  File:       ${filename} (${sizeMB} MB)`)
      console.log(`  Strategy:   rolling (batch size ${batchSize})`)
      console.log(`  Devices:    ${devices.join(', ')}`)
      return
    }

    if (!opts.yes) {
      process.stderr.write(`\nFleet firmware upgrade:\n`)
      process.stderr.write(`  Fleet:      ${fleetName} (${devices.length} devices)\n`)
      process.stderr.write(`  File:       ${filename} (${sizeMB} MB)\n`)
      process.stderr.write(`  Strategy:   rolling (batch size ${batchSize})\n`)
      process.stderr.write(`  Health:     wait up to ${opts.healthTimeout}s per batch\n`)
      process.stderr.write(`\n⚠ Devices will reboot during upgrade.\n`)
      const confirmed = await promptConfirm('Proceed? (y/N) ')
      if (!confirmed) { console.log('Aborted.'); return }
    }

    try {
      const results = await runner.runBatched(
        async (_client, ip) => {
          const cred = credentialStore.get(ip)
          if (!cred) throw new Error(`No credentials — run: axctl auth add ${ip}`)
          const fw = new FirmwareClient(ip, cred.username, cred.password)
          const before = await fw.getStatus()
          await fw.upgrade(opts.file)
          process.stderr.write(`  ⏳ ${ip}: uploaded, waiting for reboot...\n`)
          const ready = await fw.waitForReady(healthTimeout)
          if (!ready) throw new Error('Device did not come back online')
          const after = await fw.getStatus()
          return { before: before.firmwareVersion, after: after.firmwareVersion }
        },
        batchSize,
        async (batchIndex, batchResults) => {
          const failed = batchResults.filter(r => !r.success)
          if (failed.length > 0) {
            process.stderr.write(`\n⚠ Batch ${batchIndex + 1} had ${failed.length} failure(s)\n`)
            for (const f of failed) process.stderr.write(`  ✗ ${f.ip}: ${f.error}\n`)
            return false // Abort remaining batches
          }
          return true // Continue to next batch
        }
      )

      const rows = results.map(r => ({
        ip: r.ip,
        status: r.success ? 'upgraded' : 'failed',
        before: r.data?.before ?? '-',
        after: r.data?.after ?? '-',
        error: r.error ?? '',
        duration: `${Math.round(r.duration / 1000)}s`,
      }))
      console.log(formatOutput(rows, fmt))

      const s = summarizeFleetResults(results)
      process.stderr.write(`\n${s.succeeded}/${s.total} upgraded successfully (${Math.round(s.totalDuration / 1000)}s)\n`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

/** Simple y/N confirmation prompt. */
function promptConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}
