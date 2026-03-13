/**
 * Lightweight VAPIX client for Raycast extension.
 * Self-contained — does not depend on @axctl/core (Raycast requires npm).
 * Implements HTTP Digest Auth and core VAPIX calls.
 */
import { createHash } from "crypto";

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
}

function parseDigestChallenge(header: string): DigestChallenge | undefined {
  if (!header.toLowerCase().startsWith("digest ")) return undefined;
  const params: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"(?:,\s*)?/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    params[match[1]!] = match[2]!;
  }
  if (!params["realm"] || !params["nonce"]) return undefined;
  return { realm: params["realm"], nonce: params["nonce"], qop: params["qop"], opaque: params["opaque"] };
}

function buildDigestAuth(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: DigestChallenge,
  nc: number
): string {
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const ncStr = nc.toString(16).padStart(8, "0");
  const cnonce = md5(Date.now().toString() + Math.random().toString());

  let response: string;
  if (challenge.qop === "auth") {
    response = md5(`${ha1}:${challenge.nonce}:${ncStr}:${cnonce}:auth:${ha2}`);
  } else {
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`);
  }

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.qop === "auth") {
    parts.push(`qop=auth`, `nc=${ncStr}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) {
    parts.push(`opaque="${challenge.opaque}"`);
  }
  return `Digest ${parts.join(", ")}`;
}

export async function digestFetch(url: string, username: string, password: string): Promise<Response> {
  const first = await fetch(url);
  if (first.status !== 401) return first;

  const wwwAuth = first.headers.get("www-authenticate");
  if (!wwwAuth) throw new Error("No WWW-Authenticate header in 401 response");

  const challenge = parseDigestChallenge(wwwAuth);
  if (!challenge) throw new Error("Failed to parse Digest challenge");

  const parsed = new URL(url);
  const uri = parsed.pathname + parsed.search;
  const auth = buildDigestAuth("GET", uri, username, password, challenge, 1);

  return fetch(url, { headers: { Authorization: auth } });
}

export interface DeviceProperties {
  ProdFullName: string;
  SerialNumber: string;
  Version: string;
  Architecture?: string;
  Brand?: string;
  HardwareID?: string;
}

export async function getDeviceInfo(ip: string, username: string, password: string): Promise<DeviceProperties> {
  const url = `http://${ip}/axis-cgi/basicdeviceinfo.cgi`;
  const response = await digestFetch(url, username, password);
  if (!response.ok) throw new Error(`Device info failed: ${response.status}`);
  const data = (await response.json()) as { apiVersion: string; data: { propertyList: DeviceProperties } };
  return data.data.propertyList;
}

export async function ping(ip: string, username: string, password: string): Promise<boolean> {
  try {
    const response = await digestFetch(`http://${ip}/axis-cgi/basicdeviceinfo.cgi`, username, password);
    return response.ok;
  } catch {
    return false;
  }
}

export function getSnapshotUrl(ip: string, resolution?: string): string {
  const params = new URLSearchParams();
  if (resolution) params.set("resolution", resolution);
  return `http://${ip}/axis-cgi/jpg/image.cgi${params.toString() ? "?" + params.toString() : ""}`;
}

export function getLiveStreamUrl(ip: string): string {
  return `http://${ip}/axis-cgi/mjpg/video.cgi`;
}
