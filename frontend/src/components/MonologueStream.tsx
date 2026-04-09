"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface MonologueStreamProps {
  activeSpeaker: string | null;
  reasoning: string;
}

export default function MonologueStream({
  activeSpeaker,
  reasoning,
}: MonologueStreamProps) {
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [reasoning]);

  // Split reasoning into lines for terminal effect
  const lines = reasoning
    ? reasoning.split(/[.\n]/).filter((l) => l.trim())
    : [];

  return (
    <div className="glass-card flex flex-col h-full">
      {/* Header */}
      <div className="p-2 border-b border-[var(--border-subtle)] flex items-center gap-2">
        <div
          className={`status-dot ${reasoning ? "bg-green-400" : "bg-[var(--text-muted)]"}`}
        />
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">
          Internal Monologue
        </h3>
        {activeSpeaker && (
          <span className="text-[9px] font-mono text-amber-400 ml-auto uppercase">
            {activeSpeaker}
          </span>
        )}
      </div>

      {/* Terminal */}
      <div
        ref={termRef}
        className="flex-1 overflow-y-auto p-3 bg-black/30"
        style={{ scrollBehavior: "smooth" }}
      >
        {!reasoning && (
          <div className="terminal-text opacity-50">
            <p>$ agent_system --standby</p>
            <p>Awaiting agent activation...</p>
            <p className="typewriter-cursor">&gt; </p>
          </div>
        )}

        {lines.map((line, i) => (
          <motion.div
            key={`${activeSpeaker}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            className="terminal-text mb-1"
          >
            <span className="text-cyan-600 mr-1">&gt;</span>
            <span>{line.trim()}</span>
          </motion.div>
        ))}

        {reasoning && (
          <div className="terminal-text mt-2 opacity-70 typewriter-cursor">
            &gt;{" "}
          </div>
        )}
      </div>
    </div>
  );
}
