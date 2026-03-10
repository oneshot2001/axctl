import { program } from './root.js'

// TODO: implement analytics command
export const analyticsCommand = program
  .command('analytics')
  .description('analytics — not yet implemented')
  .action(() => {
    console.log('analytics: coming soon')
  })
