/**
 * Read-only access to the shared axctl SQLite database.
 * This is the shared contract between axctl CLI and Raycast.
 */
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DB_PATH = join(homedir(), ".axctl", "devices.db");

export interface DeviceRow {
  ip: string;
  model: string | null;
  serial: string | null;
  firmware_version: string | null;
  mac_address: string | null;
  last_seen: string | null;
}

export interface FleetRow {
  name: string;
}

export interface CredentialEntry {
  ip: string;
  username: string;
  password: string;
}

function getDb(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly: true });
}

export function listDevices(): DeviceRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare("SELECT * FROM devices ORDER BY last_seen DESC").all() as DeviceRow[];
  } finally {
    db.close();
  }
}

export function getDevice(ip: string): DeviceRow | undefined {
  const db = getDb();
  if (!db) return undefined;
  try {
    return db.prepare("SELECT * FROM devices WHERE ip = ?").get(ip) as DeviceRow | undefined;
  } finally {
    db.close();
  }
}

export function listFleets(): Array<{ name: string; ips: string[] }> {
  const db = getDb();
  if (!db) return [];
  try {
    const fleets = db.prepare("SELECT name FROM fleets ORDER BY name").all() as FleetRow[];
    return fleets.map((f) => {
      const members = db
        .prepare("SELECT ip FROM fleet_members WHERE fleet_name = ? ORDER BY ip")
        .all(f.name) as Array<{ ip: string }>;
      return { name: f.name, ips: members.map((m) => m.ip) };
    });
  } finally {
    db.close();
  }
}

/**
 * Read credentials from the file-based fallback store.
 * On macOS with Keychain, credentials are stored there instead.
 * This reads the JSON fallback file for non-Keychain setups.
 */
export function getCredentials(ip: string): CredentialEntry | undefined {
  // Try file-based fallback first
  const credPath = join(homedir(), ".axctl", "device-credentials-credentials.json");
  if (!existsSync(credPath)) return undefined;
  try {
    const { readFileSync } = require("fs");
    const data = JSON.parse(readFileSync(credPath, "utf8")) as Record<string, string>;
    const raw = data[ip];
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { username: string; password: string };
    return { ip, username: parsed.username, password: parsed.password };
  } catch {
    return undefined;
  }
}

export function getAllCredentials(): CredentialEntry[] {
  const credPath = join(homedir(), ".axctl", "device-credentials-credentials.json");
  if (!existsSync(credPath)) return [];
  try {
    const { readFileSync } = require("fs");
    const data = JSON.parse(readFileSync(credPath, "utf8")) as Record<string, string>;
    const results: CredentialEntry[] = [];
    for (const [ip, raw] of Object.entries(data)) {
      try {
        const parsed = JSON.parse(raw) as { username: string; password: string };
        results.push({ ip, username: parsed.username, password: parsed.password });
      } catch {
        // Skip malformed
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function hasDatabase(): boolean {
  return existsSync(DB_PATH);
}
