"use client";

import { motion, AnimatePresence } from "framer-motion";
import AgentAvatar from "./AgentAvatar";
import { COUNTRIES, COUNTRY_CODES, CountryCode } from "@/lib/types";

interface AgentArenaProps {
  activeSpeaker: CountryCode | null;
  thinkingAgent: CountryCode | null;
  aggressionScores: Record<CountryCode, number>;
}

export default function AgentArena({
  activeSpeaker,
  thinkingAgent,
  aggressionScores,
}: AgentArenaProps) {
  // Layout: two rows of 5 agents
  const topRow = COUNTRY_CODES.slice(0, 5);
  const bottomRow = COUNTRY_CODES.slice(5, 10);

  return (
    <div className="glass-card p-3 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className={`status-dot ${activeSpeaker ? "bg-cyan-400" : "bg-[var(--text-muted)]"}`}
        />
        <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--text-secondary)]">
          Agent Arena
        </h3>
        {activeSpeaker && (
          <span className="text-[10px] font-mono text-cyan-400 ml-auto">
            {COUNTRIES[activeSpeaker]?.name} SPEAKING
          </span>
        )}
      </div>

      {/* Agent Grid */}
      <div className="flex-1 flex flex-col justify-center gap-4">
        {/* Top row */}
        <div className="flex justify-around items-center">
          {topRow.map((code) => (
            <AgentAvatar
              key={code}
              code={code}
              isSpeaking={activeSpeaker === code}
              isThinking={thinkingAgent === code}
              aggression={aggressionScores[code] || 0}
              size="md"
            />
          ))}
        </div>

        {/* Divider */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-[var(--border-subtle)] to-transparent" />

        {/* Bottom row */}
        <div className="flex justify-around items-center">
          {bottomRow.map((code) => (
            <AgentAvatar
              key={code}
              code={code}
              isSpeaking={activeSpeaker === code}
              isThinking={thinkingAgent === code}
              aggression={aggressionScores[code] || 0}
              size="md"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
