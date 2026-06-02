#!/usr/bin/env node
// One-time TractIQ OAuth helper for Storage Hero.
// Runs the full OAuth 2.0 + PKCE flow against app.tractiq.com, then prints the
// credentials you paste into Vercel env vars. The serverless function uses the
// refresh token to mint fresh access tokens automatically (no re-auth needed).
//
// Usage:  node scripts/tractiq-auth.mjs
// Then add the printed TRACTIQ_CLIENT_ID and TRACTIQ_REFRESH_TOKEN to Vercel.

import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';

const ISSUER = 'https://app.tractiq.com';
const REGISTER = `${ISSUER}/oauth/register`;
const AUTHORIZE = `${ISSUER}/oauth/authorize`;
const TOKEN = `${ISSUER}/oauth/token`;
const SCOPE = 'mcp:tools mcp:olap';
const PORT = 8976;
const REDIRECT = `http://localhost:${PORT}/callback`;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function main() {
  // 1. Dynamic client registration (public client, no secret)
  console.log('→ Registering client with TractIQ...');
  const regRes = await fetch(REGISTER, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Storage Hero Analyst',
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  if (!regRes.ok) throw new Error(`Registration failed (${regRes.status}): ${await regRes.text()}`);
  const reg = await regRes.json();
  const clientId = reg.client_id;
  console.log(`✓ Registered. client_id = ${clientId}`);

  // 2. PKCE
  const verifier = b64url(crypto.randomBytes(64));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authUrl = `${AUTHORIZE}?response_type=code&client_id=${encodeURIComponent(clientId)}`
    + `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${encodeURIComponent(SCOPE)}`
    + `&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

  // 3. Capture the redirect on localhost
  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const err = url.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body style="font-family:sans-serif;background:#0f172a;color:#fff;text-align:center;padding-top:80px"><h2>✓ TractIQ connected</h2><p>You can close this tab and return to the terminal.</p></body></html>');
      server.close();
      if (err) return reject(new Error(`Authorization error: ${err}`));
      if (returnedState !== state) return reject(new Error('State mismatch — possible CSRF, aborting.'));
      resolve(code);
    });
    server.listen(PORT, () => {
      console.log(`\n→ Opening your browser to log in to TractIQ...`);
      console.log(`  If it doesn't open, paste this URL manually:\n  ${authUrl}\n`);
      const cmd = process.platform === 'win32' ? `start "" "${authUrl}"`
        : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
      exec(cmd);
    });
  });

  const code = await codePromise;
  console.log('✓ Got authorization code, exchanging for tokens...');

  // 4. Exchange code for tokens
  const tokRes = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (!tokRes.ok) throw new Error(`Token exchange failed (${tokRes.status}): ${await tokRes.text()}`);
  const tok = await tokRes.json();

  console.log('\n' + '='.repeat(70));
  console.log('✓ SUCCESS — add these to Vercel (Settings → Environment Variables):');
  console.log('='.repeat(70));
  console.log(`\nTRACTIQ_CLIENT_ID=${clientId}`);
  console.log(`\nTRACTIQ_REFRESH_TOKEN=${tok.refresh_token}`);
  console.log('\n' + '='.repeat(70));
  if (!tok.refresh_token) {
    console.log('\n⚠ No refresh_token returned. Access token (expires in '
      + `${tok.expires_in}s) — we may need a different flow:\n${tok.access_token}`);
  }
  console.log('\nKeep these secret. The app uses the refresh token to mint access tokens automatically.\n');
  process.exit(0);
}

main().catch(err => { console.error('\n✗ ' + err.message); process.exit(1); });
