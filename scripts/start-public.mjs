import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(".");
const PORT = process.env.PORT || "4173";

loadDotEnv(join(ROOT, ".env"));

const token = process.env.NGROK_AUTHTOKEN;
const url = process.env.NGROK_URL;

const children = [];

const server = start("node", ["server.mjs"], {
  env: { ...process.env, PORT, PUBLIC_TUNNEL: "1" }
});

setTimeout(() => {
  const args = ["http", PORT];
  if (url) args.push("--url", url);

  const env = { ...process.env };
  if (token) env.NGROK_AUTHTOKEN = token;

  start("ngrok", args, {
    env
  });

  if (url) {
    console.log(`\nPublic GroupMe link: ${url}\n`);
  } else {
    console.log("\nngrok will print the public GroupMe link below. Look for the Forwarding URL.\n");
  }
}, 900);

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
process.on("exit", () => {
  for (const child of children) child.kill();
});

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options
  });
  children.push(child);

  child.on("exit", code => {
    if (child === server && code !== 0) stopAll();
  });

  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit();
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const splitAt = trimmed.indexOf("=");
    if (splitAt === -1) continue;

    const key = trimmed.slice(0, splitAt).trim();
    const value = trimmed.slice(splitAt + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}
