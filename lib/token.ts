import type { SignTokenPayload } from "../shared/types";

export function decodeSignToken(token: string): SignTokenPayload | null {
  try {
    const body = token.split(".")[0];
    const padded = body.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - body.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as SignTokenPayload;
  } catch {
    return null;
  }
}
