/**
 * Lightweight Socket.IO client for real-time dashboard updates.
 * Single shared connection — import useSocket() to receive events.
 */
import { io, type Socket } from "socket.io-client";

export const socket: Socket = io("/", {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  reconnectionDelay: 5000,
  reconnectionAttempts: 10,
});

/** Agent task events from CasaOS webhook emitter */
export interface CasaOSEvent {
  type: string;
  name?: string;
  state?: string;
  image?: string;
  timestamp?: string;
}

/** Real-time event from backend */
export interface RealtimeEvent {
  type: string;
  data: CasaOSEvent;
  ts: string;
}

export function onRealtimeEvent(cb: (ev: RealtimeEvent) => void): () => void {
  socket.on("events", cb as (...args: unknown[]) => void);
  return () => socket.off("events", cb as (...args: unknown[]) => void);
}

export function onCronUpdate(cb: () => void): () => void {
  socket.on("cron:updated", cb);
  return () => socket.off("cron:updated", cb);
}

/** Real-time log line from agent containers */
export interface LogLine {
  ts: string;
  level: "INFO" | "WARN" | "ERROR";
  component: string;
  msg: string;
}

export function onLog(cb: (line: LogLine) => void): () => void {
  socket.on("log", cb as (...args: unknown[]) => void);
  return () => socket.off("log", cb as (...args: unknown[]) => void);
}
