import type { SignTokenPayload } from "../shared/types";

export type DecodedSignToken = Pick<SignTokenPayload, "q" | "id" | "c" | "exp">;

/**
 * Decode only the compact envelope (question, chosen id, candidate ids,
 * expiry) for display/loading. The signature is verified server-side by the
 * `sign` action, so this function never returns or trusts a sign payload.
 */
export function decodeSignToken(token: string): DecodedSignToken | null {
  try {
    const body = token.split("~")[0];
    if (!body) return null;
    const padded = body.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - body.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.q !== "string") return null;
    if (typeof record.id !== "string" || record.id.length === 0) return null;
    if (!Array.isArray(record.c) || !record.c.every((id) => typeof id === "string")) return null;
    if (typeof record.exp !== "number") return null;
    return { q: record.q, id: record.id, c: record.c as string[], exp: record.exp };
  } catch {
    return null;
  }
}
