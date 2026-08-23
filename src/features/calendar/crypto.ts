import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBytes(value = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY) {
  if (!value) throw new Error("Kunci enkripsi kalender belum dikonfigurasi.");
  const decoded = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64url");
  if (decoded.length !== 32) throw new Error("Kunci enkripsi kalender harus berukuran 32 byte.");
  return decoded;
}

export function encryptCalendarToken(plaintext: string, key?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCalendarToken(payload: string, key?: string) {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Token kalender terenkripsi tidak valid.");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}
