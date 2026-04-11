"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DebateMessage, COUNTRIES, CountryCode } from "@/lib/types";

interface DebateFeedProps {
  messages: DebateMessage[];
  headline: string;
  headlineSource: string;
  status: string;
  afterActionReport: string | null;
  thinkingAgent?: CountryCode | null;
}

// ── Typewriter text ────────────────────────────────────────────────────────
function TypewriterText({ text, speed = 12 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(timer); setDone(true); }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && <span className="blink-cursor" />}
    </span>
  );
}

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
    } catch { /* proceed */ }
  }
  const keysToParse = ["statement", "stance", "reply_to_id", "replyToId"];
  keysToParse.forEach((key) => {
    text = text.replace(new RegExp(`"?${key}"?\\s*:\\s*"([^"]*)"`, "gi"), "");
    text = text.replace(new RegExp(`\\[${key}\\s*:\\s*([^\\]]*)\\]`, "gi"), "");
  });
  return text
    .replace(/\[STATEMENT\]/gi, "")
    .replace(/\[STANCE:[^\]]*\]/gi, "")
    .replace(/\[REPLY_TO_ID:[^\]]*\]/gi, "")
    .replace(/^["{]+|["}]+$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();
}

// ── Stance styling ─────────────────────────────────────────────────────────
function getStanceStyle(stance?: string): { bg: string; color: string; border: string } {
  const s = (stance || "").toLowerCase();
  if (s.includes("agree") || s.includes("support"))
    return { bg: "#e8f5e9", color: "#2e7d32", border: "#a5d6a7" };
  if (s.includes("refut") || s.includes("disagree") || s.includes("provoc") || s.includes("attack"))
    return { bg: "#ffebee", color: "#c62828", border: "#ef9a9a" };
  if (s.includes("defend") || s.includes("neutral"))
    return { bg: "#e3f2fd", color: "#1565c0", border: "#90caf9" };
  return { bg: "#f5f5f5", color: "#546e7a", border: "#cfd8dc" };
}

// ── Date separator ─────────────────────────────────────────────────────────
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-4 px-4">
      <div className="px-3 py-1 rounded-full text-xs font-medium text-[#667781] bg-[#e9edef]">
        {label}
      </div>
    </div>
  );
}

