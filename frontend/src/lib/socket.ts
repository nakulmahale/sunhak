/**
 * Project EMERGENCE — Socket.io Client Singleton
 * ================================================
 * Manages the WebSocket connection to the FastAPI backend.
 * Provides a singleton instance with auto-reconnect.
 */

"use client";

import { io, Socket } from "socket.io-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/**
 * Note: We're using native WebSocket in this project since the backend
 * uses FastAPI's native WebSocket support (not socket.io server).
 * This module provides a WebSocket wrapper that mimics socket.io patterns.
 */

export type MessageHandler = (event: MessageEvent) => void;

class DebateSocket {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/ws/debate";
    console.log(`🔌 Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected to Project EMERGENCE");
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.emit("_connected", {});
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          const eventType = parsed.type || "message";
          this.emit(eventType, parsed.data || parsed);
        } catch {
          console.warn("Failed to parse WebSocket message:", event.data);
        }
      };

      this.ws.onclose = () => {
        console.log("🔌 WebSocket disconnected");
        this._isConnected = false;
        this.emit("_disconnected", {});

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
          console.log(
            `↻ Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
          );
          setTimeout(() => this.connect(), delay);
        }
      };

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        this.emit("_error", { error });
      };
    } catch (error) {
      console.error("❌ Failed to create WebSocket:", error);
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("⚠️ Cannot send — WebSocket not connected");
    }
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: (data: unknown) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in handler for event '${event}':`, error);
      }
    });
  }

  // Start a new debate session
  startDebate(): void {
    this.send({ type: "start_debate" });
  }

  // Send a ping to keep the connection alive
  ping(): void {
    this.send({ type: "ping" });
  }
}

// Singleton instance
let instance: DebateSocket | null = null;

export function getSocket(): DebateSocket {
  if (!instance) {
    instance = new DebateSocket();
  }
  return instance;
}

export default DebateSocket;
