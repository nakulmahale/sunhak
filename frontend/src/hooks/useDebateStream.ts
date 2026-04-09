/**
 * Project EMERGENCE — useDebateStream Custom Hook
 * =================================================
 * React hook for managing the WebSocket connection and debate state.
 * Provides the main interface between the UI and the backend.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";
import {
  DebateSession,
  DebateMessage,
  CountryCode,
  createInitialSession,
} from "@/lib/types";

interface UseDebateStreamReturn {
  session: DebateSession;
  isConnected: boolean;
  activeSpeaker: CountryCode | null;
  thinkingAgent: CountryCode | null;
  currentReasoning: string;
  startDebate: () => void;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
}

export function useDebateStream(): UseDebateStreamReturn {
  const [session, setSession] = useState<DebateSession>(createInitialSession());
  const [isConnected, setIsConnected] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<CountryCode | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<CountryCode | null>(null);
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");

  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    setConnectionStatus("connecting");
    socket.connect();

    // Connection events
    const unsubConnect = socket.on("_connected", () => {
      setIsConnected(true);
      setConnectionStatus("connected");
    });

    const unsubDisconnect = socket.on("_disconnected", () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
    });

    const unsubError = socket.on("_error", () => {
      setConnectionStatus("error");
    });

    // Debate events
    const unsubHeadline = socket.on("headline", (data: unknown) => {
      const d = data as {
        headline: string;
        source: string;
        summary: string;
      };
      setSession((prev) => ({
        ...prev,
        headline: d.headline,
        headlineSource: d.source,
        status: "active",
      }));
    });

    const unsubThinking = socket.on("agent_thinking", (data: unknown) => {
      const d = data as {
        countryCode: CountryCode;
        reasoning: string;
      };
      setThinkingAgent(d.countryCode);
      setCurrentReasoning(d.reasoning);
    });

    const unsubSpeaking = socket.on("agent_speaking", (data: unknown) => {
      const d = data as {
        message: DebateMessage;
        globalTension: number;
        turnCount: number;
      };
      setActiveSpeaker(d.message.countryCode);
      setThinkingAgent(null);
      setSession((prev) => ({
        ...prev,
        messages: [...prev.messages, d.message],
        globalTension: d.globalTension,
        turnCount: d.turnCount,
        activeSpeaker: d.message.countryCode,
      }));
    });

    const unsubTension = socket.on("tension_update", (data: unknown) => {
      const d = data as {
        globalTension: number;
        aggressionScores: Record<CountryCode, number>;
        turnCount: number;
      };
      setSession((prev) => ({
        ...prev,
        globalTension: d.globalTension,
        aggressionScores: d.aggressionScores,
        turnCount: d.turnCount,
      }));
    });

    const unsubEnd = socket.on("debate_end", (data: unknown) => {
      const d = data as {
        status: "consensus" | "deadlock" | "halted";
        afterActionReport: string;
      };
      setActiveSpeaker(null);
      setThinkingAgent(null);
      setSession((prev) => ({
        ...prev,
        status: d.status,
        afterActionReport: d.afterActionReport,
      }));
    });

    // Cleanup
    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubError();
      unsubHeadline();
      unsubThinking();
      unsubSpeaking();
      unsubTension();
      unsubEnd();
      socket.disconnect();
    };
  }, []);

  const startDebate = useCallback(() => {
    setSession(createInitialSession());
    setActiveSpeaker(null);
    setThinkingAgent(null);
    setCurrentReasoning("");
    socketRef.current.startDebate();
  }, []);

  return {
    session,
    isConnected,
    activeSpeaker,
    thinkingAgent,
    currentReasoning,
    startDebate,
    connectionStatus,
  };
}
