"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

interface StressDialProps {
  tension: number; // 0.0 - 1.0
  turnCount: number;
}

export default function StressDial({ tension, turnCount }: StressDialProps) {
  // Determine color and label based on tension level
  const { color, bgColor, label, glowColor } = useMemo(() => {
    if (tension > 0.8)
      return {
        color: "#ef4444",
        bgColor: "rgba(239,68,68,0.15)",
        label: "CRITICAL",
        glowColor: "rgba(239,68,68,0.4)",
      };
    if (tension > 0.6)
      return {
        color: "#f59e0b",
        bgColor: "rgba(245,158,11,0.15)",
        label: "ELEVATED",
        glowColor: "rgba(245,158,11,0.3)",
      };
    if (tension > 0.35)
      return {
        color: "#3b82f6",
        bgColor: "rgba(59,130,246,0.15)",
        label: "MODERATE",
        glowColor: "rgba(59,130,246,0.2)",
      };
    return {
      color: "#10b981",
      bgColor: "rgba(16,185,129,0.15)",
      label: "STABLE",
      glowColor: "rgba(16,185,129,0.2)",
    };
  }, [tension]);

  // SVG gauge parameters
  const radius = 60;
  const strokeWidth = 8;
  const circumference = Math.PI * radius; // Half circle
  const progress = tension * circumference;

  return (
    <div className="glass-card p-3 h-full flex flex-col items-center justify-center">
      {/* Title */}
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] mb-2">
        Geopolitical Stress Index
      </h3>

      {/* Gauge */}
      <div className="relative w-40 h-24">
        <svg
          viewBox="0 0 140 80"
          className="w-full h-full"
          style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
        >
          {/* Background track */}
          <path
            d="M 10 70 A 60 60 0 0 1 130 70"
            fill="none"
            stroke="rgba(100,180,255,0.1)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Progress arc */}
          <motion.path
            d="M 10 70 A 60 60 0 0 1 130 70"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - progress }}
            transition={{ duration: 1, ease: "easeOut" }}
          />

          {/* Tick marks */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const angle = Math.PI * (1 - t);
            const x1 = 70 + 52 * Math.cos(angle);
            const y1 = 70 - 52 * Math.sin(angle);
            const x2 = 70 + 48 * Math.cos(angle);
            const y2 = 70 - 48 * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(100,180,255,0.3)"
                strokeWidth={1}
              />
            );
          })}
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <motion.span
            className="text-2xl font-bold font-mono"
            style={{ color }}
            animate={{ scale: tension > 0.7 ? [1, 1.05, 1] : 1 }}
            transition={{
              repeat: tension > 0.7 ? Infinity : 0,
              duration: 0.8,
            }}
          >
            {(tension * 100).toFixed(0)}
          </motion.span>
        </div>
      </div>

      {/* Status badge */}
      <motion.div
        className="mt-1 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest"
        style={{ backgroundColor: bgColor, color }}
        animate={
          tension > 0.7
            ? { opacity: [1, 0.6, 1] }
            : {}
        }
        transition={{ repeat: Infinity, duration: 1 }}
      >
        {label}
      </motion.div>

      {/* Turn counter */}
      <div className="mt-2 text-[10px] font-mono text-[var(--text-muted)]">
        TURN {turnCount}
      </div>
    </div>
  );
}
