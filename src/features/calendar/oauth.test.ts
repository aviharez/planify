import test from "node:test";
import assert from "node:assert/strict";
import { exchangeGoogleCode, refreshGoogleAccessToken } from "./oauth";

function response(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 400, headers: { "content-type": "application/json" } });
}

test("pertukaran code dan refresh memakai parameter OAuth server-side", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: String(init?.body) });
    return response({ access_token: requests.length === 1 ? "access-1" : "access-2", refresh_token: requests.length === 1 ? "refresh-1" : undefined, expires_in: 3600 });
  };
  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";
  const initial = await exchangeGoogleCode("code", fetchMock);
  const refreshed = await refreshGoogleAccessToken("refresh-1", fetchMock);
  assert.equal(initial.refresh_token, "refresh-1");
  assert.equal(refreshed.refresh_token, undefined);
  assert.match(requests[0].body, /grant_type=authorization_code/);
  assert.match(requests[1].body, /grant_type=refresh_token/);
  assert.match(requests[1].body, /refresh_token=refresh-1/);
});
