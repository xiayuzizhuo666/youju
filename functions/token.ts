import type { SignTokenPayload } from "./lib/types.ts";

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function keyFor(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function signToken(payload: SignTokenPayload, secret: string): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(body));
  return `${body}~${b64url(new Uint8Array(signature))}`;
}

export async function verifyToken<T extends { exp: number }>(token: string, secret: string): Promise<T | null> {
  try {
    const [body, signature] = token.split("~");
    if (!body || !signature) return null;
    const expected = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(body));
    if (b64url(new Uint8Array(expected)) !== signature) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
