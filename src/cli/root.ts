import { Command } from 'commander'

export const program = new Command()

program
  .name('axctl')
  .description('Axis camera analytics CLI — configure AOA, stream events, discover devices')
  .version('0.1.0')
  .option('-f, --format <format>', 'output format (table|json|jsonl|csv|yaml)', 'table')
  .option('-v, --verbose', 'verbose output')
  .option('--debug', 'debug logging (show raw requests/responses)')
  .option('--dry-run', 'preview changes without applying them')