// ── Chat Bubble ────────────────────────────────────────────────────────────
function ChatBubble({
  message,
  isRight,
  isLatest,
  replyToMessage,
}: {
  message: DebateMessage;
  isRight: boolean;
  isLatest: boolean;
  replyToMessage?: DebateMessage;
}) {
  const country = COUNTRIES[message.countryCode as CountryCode];
  const time = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isAggressive = message.aggressionScore >= 0.6;
  const stanceStyle = getStanceStyle(message.stance);
  const bubbleClass = isAggressive
    ? isRight ? "bubble-out aggressive" : "bubble-in aggressive"
    : isRight ? "bubble-out" : "bubble-in";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`flex ${isRight ? "flex-row-reverse" : "flex-row"} items-end gap-2 mb-1.5 px-3`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 relative mb-0.5">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `2px solid ${isAggressive ? "#ff4d4d" : isRight ? "#d9fdd3" : "#e9edef"}`,
            overflow: "hidden",
            position: "relative",
            background: "#f0f2f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1, position: "absolute" }}>
            {message.flagEmoji || country?.flagEmoji}
          </span>
          <img
            src={country?.flagUrl}
            alt={country?.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        {isAggressive && (
          <span
            className="status-dot pulse"
            style={{ background: "#ff4d4d", borderColor: "white" }}
          />
        )}
      </div>

      {/* Bubble content */}
      <div
        className={`max-w-[72%] flex flex-col ${isRight ? "items-end" : "items-start"}`}
      >
        {/* Country name + stance */}
        <div className={`flex items-center gap-2 mb-1 px-1 ${isRight ? "flex-row-reverse" : "flex-row"}`}>
          <span
            className="text-[12px] font-semibold"
            style={{ color: isAggressive ? "#c62828" : "#00a884" }}
          >
            {message.countryName}
          </span>
          {message.stance && (
            <span
              className="stance-badge"
              style={{
                background: stanceStyle.bg,
                color: stanceStyle.color,
                border: `1px solid ${stanceStyle.border}`,
              }}
            >
              {message.stance}
            </span>
          )}
        </div>

        {/* Bubble */}
        <div className={`${bubbleClass} px-3 py-2.5 max-w-full`}>
          {/* Reply preview */}
          {replyToMessage && (
            <div className="reply-preview mb-2">
              <span className="font-semibold text-[var(--wa-teal)]">
                {replyToMessage.countryName}
              </span>
              <p className="mt-0.5 line-clamp-2">
                {extractStatement(replyToMessage.content).slice(0, 80)}…
              </p>
            </div>
          )}

          {/* Message text */}
          <p className="text-[13.5px] leading-relaxed text-[#111b21]">
            {isLatest ? (
              <TypewriterText text={extractStatement(message.content)} />
            ) : (
              extractStatement(message.content)
            )}
          </p>

          {/* Time + tension indicator */}
          <div className={`flex items-center gap-1.5 mt-1.5 ${isRight ? "justify-end" : "justify-start"}`}>
            {isAggressive && (
              <span className="text-[10px] font-bold text-red-500">⚡</span>
            )}
            <span className="text-[11px] text-[#8696a0]">{time}</span>
            {isRight && (
              <svg width="14" height="10" viewBox="0 0 16 11" fill="none">
                <path d="M1 5.5L5 9.5L10 1.5M6 9.5L15 1.5" stroke="#25d366" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Typing Indicator ───────────────────────────────────────────────────────
function TypingIndicator({ countryCode }: { countryCode: CountryCode }) {
  const country = COUNTRIES[countryCode];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="flex flex-row items-end gap-2 mb-2 px-3"
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "2px solid #e9edef", overflow: "hidden",
          position: "relative", background: "#f0f2f5",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1, position: "absolute" }}>{country?.flagEmoji}</span>
        <img
          src={country?.flagUrl}
          alt={country?.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>
      <div className="bubble-in px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="typing-dot w-2 h-2 rounded-full bg-[#8696a0]"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
      <span className="text-[11px] text-[#8696a0] mb-1">{country?.name}</span>
    </motion.div>
  );
}

// ── Main feed ──────────────────────────────────────────────────────────────
export default function DebateFeed({
  messages,
  headline,
  headlineSource,
  status,
  afterActionReport,
  thinkingAgent,
}: DebateFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, thinkingAgent]);

  // Group messages showing date only once per session (they're all live)
  const sessionStart = messages[0]
    ? new Date(messages[0].timestamp).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "Today";

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "#efeae2" }}
    >
      {/* Topic banner */}
      {headline && (
        <div
          className="flex-shrink-0 px-4 py-2.5 text-center border-b"
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
            borderColor: "#d1d5db",
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#8696a0] mb-0.5">
            Active Topic
          </p>
          <p className="text-[13px] font-semibold text-[#111b21] leading-snug">
            {headline}
          </p>
          {headlineSource && (
            <a
              href={headlineSource}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#00a884] hover:underline mt-0.5 inline-block"
            >
              View Source →
            </a>
          )}
        </div>
      )}

      {/* Messages feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto py-3"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4d0cb' fill-opacity='0.18'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {/* Empty state */}
        {messages.length === 0 && !thinkingAgent && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-3xl shadow-sm">
              🌍
            </div>
            <p className="text-[14px] font-semibold text-[#54656f]">
              Global War Room
            </p>
            <p className="text-[12px] text-[#8696a0]">
              Launch a session to begin the geopolitical debate simulation
            </p>
          </div>
        )}

        {/* Date separator */}
        {messages.length > 0 && <DateSeparator label={sessionStart} />}

        {/* Message bubbles */}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const replyTo = messages.find(
              (m) =>
                m.id === msg.replyToId ||
                (msg.replyToId && m.countryCode === msg.replyToId.toLowerCase())
            );
            return (
              <ChatBubble
                key={msg.id || i}
                message={msg}
                isRight={i % 2 === 1}
                isLatest={i === messages.length - 1}
                replyToMessage={replyTo}
              />
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {thinkingAgent && (
            <TypingIndicator key="typing" countryCode={thinkingAgent} />
          )}
        </AnimatePresence>

        {/* Session ended spacer */}
        {status !== "idle" && status !== "active" && messages.length > 0 && (
          <DateSeparator label={`Session ${status}`} />
        )}

        {/* After-action report */}
        <AnimatePresence>
          {afterActionReport && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="aar-card mx-3 mt-2 mb-4"
            >
              <div className="aar-header">
                <span>📋</span>
                After-Action Report
              </div>
              <div className="aar-body">{afterActionReport}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}