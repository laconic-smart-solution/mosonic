/**
 * Start ngrok for local dev. Resolves the binary when winget installs ngrok
 * without adding it to PATH (common on Windows).
 *
 * Auth (pick one):
 *   1. NGROK_AUTHTOKEN in server/.env (loaded via node --env-file)
 *   2. ngrok config add-authtoken <token>  (writes ngrok.yml)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function findNgrokExecutable() {
  const candidates = [];

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const wingetPackages = path.join(
        localAppData,
        'Microsoft',
        'WinGet',
        'Packages',
      );
      if (fs.existsSync(wingetPackages)) {
        for (const dir of fs.readdirSync(wingetPackages)) {
          if (/^ngrok\.ngrok/i.test(dir)) {
            candidates.push(path.join(wingetPackages, dir, 'ngrok.exe'));
          }
        }
      }
      candidates.push(
        path.join(localAppData, 'Programs', 'ngrok', 'ngrok.exe'),
      );
      candidates.push(
        path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ngrok.exe'),
      );
    }
    candidates.push('C:\\Program Files\\ngrok\\ngrok.exe');
  }

  candidates.push('ngrok');

  for (const candidate of candidates) {
    if (candidate === 'ngrok') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'ngrok';
}

function ngrokConfigPaths() {
  const home = os.homedir();
  return [
    path.join(home, 'AppData', 'Local', 'ngrok', 'ngrok.yml'),
    path.join(home, '.config', 'ngrok', 'ngrok.yml'),
    path.join(home, '.ngrok2', 'ngrok.yml'),
  ];
}

function hasNgrokAuthtokenInConfig() {
  for (const configPath of ngrokConfigPaths()) {
    if (!fs.existsSync(configPath)) continue;
    const text = fs.readFileSync(configPath, 'utf8');
    if (/authtoken\s*:/i.test(text)) return true;
  }
  return false;
}

function printVersionHelp(ngrokExe) {
  console.error(`
ngrok agent is too old (ERR_NGROK_121). Your account requires ngrok >= 3.20.0.

Update:
  "${ngrokExe}" update

Or download the latest build from https://ngrok.com/download
`.trim());
}

function printAuthHelp(ngrokExe) {
  console.error(`
ngrok is not authenticated (ERR_NGROK_4018).

Do ONE of the following:

  Option A — add to server/.env:
    NGROK_AUTHTOKEN=<your-token-from-https://dashboard.ngrok.com/get-started/your-authtoken>
    Then run: yarn start:tunnel

  Option B — one-time CLI config:
    "${ngrokExe}" config add-authtoken <your-token>
    Then run: yarn start:tunnel

Reserve the domain "${process.env.NGROK_DOMAIN?.trim() || 'snarly-anika-retrogradely.ngrok-free.dev'}" on your ngrok dashboard if you use a custom domain.
`.trim());
}

const ngrok = findNgrokExecutable();
const port = process.env.NGROK_PORT?.trim() || '3000';
const domain =
  process.env.NGROK_DOMAIN?.trim() ||
  'snarly-anika-retrogradely.ngrok-free.dev';
const authtoken = process.env.NGROK_AUTHTOKEN?.trim();
const endpointUrl = /^https?:\/\//i.test(domain)
  ? domain
  : `https://${domain}`;

if (!authtoken && !hasNgrokAuthtokenInConfig()) {
  printAuthHelp(ngrok);
  process.exit(1);
}

const args = ['http'];
if (authtoken) {
  args.push('--authtoken', authtoken);
}
args.push(port, '--url', endpointUrl);

let stderr = '';
const child = spawn(ngrok, args, {
  stdio: ['inherit', 'inherit', 'pipe'],
  shell: false,
});

child.stderr?.on('data', (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(
      [
        'ngrok not found on PATH.',
        'Install: winget install ngrok.ngrok',
        'Then configure NGROK_AUTHTOKEN in .env or run ngrok config add-authtoken',
      ].join('\n'),
    );
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if (code !== 0) {
    if (/ERR_NGROK_121|too old/i.test(stderr)) {
      printVersionHelp(ngrok);
    } else if (/ERR_NGROK_4018|not authenticated/i.test(stderr)) {
      printAuthHelp(ngrok);
    }
  }
  process.exit(code ?? 1);
});
