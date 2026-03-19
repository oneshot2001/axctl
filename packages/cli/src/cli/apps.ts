import { readFileSync } from 'fs'
import { program } from './root.js'
import { appsClient } from 'axctl-core'
import { credentialStore } from 'axctl-core'
import { formatOutput } from 'axctl-core'
import { FleetRunner, summarizeFleetResults } from 'axctl-core'

const apps = program
  .command('apps')
  .description('manage ACAP applications on cameras')

// axctl apps list [ip]  |  axctl apps list --fleet <name>
apps
  .command('list [ip]')
  .description('list installed ACAP apps')
  .option('--fleet <name>', 'target fleet instead of single device')
  .action(async (ip: string | undefined, opts: { fleet?: string }) => {
    const fmt = program.opts().format as string

    if (!ip && !opts.fleet) {
      console.error('Specify device IP or --fleet <name>')
      process.exit(1)
    }

    try {
      const runner = new FleetRunner({ device: ip, fleet: opts.fleet, verbose: program.opts().verbose })
      const results = await runner.run(async (_client, deviceIp) => {
        const cred = credentialStore.get(deviceIp)
        if (!cred) throw new Error(`No credentials — run: axctl auth add ${deviceIp}`)
        return appsClient.list(deviceIp, cred.username, cred.password)
      })

      const rows: Record<string, string>[] = []
      for (const r of results) {
        if (!r.success) {
          rows.push({ device: r.ip, name: 'ERROR', niceName: r.error ?? '', version: '', status: '', license: '' })
          continue
        }
        for (const a of r.data!) {
          rows.push({ device: r.ip, name: a.name, niceName: a.niceName, version: a.version, status: a.status, license: a.license })
        }
      }
      console.log(formatOutput(rows, fmt))

      if (opts.fleet && fmt === 'table') {
        const s = summarizeFleetResults(results)
        process.stderr.write(`\n${s.total} device${s.total === 1 ? '' : 's'} queried — ${s.succeeded} ok, ${s.failed} failed (${s.totalDuration}ms)\n`)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl apps install [ip] --file <path>  |  axctl apps install --fleet <name> --file <path>
apps
  .command('install [ip]')
  .description('install an ACAP application (.eap file)')
  .requiredOption('--file <path>', 'path to .eap file')
  .option('--fleet <name>', 'target fleet instead of single device')
  .action(async (ip: string | undefined, opts: { file: string; fleet?: string }) => {
    if (!ip && !opts.fleet) {
      console.error('Specify device IP or --fleet <name>')
      process.exit(1)
    }

    const filename = opts.file.split('/').pop() ?? opts.file
    const eapData = readFileSync(opts.file)
    const sizeMB = (eapData.length / (1024 * 1024)).toFixed(1)

    if (program.opts().dryRun) {
      const arch = filename.includes('aarch64') ? 'aarch64' : filename.includes('armv7hf') ? 'armv7hf' : 'unknown'
      console.log(`[dry-run] Would install ${filename} (${sizeMB} MB, ${arch}) to ${opts.fleet ? `fleet "${opts.fleet}"` : ip}`)
      return
    }

    try {
      const runner = new FleetRunner({ device: ip, fleet: opts.fleet, verbose: true })
      process.stderr.write(`Installing ${filename} (${sizeMB} MB) to ${opts.fleet ? `fleet "${opts.fleet}"` : ip}...\n`)
      const results = await runner.run(async (_client, deviceIp) => {
        const cred = credentialStore.get(deviceIp)
        if (!cred) throw new Error(`No credentials — run: axctl auth add ${deviceIp}`)
        return appsClient.install(deviceIp, cred.username, cred.password, eapData, filename)
      })

      const s = summarizeFleetResults(results)
      console.log(`✓ Installed on ${s.succeeded}/${s.total} device${s.total === 1 ? '' : 's'}`)
      if (s.failed > 0) {
        for (const r of results.filter(r => !r.success)) {
          console.error(`  ✗ ${r.ip}: ${r.error}`)
        }
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl apps remove <ip> <package>
apps
  .command('remove <ip> <package>')
  .description('uninstall an ACAP application')
  .action(async (ip: string, pkg: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }

    if (program.opts().dryRun) {
      console.log(`[dry-run] Would remove ${pkg} from ${ip}`)
      return
    }

    try {
      // Stop first (remove requires app to be stopped), then wait for camera to settle
      try { await appsClient.stop(ip, cred.username, cred.password, pkg) } catch { /* may already be stopped */ }
      await new Promise(r => setTimeout(r, 2000))
      await appsClient.remove(ip, cred.username, cred.password, pkg)
      await new Promise(r => setTimeout(r, 2000))
      console.log(`✓ ${pkg} removed from ${ip}`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl apps restart <ip> <package>
apps
  .command('restart <ip> <package>')
  .description('restart an ACAP application')
  .action(async (ip: string, pkg: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      await appsClient.restart(ip, cred.username, cred.password, pkg)
      console.log(`✓ ${pkg} restarted`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl apps start <ip> <package>
apps
  .command('start <ip> <package>')
  .description('start an ACAP app (e.g. objectanalytics, vmd)')
  .action(async (ip: string, pkg: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      process.stderr.write(`Starting ${pkg} on ${ip}...\n`)
      await appsClient.start(ip, cred.username, cred.password, pkg)
      // Wait for app to come up
      await new Promise((r) => setTimeout(r, 4000))
      const list = await appsClient.list(ip, cred.username, cred.password)
      const app = list.find((a) => a.name === pkg)
      if (app?.status === 'Running') {
        console.log(`✓ ${pkg} is now Running`)
      } else {
        console.log(`Status: ${app?.status ?? 'unknown'} — may need activation in camera web UI`)
        console.log(`  → http://${ip}/local/${pkg}/`)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl apps stop <ip> <package>
apps
  .command('stop <ip> <package>')
  .description('stop an ACAP app')
  .action(async (ip: string, pkg: string) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      await appsClient.stop(ip, cred.username, cred.password, pkg)
      console.log(`✓ ${pkg} stopped`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })
