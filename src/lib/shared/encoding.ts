const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const LOOKUP = new Uint8Array(128);
for (let index = 0; index < ALPHABET.length; index += 1) {
  LOOKUP[ALPHABET.charCodeAt(index)] = index;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let output = "";
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const value =
      (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output +=
      ALPHABET[(value >>> 18) & 63] +
      ALPHABET[(value >>> 12) & 63] +
      ALPHABET[(value >>> 6) & 63] +
      ALPHABET[value & 63];
  }

  if (index < bytes.length) {
    const remaining = bytes.length - index;
    const value =
      (bytes[index] << 16) |
      (remaining === 2 ? bytes[index + 1] << 8 : 0);
    output +=
      ALPHABET[(value >>> 18) & 63] + ALPHABET[(value >>> 12) & 63];
    if (remaining === 2) output += ALPHABET[(value >>> 6) & 63];
  }

  return output;
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/=+$/g, "");
  const byteLength = Math.floor((normalized.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    const digit = code < LOOKUP.length ? LOOKUP[code] : 255;
    if (digit === 255) throw new Error("Invalid base64url input");
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset] = (buffer >>> bits) & 0xff;
      offset += 1;
    }
  }

  if (offset !== byteLength) throw new Error("Invalid base64url input");
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function u32be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error("u32 value out of range");
  }
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

export function readU32be(bytes: Uint8Array, offset = 0): number {
  if (offset + 4 > bytes.length) throw new Error("Incomplete u32");
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}
