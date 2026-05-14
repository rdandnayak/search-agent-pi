import * as fs from "fs";
import * as path from "path";
import type { Message } from "./agent";

const SESSIONS_DIR = path.join(process.cwd(), "sessions");

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Creates a new timestamped .jsonl file for this run and returns its path.
export function createSessionFile(): string {
  ensureDir();
  // Replace colons and dots so the name is safe on all filesystems.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(SESSIONS_DIR, `${stamp}.jsonl`);
}

// Appends a single message as a JSON line. Called after every turn so the
// file is useful even if the process is killed mid-session.
export function appendMessage(file: string, message: Message): void {
  fs.appendFileSync(file, JSON.stringify(message) + "\n");
}

// Reads all messages from a .jsonl file. Skips blank lines silently.
export function loadSession(file: string): Message[] {
  const raw = fs.readFileSync(file, "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Message);
}

// Returns the path of the most recently modified session file, or null.
export function getMostRecentSession(): string | null {
  ensureDir();
  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(SESSIONS_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? null;
}

export function sessionSummary(file: string): string {
  try {
    const messages = loadSession(file);
    const mtime = fs.statSync(file).mtime.toLocaleString();
    const turns = Math.floor(messages.length / 2);
    return `${turns} exchange${turns !== 1 ? "s" : ""} — ${mtime}`;
  } catch {
    return path.basename(file);
  }
}
