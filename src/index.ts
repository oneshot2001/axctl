#!/usr/bin/env bun
import { program } from './cli/root.js'
import './cli/auth.js'
import './cli/devices.js'
import './cli/discover.js'
import './cli/fleet.js'
import './cli/analytics.js'
import './cli/apps.js'
import './cli/events.js'
import './cli/profile.js'

program.parse(process.argv)
