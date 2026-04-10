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

// ── Extract clean statement text from potentially JSON-y content ───────────
function extractStatement(content: string): string {
  if (!content) return "";
  let text = content.trim();

  // Strip markdown formatting if present
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '').trim();
  }

  // If it looks like JSON
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.statement) return parsed.statement;
      if (parsed.content) return parsed.content;
      if (parsed.response) return parsed.response;
    } catch {
      // Fallback regex
      const match = text.match(/"statement"\s*:\s*"([\s\S]*?)(?:",\s*"internal_reasoning|"\s*})/);
      if (match) return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  return text;
}

// ─── Country panel sidebar item ────────────────────────────────────────────
function CountrySidebarItem({
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
  const stanceColor =
    aggression > 0.65 ? "#cc0000" : aggression < 0.35 ? "#1a3acc" : "#b36a00";
  const stanceDot =
    aggression > 0.65 ? "#ff4d4d" : aggression < 0.35 ? "#4a6eff" : "#f5a623";
  const stanceLabel =
    aggression > 0.65 ? "Aggressive" : aggression < 0.35 ? "Defending" : "Neutral";

  return (
    <motion.div
      animate={isSpeaking ? { backgroundColor: "#f0fffe" } : { backgroundColor: "#ffffff" }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3 px-3 py-3 cursor-pointer border-b"
      style={{ borderColor: "#f0f2f5" }}
    >
      {/* Flag + status */}
      <div className="relative flex-shrink-0">
        <img
          src={country.flagUrl}
          alt={country.name}
          className="w-11 h-11 rounded-full object-cover border-2"
          style={{ borderColor: isSpeaking ? "#00a884" : stanceDot + "60" }}
        />
        {/* Status dot */}
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
            isSpeaking || isThinking ? "online-pulse" : ""
          }`}
          style={{
            background: isSpeaking
              ? "#25d366"
              : isThinking
              ? "#f5a623"
              : stanceDot,
          }}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span
            className="text-[13.5px] font-semibold truncate"
            style={{ color: "#111b21" }}
          >
            {country.name}
          </span>
          {messageCount > 0 && (
            <span
              className="text-[10px] ml-1 flex-shrink-0"
              style={{ color: "#8696a0" }}
            >
              {messageCount} msgs
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isThinking ? (
            <p className="text-xs italic truncate" style={{ color: "#00a884" }}>
              typing...
            </p>
          ) : isSpeaking ? (
            <p className="text-xs italic truncate" style={{ color: "#00a884" }}>
              speaking now
            </p>
          ) : lastMessage ? (
            <p
              className="text-xs truncate"
              style={{ color: "#8696a0" }}
            >
              {lastMessage.slice(0, 38)}{lastMessage.length > 38 ? "…" : ""}
            </p>
          ) : (
            <p className="text-xs" style={{ color: "#8696a0" }}>
              {country.archetype}
            </p>
          )}
        </div>
        {/* Stance badge */}
        {messageCount > 0 && (
          <span
            className="inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full mt-1"
            style={{ color: stanceColor, background: stanceDot + "20" }}
          >
            {stanceLabel}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Tension bar in header ─────────────────────────────────────────────────
function TensionBar({ tension }: { tension: number }) {
  const color =
    tension > 0.7 ? "#ff4d4d" : tension > 0.4 ? "#f5a623" : "#25d366";
  const label =
    tension > 0.7 ? "HIGH TENSION" : tension > 0.4 ? "ELEVATED" : "STABLE";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold" style={{ color }}>
        {label}
      </span>
      <div
        className="w-24 h-1.5 rounded-full overflow-hidden"
        style={{ background: "#e9edef" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${tension * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px]" style={{ color: "#8696a0" }}>
        {(tension * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function WarRoom() {
  const [session, setSession] = useState<DebateSession>(createInitialSession());
  const [isConnected, setIsConnected] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<CountryCode | null>(null);
  const [thinkingAgent, setThinkingAgent] = useState<CountryCode | null>(null);
  const [isDebating, setIsDebating] = useState(false);
  const [systemLog, setSystemLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  // Per-country message counts and last messages
  const [countryLastMsg, setCountryLastMsg] = useState<
    Record<CountryCode, { text: string; count: number }>
  >(
    Object.fromEntries(COUNTRY_CODES.map((c) => [c, { text: "", count: 0 }])) as Record<
      CountryCode,
      { text: string; count: number }
    >
  );

  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    socket.connect();

    const unsubConnect = socket.on("_connected", () => setIsConnected(true));
    const unsubDisconnect = socket.on("_disconnected", () =>
      setIsConnected(false)
    );

    const unsubSystem = socket.on("system_message", (data: unknown) => {
      const d = data as { message: string };
      setSystemLog((prev) => [...prev.slice(-20), d.message]);
    });

    const unsubHeadline = socket.on("headline", (data: unknown) => {
      const d = data as { headline: string; source: string; sourceUrl?: string; summary: string };
      setSession((prev) => ({
        ...prev,
        headline: d.headline,
        headlineSource: d.sourceUrl || d.source,
        status: "active",
      }));
      setSystemLog((prev) => [...prev, `📰 Headline loaded: ${d.headline.slice(0, 50)}…`]);
    });

    const unsubThinking = socket.on("agent_thinking", (data: unknown) => {
      const d = data as { countryCode: CountryCode; reasoning: string };
      setThinkingAgent(d.countryCode);
    });

    const unsubParticipants = socket.on("participants_selected", (data: unknown) => {
      const d = data as { participants: CountryCode[] };
      setSession((prev) => ({
        ...prev,
        participants: d.participants,
      }));
      setSystemLog((prev) => [...prev, `👥 Active Nations: ${d.participants.map(c => c.toUpperCase()).join(", ")}`]);
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
      setSystemLog((prev) => [...prev, `✅ Debate ended: ${d.status}`]);
    });

    const unsubError = socket.on("error", (data: unknown) => {
      const d = data as { message: string };
      setSystemLog((prev) => [...prev, `❌ ERROR: ${d.message}`]);
      setIsDebating(false);
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubSystem();
      unsubHeadline();
      unsubThinking();
      unsubParticipants();
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
    setSystemLog([]);
    setCountryLastMsg(
      Object.fromEntries(
        COUNTRY_CODES.map((c) => [c, { text: "", count: 0 }])
      ) as Record<CountryCode, { text: string; count: number }>
    );
    setIsDebating(true);
    socketRef.current.startDebate();
  }, []);

  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: "#f0f2f5" }}
    >
      {/* ─── TOP HEADER ──────────────────────────────────── */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ background: "#ffffff", borderColor: "#e9edef", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <motion.div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold"
              style={{ background: "linear-gradient(135deg, #00a884, #128c7e)" }}
              animate={isDebating ? { scale: [1, 1.05, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              🌍
            </motion.div>
            <div>
              <h1 className="text-[15px] font-bold" style={{ color: "#111b21" }}>
                Project EMERGENCE
              </h1>
              <p className="text-[11px]" style={{ color: "#8696a0" }}>
                {isDebating
                  ? `${session.turnCount} turns · ${session.messages.length} messages`
                  : "Geopolitical Debate Sandbox"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tension bar */}
          {session.messages.length > 0 && (
            <TensionBar tension={session.globalTension} />
          )}

          {/* Connection pill */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{
              background: isConnected ? "#e7faf1" : "#fef0f0",
              color: isConnected ? "#00a884" : "#cc0000",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: isConnected ? "#25d366" : "#ff4d4d" }}
            />
            {isConnected ? "Connected" : "Offline"}
          </div>

          {/* Log toggle */}
          <button
            onClick={() => setShowLog((v) => !v)}
            className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
            style={{
              borderColor: "#e9edef",
              color: "#8696a0",
              background: showLog ? "#f0f2f5" : "white",
            }}
          >
            {showLog ? "Hide Log" : "System Log"}
          </button>

          {/* Initiate / debating button */}
          <motion.button
            onClick={startDebate}
            disabled={!isConnected || isDebating}
            whileHover={isConnected && !isDebating ? { scale: 1.03 } : {}}
            whileTap={isConnected && !isDebating ? { scale: 0.97 } : {}}
            className="px-4 py-2 rounded-full text-[13px] font-bold text-white transition-all"
            style={{
              background: isDebating
                ? "#8696a0"
                : isConnected
                ? "linear-gradient(135deg, #00a884, #128c7e)"
                : "#c9d3db",
              cursor: !isConnected || isDebating ? "not-allowed" : "pointer",
              boxShadow: isConnected && !isDebating ? "0 2px 8px rgba(0,168,132,0.35)" : "none",
            }}
          >
            {isDebating ? "⏳ In Progress…" : "▶ Initiate Debate"}
          </motion.button>
        </div>
      </header>

      {/* ─── MAIN LAYOUT ─────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar: Country List */}
        <aside
          className="w-72 flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ background: "#ffffff", borderColor: "#e9edef" }}
        >
          {/* Sidebar header */}
          <div
            className="px-3 py-2.5 border-b"
            style={{ borderColor: "#e9edef", background: "#f0f2f5" }}
          >
            <p
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "#8696a0" }}
            >
              Nation Agents · {session.participants.length}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {session.participants.map((code) => (
              <CountrySidebarItem
                key={code}
                code={code}
                isSpeaking={activeSpeaker === code}
                isThinking={thinkingAgent === code}
                aggression={session.aggressionScores[code] || 0}
                lastMessage={countryLastMsg[code]?.text || ""}
                messageCount={countryLastMsg[code]?.count || 0}
              />
            ))}
          </div>
        </aside>

        {/* Center: Chat + optional log */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Chat header (mimics WhatsApp top bar of a conversation) */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b"
            style={{ background: "#ffffff", borderColor: "#e9edef" }}
          >
            <div className="flex -space-x-2 mr-1">
              {session.participants.slice(0, 5).map((c) => (
                <img
                  key={c}
                  src={COUNTRIES[c].flagUrl}
                  alt={COUNTRIES[c].name}
                  className="w-6 h-6 rounded-full border-2 border-white object-cover"
                />
              ))}
            </div>
            <div className="flex-1">
              <p className="text-[13.5px] font-semibold" style={{ color: "#111b21" }}>
                Global Debate Room
              </p>
              <p className="text-[11px]" style={{ color: "#8696a0" }}>
                {isDebating
                  ? thinkingAgent
                    ? `${COUNTRIES[thinkingAgent]?.name} is typing...`
                    : activeSpeaker
                    ? `${COUNTRIES[activeSpeaker]?.name} is speaking`
                    : "Debate in progress"
                  : session.status === "idle"
                  ? "10 nations ready"
                  : `Session ended: ${session.status}`}
              </p>
            </div>
            {session.headlineSource && (
              <a
                href={session.headlineSource}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border hover:bg-[#f0f2f5] transition-colors"
                style={{ borderColor: "#e9edef", color: "#54656f" }}
              >
                View source
              </a>
            )}
            {/* Session badge */}
            {session.messages.length > 0 && (
              <span
                className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background:
                    session.status === "active"
                      ? "#e7faf1"
                      : session.status === "deadlock"
                      ? "#fef0f0"
                      : "#f0f2f5",
                  color:
                    session.status === "active"
                      ? "#00a884"
                      : session.status === "deadlock"
                      ? "#cc0000"
                      : "#54656f",
                }}
              >
                {session.status.toUpperCase()}
              </span>
            )}
          </div>

          {/* The chat feed */}
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

          {/* System log (collapsible bottom panel) */}
          <AnimatePresence>
            {showLog && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 100, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex-shrink-0 overflow-hidden border-t"
                style={{ background: "#1a1a2e", borderColor: "#2a2a4e" }}
              >
                <div className="h-full overflow-y-auto p-2">
                  {systemLog.length === 0 ? (
                    <p className="text-[11px] font-mono text-green-400 opacity-50">
                      System ready…
                    </p>
                  ) : (
                    systemLog.map((msg, i) => (
                      <p
                        key={i}
                        className="text-[11px] font-mono leading-5"
                        style={{
                          color: msg.startsWith("❌")
                            ? "#ff6b6b"
                            : msg.startsWith("✅")
                            ? "#25d366"
                            : msg.startsWith("📰")
                            ? "#f5a623"
                            : "#8aaabe",
                        }}
                      >
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

      {/* ─── BOTTOM STATUS BAR ───────────────────────────── */}
      <footer
        className="flex-shrink-0 px-4 py-1.5 flex items-center justify-between border-t"
        style={{ background: "#ffffff", borderColor: "#e9edef" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: "#8696a0" }}>
            EMERGENCE v0.1.0
          </span>
          <span className="text-[10px]" style={{ color: "#8696a0" }}>
            LangGraph · Ollama
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: "#8696a0" }}>
            Turn {session.turnCount}
          </span>
          <span className="text-[10px]" style={{ color: "#8696a0" }}>
            {session.messages.length} messages
          </span>
          <AnimatePresence>
            {session.globalTension > 0.7 && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: [1, 0.4, 1] }}
                exit={{ opacity: 0 }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="text-[10px] font-bold"
                style={{ color: "#ff4d4d" }}
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
