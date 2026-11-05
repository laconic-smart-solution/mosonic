#!/usr/bin/env node
/** Frees `PORT` (default 3000) before the dev server starts, so a stale/crashed instance never blocks `EADDRINUSE`. */
require('dotenv').config();
const { execSync } = require('child_process');

const port = process.env.PORT || 3000;

function killPortWindows(port) {
  let out;
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/LISTENING\s+(\d+)\s*$/);
    if (match) pids.add(match[1]);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`[kill-port] Freed port ${port} (killed PID ${pid})`);
    } catch {
      // process may have already exited
    }
  }
}

function killPortUnix(port) {
  let out;
  try {
    out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
  } catch {
    return;
  }
  if (!out) return;
  for (const pid of out.split('\n')) {
    try {
      execSync(`kill -9 ${pid}`);
      console.log(`[kill-port] Freed port ${port} (killed PID ${pid})`);
    } catch {
      // process may have already exited
    }
  }
}

if (process.platform === 'win32') {
  killPortWindows(port);
} else {
  killPortUnix(port);
}
