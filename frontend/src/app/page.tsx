"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AgentArena from "@/components/AgentArena";
import DebateFeed from "@/components/DebateFeed";
import MonologueStream from "@/components/MonologueStream";
import StressDial from "@/components/StressDial";
import { getSocket } from "@/lib/socket";
import {
  DebateSession,
  DebateMessage,
  CountryCode,
  COUNTRY_CODES,
  COUNTRIES,
  createInitialSession,
} from "@/lib/types";

export default function WarRoom() {
  const [session, setSession] = useState<DebateSession>(createInitialSession());
  const [isConnected, setIsConnected] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<CountryCode | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<CountryCode | null>(null);
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [isDebating, setIsDebating] = useState(false);
  const [systemMessages, setSystemMessages] = useState<string[]>([]);

  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    socket.connect();

    const unsubConnect = socket.on("_connected", () => setIsConnected(true));
    const unsubDisconnect = socket.on("_disconnected", () => setIsConnected(false));

    const unsubSystem = socket.on("system_message", (data: unknown) => {
      const d = data as { message: string };
      setSystemMessages((prev) => [...prev.slice(-10), d.message]);
    });

    const unsubHeadline = socket.on("headline", (data: unknown) => {
      const d = data as { headline: string; source: string; summary: string };
      setSession((prev) => ({
        ...prev,
        headline: d.headline,
        headlineSource: d.source,
        status: "active",
      }));
    });

    const unsubThinking = socket.on("agent_thinking", (data: unknown) => {
      const d = data as { countryCode: CountryCode; reasoning: string };
      setThinkingAgent(d.countryCode);
      setCurrentReasoning((prev) => prev + "\n" + d.reasoning);
    });

    const unsubSpeaking = socket.on("agent_speaking", (data: unknown) => {
      const d = data as {
        message: DebateMessage;
        globalTension: number;
        turnCount: number;
      };
      setActiveSpeaker(d.message.countryCode);
      setThinkingAgent(null);
      setCurrentReasoning(d.message.reasoning || "");
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
        aggressionScores: Record<string, number>;
        turnCount: number;
      };
      setSession((prev) => ({
        ...prev,
        globalTension: d.globalTension,
        aggressionScores: d.aggressionScores as Record<CountryCode, number>,
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
      setIsDebating(false);
      setSession((prev) => ({
        ...prev,
        status: d.status,
        afterActionReport: d.afterActionReport,
      }));
    });

    const unsubError = socket.on("error", (data: unknown) => {
      const d = data as { message: string };
      setSystemMessages((prev) => [...prev, `ERROR: ${d.message}`]);
      setIsDebating(false);
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubSystem();
      unsubHeadline();
      unsubThinking();
      unsubSpeaking();
      unsubTension();
      unsubEnd();
      unsubError();
      socket.disconnect();
    };
  }, []);

  const startDebate = useCallback(() => {
    setSession(createInitialSession());
    setActiveSpeaker(null);
    setThinkingAgent(null);
    setCurrentReasoning("");
    setSystemMessages([]);
    setIsDebating(true);
    socketRef.current.startDebate();
  }, []);

  const isWarning = session.globalTension > 0.7;

  return (
    <div
      className={`h-screen flex flex-col grid-pattern ${isWarning ? "warning-state" : ""}`}
    >
      {/* ====== TOP BAR ====== */}
      <header className="flex-shrink-0 px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-secondary)]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <motion.div
              className="w-3 h-3 rounded-full bg-cyan-400"
              animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <h1 className="text-sm font-bold tracking-widest uppercase neon-text">
              Project EMERGENCE
            </h1>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-muted)] border-l border-[var(--border-subtle)] pl-3">
            GLOBAL WAR ROOM
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`}
            />
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {isConnected ? "CONNECTED" : "OFFLINE"}
            </span>
          </div>

          {/* Start button */}
          <motion.button
            onClick={startDebate}
            disabled={!isConnected || isDebating}
            className={`px-4 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-all
              ${
                isDebating
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-not-allowed"
                  : isConnected
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 hover:border-cyan-500/50 cursor-pointer"
                    : "bg-gray-500/20 text-gray-500 border border-gray-500/20 cursor-not-allowed"
              }`}
            whileHover={isConnected && !isDebating ? { scale: 1.02 } : {}}
            whileTap={isConnected && !isDebating ? { scale: 0.98 } : {}}
          >
            {isDebating ? "DEBATE IN PROGRESS..." : "INITIATE DEBATE"}
          </motion.button>
        </div>
      </header>

      {/* ====== MAIN CONTENT ====== */}
      <main className="flex-1 flex gap-2 p-2 overflow-hidden min-h-0">
        {/* LEFT PANEL: Agent Arena + Stress Dial */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-2">
          <div className="flex-1">
            <AgentArena
              activeSpeaker={activeSpeaker}
              thinkingAgent={thinkingAgent}
              aggressionScores={session.aggressionScores}
            />
          </div>
          <div className="h-48">
            <StressDial
              tension={session.globalTension}
              turnCount={session.turnCount}
            />
          </div>
        </div>

        {/* CENTER: Debate Feed */}
        <div className="flex-1 min-w-0">
          <DebateFeed
            messages={session.messages}
            headline={session.headline}
            headlineSource={session.headlineSource}
            status={session.status}
            afterActionReport={session.afterActionReport}
          />
        </div>

        {/* RIGHT PANEL: Monologue + System Log */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-2">
          <div className="flex-1">
            <MonologueStream
              activeSpeaker={activeSpeaker}
              reasoning={currentReasoning}
            />
          </div>

          {/* System log */}
          <div className="h-32 glass-card p-2 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="status-dot bg-purple-400" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">
                System Log
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {systemMessages.length === 0 && (
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  System ready.
                </p>
              )}
              {systemMessages.map((msg, i) => (
                <p
                  key={i}
                  className={`text-[10px] font-mono ${msg.startsWith("ERROR") ? "text-red-400" : msg.startsWith("WARNING") ? "text-amber-400" : "text-[var(--text-muted)]"}`}
                >
                  &gt; {msg}
                </p>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ====== BOTTOM STATUS BAR ====== */}
      <footer className="flex-shrink-0 px-4 py-1 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-[9px] font-mono text-[var(--text-muted)]">
            EMERGENCE v0.1.0
          </span>
          <span className="text-[9px] font-mono text-[var(--text-muted)]">
            LangGraph Cyclic Engine
          </span>
          <span className="text-[9px] font-mono text-[var(--text-muted)]">
            Gemini 2.0 Flash
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[9px] font-mono text-[var(--text-muted)]">
            AGENTS: 10
          </span>
          <span className="text-[9px] font-mono text-[var(--text-muted)]">
            TURN: {session.turnCount}
          </span>

          {/* Warning flash */}
          <AnimatePresence>
            {isWarning && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: [1, 0.3, 1] }}
                exit={{ opacity: 0 }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="text-[9px] font-mono font-bold text-red-400 uppercase"
              >
                ELEVATED THREAT LEVEL
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}
