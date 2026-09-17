export const DB_URI =
  process.env.MONGO_DB_URI ?? 'mongodb://localhost:27017/mydb';

function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export const TRUST_PROXY_HOPS = readInteger(process.env.TRUST_PROXY_HOPS, 0, 0);
export const AUTH_RATE_LIMIT_WINDOW_MS = readInteger(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
  1000
);
export const AUTH_RATE_LIMIT_MAX = readInteger(
  process.env.AUTH_RATE_LIMIT_MAX,
  10,
  1
);
export const SHUTDOWN_TIMEOUT_MS = readInteger(
  process.env.SHUTDOWN_TIMEOUT_MS,
  10_000,
  1000
);
export const AI_RATE_LIMIT_WINDOW_MS = readInteger(
  process.env.AI_RATE_LIMIT_WINDOW_MS,
  60_000,
  1000
);
export const AI_RATE_LIMIT_MAX = readInteger(
  process.env.AI_RATE_LIMIT_MAX,
  5,
  1
);
export const OLLAMA_TIMEOUT_MS = readInteger(
  process.env.OLLAMA_TIMEOUT_MS,
  60_000,
  1000
);
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'granite4.1:3b';
export const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
