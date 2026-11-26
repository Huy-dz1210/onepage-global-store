import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  // Khóa mặc định chỉ dùng cho demo – production bắt buộc đặt ENCRYPTION_KEY riêng
  const hex = process.env.ENCRYPTION_KEY || "5b2c1f0e8d7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c";
  if (hex.length !== 64) throw new Error("ENCRYPTION_KEY phải là 32 bytes hex (64 ký tự)");
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM → "iv.tag.ciphertext" (base64url) */
export function encryptJson(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptJson<T = Record<string, string>>(payload: string): T {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8"));
}
