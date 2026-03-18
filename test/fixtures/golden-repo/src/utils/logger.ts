/**
 * Application logger — widely imported across the codebase.
 * Known characteristics:
 *   - Zero imports (leaf node)
 *   - Imported by: auth-service, connection, routes, handlers (4 reverse deps)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

function formatEntry(entry: LogEntry): string {
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
  return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${ctx}`;
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };

  const formatted = formatEntry(entry);

  if (level === "error") {
    console.error(formatted);
  } else if (level === "warn") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export function debug(message: string, context?: Record<string, unknown>): void {
  log("debug", message, context);
}

export function info(message: string, context?: Record<string, unknown>): void {
  log("info", message, context);
}

export function warn(message: string, context?: Record<string, unknown>): void {
  log("warn", message, context);
}

export function error(message: string, context?: Record<string, unknown>): void {
  log("error", message, context);
}
