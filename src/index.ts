import { Elysia } from "elysia";
import { buildLog, type LogEntry } from "./entry.dto.js";

export interface LoggerOptions {
  enabled?: boolean;
  includeBody?: boolean;
  baseUrl: string;
  serviceName: string;
  apiKey: string;
  flushIntervalMs?: number;
  flushSize?: number;
  maxBufferSize?: number;
  developerMode?: boolean;
}

const MAX_BUFFER_SIZE = 5_000;

export function heimdall(options: LoggerOptions) {
  const {
    enabled = true,
    includeBody = false,
    apiKey,
    baseUrl,
    serviceName,
    flushIntervalMs = 10_000,
    flushSize = 50,
    maxBufferSize = MAX_BUFFER_SIZE,
    developerMode = false,
  } = options;

  if (!baseUrl) {
    console.warn("[heimdall-sdk] baseUrl is required.");
  }

  const flusher = createBufferFlusher(
    baseUrl,
    apiKey,
    flushSize,
    flushIntervalMs,
    maxBufferSize,
    developerMode
  );

  let heimdallStart = Date.now()

  return (app: Elysia) => 
    app
    .onBeforeHandle(() => {
      if(!enabled) return
    })
    .onAfterResponse(async (ctx) => {
      if(!enabled) return
      if(!baseUrl) return

      if(!heimdallStart) return

      const duration = Date.now() - heimdallStart

      const entry = await buildLog(
        ctx,
        duration,
        includeBody,
        serviceName
      )

      flusher.add(entry)
    })
}

function createBufferFlusher(
  baseUrl: string,
  apiKey: string,
  flushSize: number,
  flushIntervalMs: number,
  maxBufferSize: number,
  developerMode: boolean
) {
  let buffer: LogEntry[] = [];
  let flushing = false;
  let failureCount = 0;
  const MAX_FAILURES = 5;

  const flushBuffer = async () => {
    if (flushing) return;
    if (buffer.length === 0) return;

    flushing = true;

    const toSend = buffer.slice(0, flushSize);

    try {
      console.log("[heimdall-sdk] sending", toSend.length, "log entries");

      let url = `${baseUrl}/api/requests`;
      if (developerMode) {
        url = `${baseUrl}/requests`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
        body: JSON.stringify(toSend),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      buffer.splice(0, toSend.length);
      failureCount = 0;
    } catch (err) {
      failureCount++;
      console.error("[heimdall-sdk] failed to send log:", err);

      if (failureCount > MAX_FAILURES) {
        console.warn("[heimdall-sdk] too many failures, dropping logs");
        buffer.splice(0, toSend.length);
      }
    } finally {
      flushing = false;
    }
  };


  const intervalId = setInterval(() => flushBuffer(), flushIntervalMs);

  const add = (entry: LogEntry) => {
    if (buffer.length >= maxBufferSize) {
      console.warn("[heimdall-sdk] log buffer full, dropping log entry", entry);
      return;
    }

    buffer.push(entry);
    if (buffer.length >= flushSize) {
      flushBuffer();
    }
  };

  const cleanup = () => {
    clearInterval(intervalId);
  };

  return { add, cleanup };
}
