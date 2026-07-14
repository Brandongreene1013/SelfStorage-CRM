#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const PROJECT_NOTE = 'This configures Daily Activity Intelligence email delivery for Vercel Production.';

function run(command, args, value) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: true,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.stdin.write(`${value}\n`);
    child.stdin.end();
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function addVercelEnv(name, value) {
  if (!value) return;
  console.log(`\nSetting ${name} for Production...`);
  await run('vercel', ['env', 'add', name, 'production'], value);
}

const rl = readline.createInterface({ input, output });

try {
  console.log(PROJECT_NOTE);
  console.log('Create a Resend API key at https://resend.com/api-keys, then paste it here.');
  console.log('Use a verified sender/domain if possible. Resend test senders may only deliver to verified account emails.');

  const apiKey = (await rl.question('\nRESEND_API_KEY: ')).trim();
  const from = (await rl.question('ACTIVITY_EMAIL_FROM (example: Storage Hunters CRM <alerts@yourdomain.com>): ')).trim();
  const to = (await rl.question('ACTIVITY_REVIEW_EMAIL [bgreene@ripcofl.com]: ')).trim();

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY and ACTIVITY_EMAIL_FROM are required.');
  }

  await addVercelEnv('RESEND_API_KEY', apiKey);
  await addVercelEnv('ACTIVITY_EMAIL_FROM', from);
  if (to) await addVercelEnv('ACTIVITY_REVIEW_EMAIL', to);

  console.log('\nDone. Redeploy production, then test:');
  console.log('  vercel --prod');
  console.log('  https://self-storage-crm.vercel.app/api/daily-activity?mode=email-test');
} finally {
  rl.close();
}
