/** Pure hex helpers safe for browser + Node (no Buffer required in browser). */

export function uint8ArrayToHexBytea(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return `\\x${hex}`;
}

export function hexByteaToUint8Array(value: string): Uint8Array | null {
  if (!value.startsWith("\\x")) {
    return null;
  }
  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function decodeByteaValue(value: unknown): Uint8Array | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === "string") {
    if (value.startsWith("\\x")) {
      return hexByteaToUint8Array(value);
    }
    // Some clients return base64 for bytea.
    try {
      if (typeof atob === "function") {
        const binary = atob(value);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          out[i] = binary.charCodeAt(i);
        }
        return out;
      }
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value as number[]);
  }
  return null;
}
