import type { SignTokenPayload } from "../shared/types";

export function decodeSignToken(token: string): SignTokenPayload | null {
  try {
    const body = token.split(".")[0];
    const padded = body.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - body.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload !== "object" || payload === null) return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.q !== "string") return null;
    if (typeof record.s !== "object" || record.s === null || Array.isArray(record.s)) return null;
    return payload as SignTokenPayload;
  } catch {
    return null;
  }
}
