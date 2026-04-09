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
}

function TypewriterText({ text, speed = 15 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && <span className="typewriter-cursor" />}
    </span>
  );
}

function MessageBubble({ message, isLatest }: { message: DebateMessage; isLatest: boolean }) {
  const country = COUNTRIES[message.countryCode as CountryCode];
  const time = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const aggressionBar =
    message.aggressionScore > 0.7
      ? "bg-red-500"
      : message.aggressionScore > 0.4
        ? "bg-amber-500"
        : "bg-cyan-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="group relative"
    >
      <div className="flex gap-3 p-3 rounded-lg hover:bg-white/[0.02] transition-colors">
        {/* Flag / Avatar */}
        <div className="flex-shrink-0 pt-1">
          <div className="w-10 h-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-center justify-center text-xl">
            {message.flagEmoji}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {message.countryName}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {time}
            </span>
            {/* Aggression indicator */}
            <div className="flex items-center gap-1 ml-auto">
              <div className="w-16 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${aggressionBar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${message.aggressionScore * 100}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                {(message.aggressionScore * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Message text */}
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {isLatest ? (
              <TypewriterText text={message.content} speed={8} />
            ) : (
              message.content
            )}
          </div>

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {message.citations.map((cite, i) => (
                <span
                  key={i}
                  className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/20"
                >
                  {cite}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Separator */}
      <div className="ml-16 h-[1px] bg-[var(--border-subtle)] opacity-50" />
    </motion.div>
  );
}

export default function DebateFeed({
  messages,
  headline,
  headlineSource,
  status,
  afterActionReport,
}: DebateFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="glass-card-glow flex flex-col h-full scanlines">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`status-dot ${status === "active" ? "bg-green-400" : status === "idle" ? "bg-[var(--text-muted)]" : "bg-red-400"}`}
            />
            <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--text-secondary)]">
              Live Debate Feed
            </h2>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {status === "active"
              ? `LIVE | ${messages.length} MSGS`
              : status.toUpperCase()}
          </span>
        </div>

        {/* Headline bar */}
        {headline && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 p-2 rounded-md bg-cyan-500/5 border border-cyan-500/15"
          >
            <div className="text-[10px] font-mono text-cyan-400 mb-0.5">
              CATALYST HEADLINE
            </div>
            <div className="text-xs text-[var(--text-primary)] font-medium">
              {headline}
            </div>
            {headlineSource && (
              <div className="text-[9px] font-mono text-[var(--text-muted)] mt-0.5">
                Source: {headlineSource}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto p-2 space-y-0"
        style={{ scrollBehavior: "smooth" }}
      >
        {messages.length === 0 && status === "idle" && (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm font-mono">
            Awaiting debate initiation...
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id || i}
              message={msg}
              isLatest={i === messages.length - 1}
            />
          ))}
        </AnimatePresence>

        {/* After-action report */}
        {afterActionReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="m-3 p-4 rounded-lg border-2 border-amber-500/30 bg-amber-500/5"
          >
            <div className="text-xs font-mono text-amber-400 mb-2 uppercase tracking-wider">
              After-Action Report
            </div>
            <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {afterActionReport}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
