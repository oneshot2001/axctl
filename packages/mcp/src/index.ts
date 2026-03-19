#!/usr/bin/env bun
/**
 * @axctl/mcp — MCP server exposing Axis camera management tools.
 * Transport: stdio (for Claude Code / Cursor integration).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  discoverAll,
  VapixClient,
  AoaClient,
  PtzClient,
  FirmwareClient,
  appsClient,
  credentialStore,
  fleetExec,
  deviceRegistry,
  ApiDiscoveryClient,
  ParamsClient,
  StreamClient,
} from 'axctl-core'

const server = new McpServer({
  name: 'axis',
  version: '0.1.0',
})

// --- Helper ---

function getAuth(ip: string): { username: string; password: string } {
  const cred = credentialStore.get(ip)
  if (!cred) throw new Error(`No credentials stored for ${ip}. Run: axctl auth add ${ip}`)
  return { username: cred.username, password: cred.password }
}

// --- Tools ---

server.tool(
  'axis_discover_devices',
  'Discover Axis cameras on the local network via mDNS + SSDP',
  { timeout_seconds: z.number().optional().describe('Scan duration in seconds (default 5)') },
  async ({ timeout_seconds }) => {
    const devices = await discoverAll((timeout_seconds ?? 5) * 1000)
    // Also register discovered devices
    for (const d of devices) {
      deviceRegistry.upsert(d.ip, d.model, d.serial, d.firmwareVersion, d.macAddress)
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(devices, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_list_devices',
  'List all known Axis cameras from the device registry',
  {},
  async () => {
    const devices = deviceRegistry.list()
    const creds = credentialStore.list()
    const credMap = new Map(creds.map(c => [c.ip, true]))
    const rows = devices.map(d => ({
      ...d,
      has_credentials: credMap.has(d.ip),
    }))
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(rows, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_device_info',
  'Get detailed device info (model, serial, firmware, etc.) from an Axis camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new VapixClient(ip, auth.username, auth.password)
    const info = await client.getDeviceInfo()
    deviceRegistry.upsert(ip, info.ProdFullName, info.SerialNumber, info.Version)
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(info, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_capture_snapshot',
  'Capture a JPEG snapshot from an Axis camera',
  {
    ip: z.string().describe('Camera IP address'),
    resolution: z.string().optional().describe('Resolution (e.g. "1920x1080")'),
    channel: z.number().optional().describe('Video channel (default 1)'),
  },
  async ({ ip, resolution, channel }) => {
    const auth = getAuth(ip)
    const params = new URLSearchParams()
    if (resolution) params.set('resolution', resolution)
    if (channel) params.set('camera', String(channel))
    const url = `http://${ip}/axis-cgi/jpg/image.cgi${params.toString() ? '?' + params.toString() : ''}`

    const { digestFetch } = await import('@axctl/core')
    const response = await digestFetch(url, 'GET', auth.username, auth.password)
    if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`)

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    return {
      content: [{
        type: 'image' as const,
        data: base64,
        mimeType: 'image/jpeg',
      }],
    }
  }
)

server.tool(
  'axis_list_scenarios',
  'List AOA (AXIS Object Analytics) scenarios configured on a camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new AoaClient(ip, auth.username, auth.password)
    const scenarios = await client.getScenarios()
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(scenarios, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_create_scenario',
  'Create a new AOA scenario on an Axis camera',
  {
    ip: z.string().describe('Camera IP address'),
    name: z.string().describe('Scenario name'),
    type: z.string().describe('Scenario type (e.g. "motion_in_area", "line_crossing", "object_in_area")'),
    device: z.number().optional().describe('Analytics device index (default 1)'),
  },
  async ({ ip, name, type, device }) => {
    const auth = getAuth(ip)
    const client = new AoaClient(ip, auth.username, auth.password)
    await client.addScenario(name, type, device ?? 1)
    return {
      content: [{
        type: 'text' as const,
        text: `Created scenario "${name}" (type: ${type}) on ${ip}`,
      }],
    }
  }
)

server.tool(
  'axis_fleet_status',
  'Get status of all cameras in a named fleet',
  { fleet_name: z.string().describe('Fleet name') },
  async ({ fleet_name }) => {
    const results = await fleetExec(fleet_name, async (ip, user, pass) => {
      const client = new VapixClient(ip, user, pass)
      const info = await client.getDeviceInfo()
      return { ip, model: info.ProdFullName, serial: info.SerialNumber, firmware: info.Version }
    })
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_firmware_status',
  'Check firmware version and upgrade availability on an Axis camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new FirmwareClient(ip, auth.username, auth.password)
    const status = await client.getStatus()
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(status, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_list_apps',
  'List installed ACAP applications on an Axis camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const apps = await appsClient.list(ip, auth.username, auth.password)
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(apps, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_ptz_control',
  'Control PTZ (Pan-Tilt-Zoom) on an Axis camera',
  {
    ip: z.string().describe('Camera IP address'),
    action: z.enum(['home', 'goto', 'move', 'zoom', 'presets', 'goto_preset']).describe('PTZ action'),
    pan: z.number().optional().describe('Pan value (-180 to 180)'),
    tilt: z.number().optional().describe('Tilt value (-90 to 90)'),
    zoom: z.number().optional().describe('Zoom value'),
    preset: z.string().optional().describe('Preset name (for goto_preset)'),
  },
  async ({ ip, action, pan, tilt, zoom, preset }) => {
    const auth = getAuth(ip)
    const client = new PtzClient(ip, auth.username, auth.password)

    switch (action) {
      case 'home':
        await client.goHome()
        return { content: [{ type: 'text' as const, text: `PTZ moved to home on ${ip}` }] }
      case 'goto':
        await client.absoluteMove(pan ?? 0, tilt ?? 0, zoom ?? 1)
        return { content: [{ type: 'text' as const, text: `PTZ moved to pan=${pan} tilt=${tilt} zoom=${zoom} on ${ip}` }] }
      case 'presets': {
        const presets = await client.listPresets()
        return { content: [{ type: 'text' as const, text: JSON.stringify(presets, null, 2) }] }
      }
      case 'goto_preset':
        if (!preset) throw new Error('preset name required for goto_preset action')
        await client.gotoPreset(preset)
        return { content: [{ type: 'text' as const, text: `PTZ moved to preset "${preset}" on ${ip}` }] }
      case 'move':
        await client.relativeMove(pan ?? 0, tilt ?? 0, zoom ?? 0)
        return { content: [{ type: 'text' as const, text: `PTZ relative move on ${ip}` }] }
      case 'zoom':
        await client.absoluteMove(0, 0, zoom ?? 1)
        return { content: [{ type: 'text' as const, text: `PTZ zoom set to ${zoom} on ${ip}` }] }
    }
  }
)

server.tool(
  'axis_check_health',
  'Ping an Axis camera to check if it is reachable',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new VapixClient(ip, auth.username, auth.password)
    const reachable = await client.ping()
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ ip, reachable }, null, 2),
      }],
    }
  }
)

// --- V1.5 Tools ---

server.tool(
  'axis_api_discovery',
  'List all VAPIX APIs supported by a camera, or check if a specific API is available',
  {
    ip: z.string().describe('Camera IP address'),
    check_api: z.string().optional().describe('Specific API ID to check (e.g. "ptz-control")'),
  },
  async ({ ip, check_api }) => {
    const auth = getAuth(ip)
    const client = new ApiDiscoveryClient(ip, auth.username, auth.password)
    if (check_api) {
      const version = await client.getApiVersion(check_api)
      return {
        content: [{
          type: 'text' as const,
          text: version
            ? JSON.stringify({ api: check_api, supported: true, version }, null, 2)
            : JSON.stringify({ api: check_api, supported: false }, null, 2),
        }],
      }
    }
    const apis = await client.getApis()
    return { content: [{ type: 'text' as const, text: JSON.stringify(apis, null, 2) }] }
  }
)

server.tool(
  'axis_params_export',
  'Export all configurable parameters from a camera as structured data',
  {
    ip: z.string().describe('Camera IP address'),
    group: z.string().optional().describe('Limit to a parameter group (e.g. "root.Image")'),
  },
  async ({ ip, group }) => {
    const auth = getAuth(ip)
    const client = new ParamsClient(ip, auth.username, auth.password)
    if (group) {
      const params = await client.list(group)
      return { content: [{ type: 'text' as const, text: JSON.stringify(params, null, 2) }] }
    }
    const vapix = new VapixClient(ip, auth.username, auth.password)
    const info = await vapix.getDeviceInfo()
    const exported = await client.exportAll({
      model: info.ProdFullName ?? info.Model ?? 'unknown',
      firmware: info.Version ?? 'unknown',
      serial: (info as Record<string, string>).SerialNumber ?? info.ProdSerialNumber ?? 'unknown',
      ip,
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(exported, null, 2) }] }
  }
)

server.tool(
  'axis_params_set',
  'Set a device parameter value',
  {
    ip: z.string().describe('Camera IP address'),
    param: z.string().describe('Full parameter path (e.g. "root.Image.I0.Appearance.Resolution")'),
    value: z.string().describe('New value'),
  },
  async ({ ip, param, value }) => {
    const auth = getAuth(ip)
    const client = new ParamsClient(ip, auth.username, auth.password)
    const success = await client.set(param, value)
    return {
      content: [{
        type: 'text' as const,
        text: success ? `Set ${param}=${value}` : `Failed to set ${param}`,
      }],
    }
  }
)

server.tool(
  'axis_apps_install',
  'Install an ACAP application (.eap file) on a camera',
  {
    ip: z.string().describe('Camera IP address'),
    eap_path: z.string().describe('Absolute path to .eap file on disk'),
  },
  async ({ ip, eap_path }) => {
    const auth = getAuth(ip)
    const { readFileSync } = await import('fs')
    const eapData = readFileSync(eap_path)
    const filename = eap_path.split('/').pop() ?? eap_path
    const result = await appsClient.install(ip, auth.username, auth.password, eapData, filename)
    return {
      content: [{
        type: 'text' as const,
        text: `Installed ${filename} on ${ip}: ${result}`,
      }],
    }
  }
)

server.tool(
  'axis_apps_remove',
  'Remove (uninstall) an ACAP application from a camera',
  {
    ip: z.string().describe('Camera IP address'),
    package_name: z.string().describe('ACAP package name (e.g. "objectanalytics")'),
  },
  async ({ ip, package_name }) => {
    const auth = getAuth(ip)
    try { await appsClient.stop(ip, auth.username, auth.password, package_name) } catch { /* may already be stopped */ }
    await new Promise(r => setTimeout(r, 2000))
    await appsClient.remove(ip, auth.username, auth.password, package_name)
    return { content: [{ type: 'text' as const, text: `Removed ${package_name} from ${ip}` }] }
  }
)

