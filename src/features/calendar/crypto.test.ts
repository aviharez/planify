import test from "node:test";
import assert from "node:assert/strict";
import { decryptCalendarToken, encryptCalendarToken } from "./crypto";

const key = Buffer.alloc(32, 7).toString("base64url");

test("token kalender terenkripsi AEAD dan menolak perubahan ciphertext", () => {
  const encrypted = encryptCalendarToken("refresh-secret", key);
  assert.notEqual(encrypted, "refresh-secret");
  assert.equal(decryptCalendarToken(encrypted, key), "refresh-secret");
  const parts = encrypted.split(".");
  parts[3] = `${parts[3]}a`;
  assert.throws(() => decryptCalendarToken(parts.join("."), key));
  assert.throws(() => encryptCalendarToken("token", Buffer.alloc(16).toString("base64url")));
});
