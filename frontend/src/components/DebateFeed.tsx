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

function TypewriterText({ text, speed = 14 }: { text: string; speed?: number }) {
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
      {!done && <span className="blink-cursor" />}
    </span>
  );
}

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

function ChatBubble({ message, isRight, isLatest }: { message: DebateMessage; isRight: boolean; isLatest: boolean }) {
  const country = COUNTRIES[message.countryCode as CountryCode];
  const time = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Strong red accent when aggression is high (clear "fighting" visual).
  const aggressionColor = message.aggressionScore >= 0.55 ? "#ff1f1f" : "#4a6eff";
  const isBadTone = message.aggressionScore >= 0.65;
  const bubbleBg = "#ffffff";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isRight ? "flex-row-reverse" : "flex-row"} items-end gap-2 mb-3 px-4 slide-up`}
    >
      {/* Flag Avatar */}
      <div className="flex-shrink-0 relative">
        <img
          src={country?.flagUrl}
          alt={country?.name}
          className="flag-avatar w-9 h-9 border-2"
          style={{ borderColor: aggressionColor }}
        />
        {isBadTone && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
            style={{ background: "#ff4d4d" }}
            title="Bad tone"
          />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isRight ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        <span className="text-[11px] font-semibold px-1 flex items-center gap-1.5" style={{ color: aggressionColor }}>
          {message.countryName}
          {isBadTone && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#ff4d4d" }} />}
        </span>
        <div 
          className="bubble px-3 py-2 border"
          style={{
            background: bubbleBg,
            borderColor: message.aggressionScore >= 0.55 ? "#ff1f1f55" : "#e9edef",
            boxShadow: message.aggressionScore >= 0.55 ? "0 2px 10px rgba(255,31,31,0.12)" : "0 1px 1px rgba(0,0,0,0.06)",
          }}
        >
          <div className="text-[13.5px] leading-snug">
            {isLatest ? (
              <TypewriterText text={extractStatement(message.content)} />
            ) : (
              extractStatement(message.content)
            )}
          </div>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-gray-500">{time}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function TypingIndicator({ countryCode, isRight }: { countryCode: CountryCode; isRight: boolean }) {
  const country = COUNTRIES[countryCode];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex ${isRight ? "flex-row-reverse" : "flex-row"} items-end gap-2 mb-3 px-4`}
    >
      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs overflow-hidden">
        <img src={country?.flagUrl} className="w-full h-full object-cover" />
      </div>
      <div 
        className={`${isRight ? "bubble-right" : "bubble-left"} px-3 py-2 bg-white`}
        style={{ boxShadow: "0 1px 1px rgba(0,0,0,0.1)" }}
      >
        <div className="flex gap-1 items-center py-1">
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
        </div>
      </div>
    </motion.div>
  );
}

export default function DebateFeed({
  messages,
  headline,
  headlineSource,
  status,
  afterActionReport,
  thinkingAgent
}: DebateFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, thinkingAgent]);

  return (
    <div 
      className="flex flex-col h-full overflow-hidden" 
      style={{ background: "#ffffff" }}
    >
      {/* Header Headline */}
      {headline && (
        <div className="bg-white px-4 py-2 border-b text-center shadow-sm z-10" style={{ borderColor: "#e9edef" }}>
          <p className="text-xs font-bold text-gray-800 uppercase tracking-tighter">Current Topic</p>
          <p className="text-sm font-semibold">{headline}</p>
          {headlineSource && (
            <p className="text-[11px] mt-0.5" style={{ color: "#54656f" }}>
              Source:{" "}
              <a href={headlineSource} target="_blank" rel="noreferrer" className="underline">
                {headlineSource}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Messages Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto py-4 scroll-smooth">
        <AnimatePresence>
          {messages.map((msg, i) => (
            <ChatBubble 
              key={msg.id || i} 
              message={msg} 
              isRight={i % 2 === 1} 
              isLatest={i === messages.length - 1} 
            />
          ))}
        </AnimatePresence>

        {thinkingAgent && (
          <TypingIndicator 
            countryCode={thinkingAgent} 
            isRight={messages.length % 2 === 1} 
          />
        )}

        {/* Ending Report */}
        {afterActionReport && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="mx-8 my-6 p-4 bg-white rounded-lg shadow-lg border-t-4"
            style={{ borderTopColor: "#111b21" }}
          >
            <h3 className="font-bold mb-2 flex items-center gap-2" style={{ color: "#111b21" }}>
              After-Action Report
            </h3>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {afterActionReport}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
