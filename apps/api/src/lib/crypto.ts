import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { config } from "./config.js";

function getKey(): Buffer {
  return createHash("sha256").update(config.encryptionKey).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid ciphertext");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", getKey(), iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string } {
  const raw = randomBytes(32).toString("hex");
  const key = `rkyves_${raw}`;
  return { key, prefix: key.slice(0, 12) };
}