server.tool(
  'axis_stream_profiles',
  'List video stream profiles configured on a camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new StreamClient(ip, auth.username, auth.password)
    const profiles = await client.listProfiles()
    return { content: [{ type: 'text' as const, text: JSON.stringify(profiles, null, 2) }] }
  }
)

server.tool(
  'axis_ptz_presets',
  'List, create, or remove PTZ presets on a camera',
  {
    ip: z.string().describe('Camera IP address'),
    action: z.enum(['list', 'create', 'remove']).describe('Preset action'),
    name: z.string().optional().describe('Preset name (required for create/remove)'),
  },
  async ({ ip, action, name }) => {
    const auth = getAuth(ip)
    const client = new PtzClient(ip, auth.username, auth.password)
    switch (action) {
      case 'list': {
        const presets = await client.listPresets()
        return { content: [{ type: 'text' as const, text: JSON.stringify(presets, null, 2) }] }
      }
      case 'create':
        if (!name) throw new Error('name required for create')
        await client.createPreset(name)
        return { content: [{ type: 'text' as const, text: `Created preset "${name}" at current position` }] }
      case 'remove':
        if (!name) throw new Error('name required for remove')
        await client.removePreset(name)
        return { content: [{ type: 'text' as const, text: `Removed preset "${name}"` }] }
    }
  }
)

// --- Start server ---
const transport = new StdioServerTransport()
await server.connect(transport)
