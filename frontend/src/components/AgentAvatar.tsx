"use client";

import { motion, AnimatePresence } from "framer-motion";
import { COUNTRIES, CountryCode } from "@/lib/types";

interface AgentAvatarProps {
  code: CountryCode;
  isSpeaking: boolean;
  isThinking: boolean;
  aggression: number;
  size?: "sm" | "md" | "lg";
}

export default function AgentAvatar({
  code,
  isSpeaking,
  isThinking,
  aggression,
  size = "md",
}: AgentAvatarProps) {
  const country = COUNTRIES[code];
  if (!country) return null;

  const sizeClasses = {
    sm: "w-10 h-10 text-lg",
    md: "w-14 h-14 text-2xl",
    lg: "w-18 h-18 text-3xl",
  };

  const aggressionColor =
    aggression > 0.7
      ? "border-red-500/60"
      : aggression > 0.4
        ? "border-amber-500/40"
        : "border-cyan-500/30";

  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      animate={
        isSpeaking
          ? { scale: [1, 1.08, 1], transition: { repeat: Infinity, duration: 1.5 } }
          : isThinking
            ? { opacity: [1, 0.6, 1], transition: { repeat: Infinity, duration: 0.8 } }
            : {}
      }
    >
      <div className="relative">
        {/* Pulse ring when speaking */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              className="absolute inset-0 rounded-full bg-cyan-400/20"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* Avatar circle */}
        <div
          className={`${sizeClasses[size]} rounded-full border-2 ${aggressionColor} 
            flex items-center justify-center bg-[var(--bg-card)] relative z-10
            ${isSpeaking ? "pulse-active" : ""}`}
        >
          <span role="img" aria-label={country.name}>
            {country.flagEmoji}
          </span>
        </div>

        {/* Thinking indicator */}
        {isThinking && (
          <motion.div
            className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-400 rounded-full z-20 flex items-center justify-center"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 0.6 }}
          >
            <span className="text-[8px]">💭</span>
          </motion.div>
        )}
      </div>

      {/* Name label */}
      <span
        className={`text-[10px] font-mono uppercase tracking-wider
          ${isSpeaking ? "text-cyan-400" : "text-[var(--text-muted)]"}`}
      >
        {code === "north_korea" ? "DPRK" : code.toUpperCase()}
      </span>
    </motion.div>
  );
}
