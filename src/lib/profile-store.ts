import Conf from 'conf'
import { credentialStore } from './credential-store.js'
import { fleetStore } from './fleet-store.js'

export interface Profile {
  name: string
  credentials: Record<string, { ip: string; username: string; password: string }>
  fleets: Record<string, { name: string; ips: string[] }>
  defaults: {
    format?: string
    timeout?: number
  }
}

const store = new Conf<{ profiles: Record<string, Profile>; activeProfile?: string }>({
  projectName: 'axctl-profiles',
  schema: {
    profiles: {
      type: 'object',
      default: {},
    },
    activeProfile: {
      type: 'string',
      default: undefined,
    },
  },
})

export const profileStore = {
  create(name: string): void {
    const profiles = store.get('profiles', {})
    profiles[name] = {
      name,
      credentials: {},
      fleets: {},
      defaults: {},
    }
    store.set('profiles', profiles)
  },

  get(name: string): Profile | undefined {
    return store.get('profiles', {})[name]
  },

  list(): Profile[] {
    return Object.values(store.get('profiles', {}))
  },

  remove(name: string): boolean {
    const profiles = store.get('profiles', {})
    if (!profiles[name]) return false
    delete profiles[name]
    store.set('profiles', profiles)
    const active = store.get('activeProfile')
    if (active === name) store.delete('activeProfile')
    return true
  },

  has(name: string): boolean {
    return !!store.get('profiles', {})[name]
  },

  getActive(): string | undefined {
    return store.get('activeProfile')
  },

  setActive(name: string): void {
    store.set('activeProfile', name)
  },

  clearActive(): void {
    store.delete('activeProfile')
  },

  importFrom(name: string): void {
    const profiles = store.get('profiles', {})
    const profile = profiles[name]
    if (!profile) return

    const creds = credentialStore.list()
    profile.credentials = {}
    for (const c of creds) {
      profile.credentials[c.ip] = { ip: c.ip, username: c.username, password: c.password }
    }

    const fleets = fleetStore.list()
    profile.fleets = {}
    for (const f of fleets) {
      profile.fleets[f.name] = { name: f.name, ips: f.ips }
    }

    store.set('profiles', profiles)
  },

  activate(name: string): void {
    const profile = store.get('profiles', {})[name]
    if (!profile) return

    // Clear existing global credentials and fleets, then load from profile
    for (const c of credentialStore.list()) {
      credentialStore.remove(c.ip)
    }
    for (const f of fleetStore.list()) {
      fleetStore.remove(f.name)
    }

    for (const c of Object.values(profile.credentials)) {
      credentialStore.add(c.ip, c.username, c.password)
    }
    for (const f of Object.values(profile.fleets)) {
      fleetStore.create(f.name, f.ips)
    }

    store.set('activeProfile', name)
  },
}
