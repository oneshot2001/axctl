import { writeFileSync } from 'fs'
import { program } from './root.js'
import { StreamClient } from 'axctl-core'
import { credentialStore } from 'axctl-core'
import { formatOutput } from 'axctl-core'

const stream = program
  .command('stream')
  .description('video stream profiles, Zipstream, and snapshots')

// axctl stream profiles <ip>
stream
  .command('profiles <ip>')
  .description('list configured stream profiles')
  .action(async (ip: string) => {
    const fmt = program.opts().format as string
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const client = new StreamClient(ip, cred.username, cred.password)
      const profiles = await client.listProfiles()
      const rows = profiles.map((p) => ({ name: p.name, description: p.description }))
      console.log(formatOutput(rows, fmt))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl stream create <ip> --name <n>
stream
  .command('create <ip>')
  .description('create a new stream profile')
  .requiredOption('--name <n>', 'profile name')
  .option('--codec <codec>', 'video codec (h264|h265|av1|mjpeg)', 'h265')
  .option('--resolution <WxH>', 'resolution', '1920x1080')
  .option('--fps <n>', 'frame rate', '15')
  .option('--gop <n>', 'GOP length')
  .action(async (ip: string, opts: { name: string; codec: string; resolution: string; fps: string; gop?: string }) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would create profile "${opts.name}": ${opts.codec} ${opts.resolution} @ ${opts.fps}fps`)
      return
    }
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const client = new StreamClient(ip, cred.username, cred.password)
      await client.createProfile({
        name: opts.name,
        codec: opts.codec as import('axctl-core').VideoCodec,
        resolution: opts.resolution,
        fps: parseInt(opts.fps, 10),
        gop: opts.gop ? parseInt(opts.gop, 10) : undefined,
      })
      console.log(`✓ Created stream profile "${opts.name}"`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl stream delete <ip> --name <n>
stream
  .command('delete <ip>')
  .description('delete a stream profile')
  .requiredOption('--name <n>', 'profile name to delete')
  .action(async (ip: string, opts: { name: string }) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would delete profile "${opts.name}"`)
      return
    }
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const client = new StreamClient(ip, cred.username, cred.password)
      await client.deleteProfile(opts.name)
      console.log(`✓ Deleted stream profile "${opts.name}"`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl stream zipstream <ip> [--strength <level>]
stream
  .command('zipstream <ip>')
  .description('view or configure Zipstream settings')
  .option('--strength <level>', 'set Zipstream strength (off|low|medium|high|higher|extreme)')
  .action(async (ip: string, opts: { strength?: string }) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const client = new StreamClient(ip, cred.username, cred.password)
      const fmt = program.opts().format as string

      if (!opts.strength) {
        // Read-only mode
        const config = await client.getZipstreamConfig()
        console.log(formatOutput([{ strength: config.strength }], fmt))
      } else {
        if (program.opts().dryRun) {
          console.log(`[dry-run] Would set Zipstream strength → ${opts.strength}`)
          return
        }
        await client.setZipstreamStrength(opts.strength as import('axctl-core').ZipstreamStrength)
        console.log(`✓ Zipstream strength set to ${opts.strength}`)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })

// axctl stream snapshot <ip>
stream
  .command('snapshot <ip>')
  .description('capture a JPEG still image')
  .option('--output <path>', 'save to file (default: stdout as binary)')
  .option('--resolution <WxH>', 'override resolution')
  .option('--compression <0-100>', 'JPEG compression level')
  .action(async (ip: string, opts: { output?: string; resolution?: string; compression?: string }) => {
    const cred = credentialStore.get(ip)
    if (!cred) { console.error(`No credentials for ${ip}. Run: axctl auth add ${ip}`); process.exit(1) }
    try {
      const client = new StreamClient(ip, cred.username, cred.password)
      const jpeg = await client.captureSnapshot({
        resolution: opts.resolution,
        compression: opts.compression ? parseInt(opts.compression, 10) : undefined,
      })
      if (opts.output) {
        writeFileSync(opts.output, jpeg)
        console.error(`Saved ${jpeg.length} bytes to ${opts.output}`)
      } else {
        process.stdout.write(jpeg)
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  })
