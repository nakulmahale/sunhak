"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DebateFeed from "@/components/DebateFeed";
import { getSocket } from "@/lib/socket";
import {
  DebateSession,
  DebateMessage,
  CountryCode,
  COUNTRY_CODES,
  COUNTRIES,
  createInitialSession,
} from "@/lib/types";

// ── Extract clean statement text ───────────────────────────────────────────
function extractStatement(content: string): string {
  if (!content) return "";
  let text = content.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "").trim();
  }
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.statement) return parsed.statement;
      if (parsed.content) return parsed.content;
      if (parsed.response) return parsed.response;
    } catch {
      const match = text.match(/"statement"\s*:\s*"([\s\S]*?)(?:",\s*"internal_reasoning|"\s*})/);
      if (match) return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  return text;
}

// ── Tension Bar ────────────────────────────────────────────────────────────
function TensionBar({ tension }: { tension: number }) {
  const color =
    tension > 0.7 ? "#ef4444" : tension > 0.4 ? "#f59e0b" : "#25d366";
  const label =
    tension > 0.7 ? "Critical" : tension > 0.4 ? "Elevated" : "Stable";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "#f0f2f5" }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      <span className="text-[11px] font-semibold" style={{ color }}>
        {label}
      </span>
      <div
        className="w-20 h-1.5 rounded-full overflow-hidden"
        style={{ background: "#e2e8f0" }}
      >
        <motion.div
          className="tension-fill"
          style={{ background: color }}
          animate={{ width: `${tension * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-[11px] font-medium" style={{ color: "#8696a0" }}>
        {(tension * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ── Sidebar Nation Item ────────────────────────────────────────────────────
function NationItem({
  code,
  isSpeaking,
  isThinking,
  aggression,
  lastMessage,
  messageCount,
}: {
  code: CountryCode;
  isSpeaking: boolean;
  isThinking: boolean;
  aggression: number;
  lastMessage: string;
  messageCount: number;
}) {
  const country = COUNTRIES[code];
  // Use aggressionBaseline when live score hasn't arrived yet
  const effectiveAggression = aggression > 0 ? aggression : country.aggressionBaseline;

  const dotColor = isSpeaking
    ? "#25d366"
    : isThinking
    ? "#f59e0b"
    : effectiveAggression > 0.65
    ? "#ef4444"
    : effectiveAggression < 0.35
    ? "#3b82f6"
    : "#8696a0";

  const aggressionLabel =
    effectiveAggression > 0.65
      ? "Aggressive"
      : effectiveAggression < 0.35
      ? "Peaceful"
      : "Neutral";

  const aggressionStyle =
    effectiveAggression > 0.65
      ? { color: "#c62828", bg: "#ffebee" }
      : effectiveAggression < 0.35
      ? { color: "#1565c0", bg: "#e3f2fd" }
      : { color: "#546e7a", bg: "#f5f5f5" };

  return (
    <motion.div
      className={`sidebar-item ${isSpeaking ? "active" : ""}`}
      animate={
        isSpeaking ? { backgroundColor: "#e4f0fb" } : { backgroundColor: "#f3f5f8" }
      }
      transition={{ duration: 0.25 }}
    >
      {/* Avatar + status */}
      <div className="relative flex-shrink-0">
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: `2px solid ${isSpeaking ? "#00a884" : "#e9edef"}`,
            overflow: "hidden",
            flexShrink: 0,
            position: "relative",
            background: "#f0f2f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Emoji fallback sits behind the image */}
          <span style={{ fontSize: 26, lineHeight: 1, position: "absolute" }}>
            {country.flagEmoji}
          </span>
          <img
            src={country.flagUrl}
            alt={country.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              position: "absolute",
              inset: 0,
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <span
          className={`status-dot ${isSpeaking || isThinking ? "pulse" : ""}`}
          style={{ background: dotColor, borderColor: "white" }}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: name + message count */}
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold truncate text-[#111b21]">
            {country.name}
          </span>
          {messageCount > 0 && (
            <span className="unread-badge">{messageCount}</span>
          )}
        </div>

        {/* Row 2: status text */}
        <p
          className="text-[12px] truncate mt-0.5"
          style={{
            color: isSpeaking || isThinking ? "#00a884" : "#8696a0",
            fontStyle: isSpeaking || isThinking ? "italic" : "normal",
          }}
        >
          {isThinking
            ? "typing..."
            : isSpeaking
            ? "speaking now"
            : lastMessage
            ? lastMessage.slice(0, 40) + (lastMessage.length > 40 ? "…" : "")
            : country.archetype || "Standing by"}
        </p>

        {/* Row 3: stance badge (only when active) */}
        {messageCount > 0 && (
          <span
            className="stance-badge mt-1"
            style={{
              background: aggressionStyle.bg,
              color: aggressionStyle.color,
              border: `1px solid ${aggressionStyle.color}30`,
            }}
          >
            {aggressionLabel}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function WarRoom() {
  const [session, setSession] = useState<DebateSession>(createInitialSession());
  const [isConnected, setIsConnected] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<CountryCode | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<CountryCode | null>(null);
  const [isDebating, setIsDebating] = useState(false);
  const [systemLog, setSystemLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const [countryLastMsg, setCountryLastMsg] = useState<
    Record<CountryCode, { text: string; count: number }>
  >(
    Object.fromEntries(
      COUNTRY_CODES.map((c) => [c, { text: "", count: 0 }])
    ) as Record<CountryCode, { text: string; count: number }>
  );

  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    socket.connect();

    const unsubConnect = socket.on("_connected", () => setIsConnected(true));
    const unsubDisconnect = socket.on("_disconnected", () => setIsConnected(false));
    const unsubSystem = socket.on("system_message", (data: unknown) => {
      const d = data as { message: string };
      setSystemLog((prev) => [...prev.slice(-30), d.message]);
    });
    const unsubHeadline = socket.on("headline", (data: unknown) => {
      const d = data as { headline: string; source: string; sourceUrl?: string; summary: string };
      setSession((prev) => ({
        ...prev,
        headline: d.headline,
        headlineSource: d.sourceUrl || d.source,
        status: "active",
      }));
      setSystemLog((prev) => [...prev, `📰 ${d.headline.slice(0, 60)}…`]);
    });
    const unsubThinking = socket.on("agent_thinking", (data: unknown) => {
      const d = data as { countryCode: CountryCode; reasoning: string };
      setThinkingAgent(d.countryCode);
    });
    const unsubParticipants = socket.on("participants_selected", (data: unknown) => {
      const d = data as { participants: CountryCode[] };
      setSession((prev) => ({ ...prev, participants: d.participants }));
      setSystemLog((prev) => [
        ...prev,
        `👥 Nations: ${d.participants.map((c) => c.toUpperCase()).join(", ")}`,
      ]);
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
      setCountryLastMsg((prev) => ({
        ...prev,
        [d.message.countryCode]: {
          text: extractStatement(d.message.content),
          count: (prev[d.message.countryCode]?.count || 0) + 1,
        },
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
      setSystemLog((prev) => [...prev, `✅ Session ended: ${d.status}`]);
    });
    const unsubError = socket.on("error", (data: unknown) => {
      const d = data as { message: string };
      setSystemLog((prev) => [...prev, `❌ ${d.message}`]);
      setIsDebating(false);
    });

    return () => {
      unsubConnect(); unsubDisconnect(); unsubSystem(); unsubHeadline();
      unsubThinking(); unsubParticipants(); unsubSpeaking();
      unsubTension(); unsubEnd(); unsubError();
      socket.disconnect();
    };
  }, []);

  const startDebate = useCallback(() => {
    setSession(createInitialSession());
    setActiveSpeaker(null);
    setThinkingAgent(null);
    setSystemLog([]);
    setCountryLastMsg(
      Object.fromEntries(
        COUNTRY_CODES.map((c) => [c, { text: "", count: 0 }])
      ) as Record<CountryCode, { text: string; count: number }>
    );
    setIsDebating(true);
    socketRef.current.startDebate();
  }, []);

  // -- Auto-start the first session once connected -------------------------
  useEffect(() => {
    if (isConnected && !isDebating && session.status === "idle" && session.messages.length === 0) {
      // Short delay to allow UI to stabilize
      const timer = setTimeout(() => {
        console.log("🚀 Auto-initiating debate session...");
        setSystemLog(prev => [...prev, "🚀 System Auto-Initiate: Starting simulation..."]);
        startDebate();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isDebating, session.status, session.messages.length, startDebate]);

  // Only show nations after a session starts (participants_selected fires first)
  const activeNations = session.participants.filter(
    (c) => isDebating || session.status !== "idle"
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#f0f2f5" }}>

      {/* ── TOP HEADER ──────────────────────────────────────────────── */}
      <header className="app-header">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <motion.div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #00a884, #128c7e)" }}
            animate={isDebating ? { scale: [1, 1.04, 1] } : {}}
            transition={{ repeat: Infinity, duration: 2.5 }}
          >
            🌍
          </motion.div>
          <div>
            <h1 className="text-[15px] font-bold text-[#111b21] leading-tight">
              Project EMERGENCE
            </h1>
            <p className="text-[11px] text-[#8696a0]">
              {isDebating
                ? `Turn ${session.turnCount} · ${session.messages.length} messages`
                : "Geopolitical Debate Sandbox"}
            </p>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2.5">
          {/* Tension bar (when active) */}
          <AnimatePresence>
            {session.messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <TensionBar tension={session.globalTension} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Separator */}
          <div className="h-6 w-px bg-[#e9edef]" />

          {/* Connection status */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
            style={{
              background: isConnected ? "#e8f5e9" : "#fce4ec",
              color: isConnected ? "#2e7d32" : "#c62828",
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isConnected ? "pulse" : ""}`}
              style={{ background: isConnected ? "#25d366" : "#ef5350" }}
            />
            {isConnected ? "Online" : "Offline"}
          </div>

          {/* System log toggle */}
          <button
            onClick={() => setShowLog((v) => !v)}
            className="pill-btn pill-btn-secondary text-[11px]"
          >
            {showLog ? "Hide Log" : "System Log"}
          </button>

          {/* Launch button */}
          <motion.button
            onClick={startDebate}
            disabled={!isConnected || isDebating}
            className="pill-btn pill-btn-primary"
            whileHover={isConnected && !isDebating ? { scale: 1.03 } : {}}
            whileTap={isConnected && !isDebating ? { scale: 0.97 } : {}}
            style={{
              background:
                isDebating || !isConnected
                  ? "#c5cbd1"
                  : "linear-gradient(135deg, #00a884, #128c7e)",
            }}
          >
            {isDebating ? "⏳ Simulating…" : session.messages.length > 0 ? "▶ New Session" : "▶ Launch Session"}
          </motion.button>
        </div>
      </header>

      {/* ── MAIN BODY ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── LEFT SIDEBAR (Nations panel) ─────────────────────────── */}
        <aside
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            width: 288,
            background: "#f3f5f8",
            borderRight: "1.5px solid #c0c5cc",
            boxShadow: "3px 0 16px rgba(0,0,0,0.10)",
            zIndex: 5,
          }}
        >
          {/* Sidebar header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              height: 48,
              background: "#e8ebef",
              borderBottom: "1.5px solid #c0c5cc",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#54656f" }}>
              Nation Agents
            </span>
            <span style={{ padding: "2px 9px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 10, fontWeight: 700 }}>
              {activeNations.length} Active
            </span>
          </div>

          {/* Nation list */}
          <div className="flex-1 overflow-y-auto">
            {activeNations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 py-8">
                <span className="text-3xl">🗺️</span>
                <p className="text-[12px] text-[#8696a0]">
                  Nations will appear once a session is launched
                </p>
              </div>
            ) : (
              activeNations.map((code) => (
                <NationItem
                  key={code}
                  code={code}
                  isSpeaking={activeSpeaker === code}
                  isThinking={thinkingAgent === code}
                  aggression={session.aggressionScores[code] || 0}
                  lastMessage={countryLastMsg[code]?.text || ""}
                  messageCount={countryLastMsg[code]?.count || 0}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── CENTER (Chat area) ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Chat top bar */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-4 border-b"
            style={{
              height: 56,
              background: "#ffffff",
              borderColor: "#e9edef",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            {/* Stacked avatars */}
            <div className="flex -space-x-2 flex-shrink-0">
              {activeNations.slice(0, 5).map((c) => (
                <div
                  key={c}
                  style={{
                    width: 30, height: 30, borderRadius: "50%",
                    border: "2px solid white", overflow: "hidden",
                    position: "relative", background: "#f0f2f5",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1, position: "absolute" }}>
                    {COUNTRIES[c].flagEmoji}
                  </span>
                  <img
                    src={COUNTRIES[c].flagUrl}
                    alt={COUNTRIES[c].name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ))}
              {activeNations.length > 5 && (
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "2px solid white",
                    background: "#e9edef",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#54656f",
                  }}
                >
                  +{activeNations.length - 5}
                </div>
              )}
            </div>

            {/* Room name + status */}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-[#111b21]">
                Global War Room
              </p>
              <p className="text-[11.5px] text-[#8696a0] truncate">
                {isDebating
                  ? thinkingAgent
                    ? `${COUNTRIES[thinkingAgent]?.name} is analyzing...`
                    : activeSpeaker
                    ? `${COUNTRIES[activeSpeaker]?.name} is speaking`
                    : "Session in progress"
                  : session.status === "idle"
                  ? `${activeNations.length} nations ready`
                  : `Session ended · ${session.status}`}
              </p>
            </div>

            {/* Status badge */}
            {session.messages.length > 0 && (
              <span
                className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
                style={{
                  background:
                    session.status === "active"
                      ? "#e8f5e9"
                      : session.status === "deadlock"
                      ? "#ffebee"
                      : "#f5f5f5",
                  color:
                    session.status === "active"
                      ? "#2e7d32"
                      : session.status === "deadlock"
                      ? "#c62828"
                      : "#546e7a",
                }}
              >
                {session.status}
              </span>
            )}

            {/* Source link */}
            {session.headlineSource &&
              !session.headlineSource.includes("Synthetic") && (
                <a
                  href={session.headlineSource}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors hover:bg-[#f0f2f5]"
                  style={{ borderColor: "#e9edef", color: "#54656f" }}
                >
                  Intel Source
                </a>
              )}
          </div>

          {/* Chat feed */}
          <div className="flex-1 overflow-hidden min-h-0">
            <DebateFeed
              messages={session.messages}
              headline={session.headline}
              headlineSource={session.headlineSource}
              status={session.status}
              afterActionReport={session.afterActionReport}
              thinkingAgent={thinkingAgent}
            />
          </div>

          {/* System log panel */}
          <AnimatePresence>
            {showLog && (
              <motion.div
                key="syslog"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 110, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex-shrink-0 overflow-hidden sys-log border-t"
                style={{ borderColor: "#1e293b" }}
              >
                <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: "#1e293b", background: "#0f172a" }}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Diagnostic Console
                  </p>
                  <button
                    onClick={() => setShowLog(false)}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <div className="h-[calc(100%-30px)] overflow-y-auto p-2.5">
                  {systemLog.length === 0 ? (
                    <p className="text-[11px] text-emerald-400 opacity-50">
                      &gt; Waiting for telemetry…
                    </p>
                  ) : (
                    systemLog.map((msg, i) => (
                      <p
                        key={i}
                        className="text-[11px] leading-5"
                        style={{
                          color: msg.startsWith("❌")
                            ? "#f87171"
                            : msg.startsWith("✅")
                            ? "#34d399"
                            : msg.startsWith("📰")
                            ? "#fbbf24"
                            : "#94a3b8",
                        }}
                      >
                        <span className="text-slate-600 mr-2">
                          {new Date().toLocaleTimeString([], {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        {msg}
                      </p>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── BOTTOM STATUS BAR ───────────────────────────────────────── */}
      <footer
        className="flex-shrink-0 flex items-center justify-between px-4 border-t"
        style={{
          height: 36,
          background: "#ffffff",
          borderColor: "#e9edef",
        }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-medium text-[#8696a0]">EMERGENCE v0.1.0</span>
          <span className="text-[10px] text-[#c5cbd1]">·</span>
          <span className="text-[10px] text-[#8696a0]">LangGraph · Ollama</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[#8696a0]">
            Turn {session.turnCount}
          </span>
          <span className="text-[10px] text-[#8696a0]">
            {session.messages.length} messages
          </span>
          <AnimatePresence>
            {session.globalTension > 0.7 && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: [1, 0.5, 1] }}
                exit={{ opacity: 0 }}
                transition={{ repeat: Infinity, duration: 0.9 }}
                className="text-[10px] font-bold text-red-500"
              >
                ⚡ HIGH TENSION
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}