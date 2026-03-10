# axctl — Install Guide

## Pre-built binaries

Download the binary for your platform from the `dist/` directory and install it to your PATH.

### macOS (Apple Silicon)
```bash
curl -L https://github.com/oneshot2001/aoa-cli/raw/day4-fleet/dist/axctl-macos-arm64.tar.gz | tar -xz
sudo mv axctl-macos-arm64 /usr/local/bin/axctl
```

### macOS (Intel)
```bash
curl -L https://github.com/oneshot2001/aoa-cli/raw/day4-fleet/dist/axctl-macos-x64.tar.gz | tar -xz
sudo mv axctl-macos-x64 /usr/local/bin/axctl
```

### Linux (x64)
```bash
curl -L https://github.com/oneshot2001/aoa-cli/raw/day4-fleet/dist/axctl-linux-x64.tar.gz | tar -xz
sudo mv axctl-linux-x64 /usr/local/bin/axctl
```

### Linux (ARM64 — Raspberry Pi, Jetson, etc.)
```bash
curl -L https://github.com/oneshot2001/aoa-cli/raw/day4-fleet/dist/axctl-linux-arm64.tar.gz | tar -xz
sudo mv axctl-linux-arm64 /usr/local/bin/axctl
```

## Verify install
```bash
axctl --version   # → 0.1.0
axctl --help
```

## Build from source

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
git clone https://github.com/oneshot2001/aoa-cli.git
cd aoa-cli
bun install
bun run build          # → ./axctl (native binary)
bun run build:all      # → dist/ (all platforms)
```

## Quick start

```bash
# Add camera credentials
axctl auth add 192.168.1.33

# Discover cameras on local network
axctl discover

# Create a fleet
axctl fleet create lab --devices 192.168.1.33

# Check fleet status
axctl fleet ping lab
axctl fleet status lab

# List AOA scenarios
axctl aoa list 192.168.1.33

# Stream live events
axctl events stream 192.168.1.33
```
