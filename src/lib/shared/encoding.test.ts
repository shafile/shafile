import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  readU32be,
  u32be,
} from "./encoding";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    for (let length = 0; length < 80; length += 1) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        bytes[index] = (index * 37 + length) & 0xff;
      }
      expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("encodes u32 big-endian", () => {
    expect(Array.from(u32be(0x01020304))).toEqual([1, 2, 3, 4]);
    expect(readU32be(u32be(0xffffffff))).toBe(0xffffffff);
  });
});
