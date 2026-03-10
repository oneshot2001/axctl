# AOA CLI (axctl) — CLAUDE.md

## Vault Memory
At session start, read these files in order:
1. ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain/02-Projects/aoa-cli/context.md
2. ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain/02-Projects/aoa-cli/decisions.md
3. ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain/02-Projects/aoa-cli/patterns.md
4. ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain/02-Projects/aoa-cli/bugs.md
5. ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain/02-Projects/aoa-cli/architecture.md
6. Last 3 files (by date) in ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain/02-Projects/aoa-cli/dev-log/
7. All files in ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain/05-Knowledge/patterns/

Vault root: ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Second Brain

## Auto-Capture Rules
During this session, track:
1. Every architectural decision (what, alternatives considered, why)
2. Every bug fixed (symptom, root cause, fix, prevention rule)
3. Every reusable pattern discovered (code snippet, when to use, where it applies)
4. Architecture changes (new commands, client changes, data flow changes)

At session end, automatically write:
- Session log to: [vault]/02-Projects/aoa-cli/dev-log/YYYY-MM-DD-session-N.md
- Append new decisions to: [vault]/02-Projects/aoa-cli/decisions.md
- Append new bugs to: [vault]/02-Projects/aoa-cli/bugs.md
- Update if changed: [vault]/02-Projects/aoa-cli/architecture.md

## Session Log Format

```markdown
---
date: YYYY-MM-DD
session: N
project: aoa-cli
tags: [dev-log]
---

# Dev Session — AOA CLI — YYYY-MM-DD #N

## Summary
[1-2 sentence overview of what this session accomplished]

## What Was Built
- [Feature/fix 1]: [brief description]

## Decisions Made
### [Decision Title]
- **Options considered:** [option A], [option B]
- **Chosen:** [option]
- **Reasoning:** [why]
- **Trade-offs:** [what we gave up]

## Bugs Encountered & Fixed
### [Bug Title]
- **Symptom:** [what you saw]
- **Root cause:** [why it happened]
- **Fix:** [what resolved it]
- **Prevention:** [rule to avoid in future]
- **Files changed:** [paths]

## Patterns Discovered
### [Pattern Name]
- **When to use:** [description]
```typescript
[code snippet]
```

## Architecture Changes
- [Change]: [before] -> [after]

## Open Questions
- [ ] [Unresolved question]

## Next Session Should
- [Top priority]
```

## Project Details

### Stack
- Bun + TypeScript (strict)
- Commander.js (CLI framework)
- Native fetch + custom HTTP Digest Auth
- mqtt.js (event streaming)
- bonjour-service + custom SSDP (discovery)
- js-yaml (config)
- cli-table3 (output formatting)

### Build Commands
```bash
# Dev run
bun run src/index.ts

# Build single binary
bun build --compile src/index.ts --outfile axctl

# Test
bun test

# Type check
bunx tsc --noEmit
```

### Deploy
```bash
# macOS ARM64
bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile dist/axctl-macos-arm64

# macOS x86
bun build --compile --target=bun-darwin-x64 src/index.ts --outfile dist/axctl-macos-x64

# Linux ARM64
bun build --compile --target=bun-linux-arm64 src/index.ts --outfile dist/axctl-linux-arm64

# Linux x86
bun build --compile --target=bun-linux-x64 src/index.ts --outfile dist/axctl-linux-x64
```

### Quality Gates
1. Build passes (`bun build --compile src/index.ts --outfile axctl`)
2. Tests pass (`bun test`)
3. Types verified (`bunx tsc --noEmit`)
4. Tested against at least one real Axis camera on local network
5. Git: staged, committed, pushed

### Key Axis References
- VAPIX AOA control: `POST /local/objectanalytics/control.cgi`
- VAPIX device info: `GET /axis-cgi/basicdeviceinfo.cgi`
- Analytics MQTT API (AXIS OS 12.2+): `GET /config/rest/analytics-mqtt/v1beta/data_sources`
- mDNS service type: `_axis-video._tcp`
- SSDP multicast: `239.255.255.250:1900`
