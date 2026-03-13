import { program } from './root.js'
import { configRegistry } from 'axctl-core'
import { formatOutput } from 'axctl-core'

const KNOWN_KEYS: Record<string, string> = {
  'defaultFormat': 'Default output format (table|json|jsonl|csv|yaml)',
  'defaultTimeout': 'Default request timeout in ms (default: 15000)',
  'activeProfile': 'Currently active site profile',
  'color': 'Enable colored output (true|false)',
}

const config = program
  .command('config')
  .description('manage axctl configuration')

config
  .command('get <key>')
  .description('get a config value')
  .action((key: string) => {
    const value = configRegistry.get(key)
    if (value === undefined) {
      console.error(`Config key "${key}" is not set`)
      if (KNOWN_KEYS[key]) console.error(`  Description: ${KNOWN_KEYS[key]}`)
      process.exit(1)
    }
    console.log(value)
  })

config
  .command('set <key> <value>')
  .description('set a config value')
  .action((key: string, value: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would set ${key} = ${value}`)
      return
    }
    configRegistry.set(key, value)
    console.log(`${key} = ${value}`)
  })

config
  .command('unset <key>')
  .description('remove a config value')
  .action((key: string) => {
    if (program.opts().dryRun) {
      console.log(`[dry-run] Would unset ${key}`)
      return
    }
    const deleted = configRegistry.delete(key)
    if (deleted) {
      console.log(`Removed ${key}`)
    } else {
      console.error(`Config key "${key}" was not set`)
      process.exit(1)
    }
  })

config
  .command('list')
  .description('list all config values')
  .action(() => {
    const fmt = program.opts().format as string
    const entries = configRegistry.list()
    if (entries.length === 0) {
      console.log('No config values set. Use `axctl config set <key> <value>` to configure.')
      return
    }
    const rows = entries.map((e) => ({
      key: e.key,
      value: e.value,
      description: KNOWN_KEYS[e.key] ?? '',
    }))
    console.log(formatOutput(rows, fmt))
  })

config
  .command('keys')
  .description('list all known config keys')
  .action(() => {
    const fmt = program.opts().format as string
    const rows = Object.entries(KNOWN_KEYS).map(([key, description]) => {
      const current = configRegistry.get(key)
      return { key, description, current: current ?? '(not set)' }
    })
    console.log(formatOutput(rows, fmt))
  })
