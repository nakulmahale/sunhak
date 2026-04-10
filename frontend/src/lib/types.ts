/**
 * Project EMERGENCE — Shared TypeScript Types
 * ==============================================
 * Mirrors the Python Blackboard state schema and defines
 * all data structures flowing through the WebSocket.
 */

// ── Country Codes ──────────────────────────────────────
export type CountryCode =
  | "usa"
  | "china"
  | "russia"
  | "iran"
  | "israel"
  | "uk"
  | "france"
  | "germany"
  | "india"
  | "north_korea";

export const COUNTRY_CODES: CountryCode[] = [
  "usa", "china", "russia", "iran", "israel",
  "uk", "france", "germany", "india", "north_korea",
];

// ── Country Metadata ──────────────────────────────────
export interface CountryMeta {
  code: CountryCode;
  name: string;
  flagEmoji: string;
  flagUrl: string;
  archetype: string;
  aggressionBaseline: number;
}

export const COUNTRIES: Record<CountryCode, CountryMeta> = {
  usa: {
    code: "usa",
    name: "United States",
    flagEmoji: "🇺🇸",
    flagUrl: "https://flagcdn.com/w80/us.png",
    archetype: "The Global Hegemon",
    aggressionBaseline: 0.45,
  },
  china: {
    code: "china",
    name: "China",
    flagEmoji: "🇨🇳",
    flagUrl: "https://flagcdn.com/w80/cn.png",
    archetype: "The Rising Dragon",
    aggressionBaseline: 0.4,
  },
  russia: {
    code: "russia",
    name: "Russia",
    flagEmoji: "🇷🇺",
    flagUrl: "https://flagcdn.com/w80/ru.png",
    archetype: "The Resurgent Bear",
    aggressionBaseline: 0.6,
  },
  iran: {
    code: "iran",
    name: "Iran",
    flagEmoji: "🇮🇷",
    flagUrl: "https://flagcdn.com/w80/ir.png",
    archetype: "The Revolutionary Theocracy",
    aggressionBaseline: 0.55,
  },
  israel: {
    code: "israel",
    name: "Israel",
    flagEmoji: "🇮🇱",
    flagUrl: "https://flagcdn.com/w80/il.png",
    archetype: "The Embattled Fortress",
    aggressionBaseline: 0.55,
  },
  uk: {
    code: "uk",
    name: "United Kingdom",
    flagEmoji: "🇬🇧",
    flagUrl: "https://flagcdn.com/w80/gb.png",
    archetype: "The Post-Imperial Pragmatist",
    aggressionBaseline: 0.35,
  },
  france: {
    code: "france",
    name: "France",
    flagEmoji: "🇫🇷",
    flagUrl: "https://flagcdn.com/w80/fr.png",
    archetype: "The Strategic Autonomist",
    aggressionBaseline: 0.35,
  },
  germany: {
    code: "germany",
    name: "Germany",
    flagEmoji: "🇩🇪",
    flagUrl: "https://flagcdn.com/w80/de.png",
    archetype: "The Reluctant Power",
    aggressionBaseline: 0.2,
  },
  india: {
    code: "india",
    name: "India",
    flagEmoji: "🇮🇳",
    flagUrl: "https://flagcdn.com/w80/in.png",
    archetype: "The Strategic Swing State",
    aggressionBaseline: 0.35,
  },
  north_korea: {
    code: "north_korea",
    name: "North Korea",
    flagEmoji: "🇰🇵",
    flagUrl: "https://flagcdn.com/w80/kp.png",
    archetype: "The Rogue Wildcard",
    aggressionBaseline: 0.75,
  },
};

// ── Debate Messages ──────────────────────────────────
export interface DebateMessage {
  id: string;
  countryCode: CountryCode;
  countryName: string;
  flagEmoji: string;
  content: string;
  reasoning: string;
  citations: string[];
  aggressionScore: number;
  timestamp: string;
}

// ── WebSocket Events ─────────────────────────────────
export type WSEventType =
  | "connection_established"
  | "headline"
  | "agent_thinking"
  | "agent_speaking"
  | "tension_update"
  | "debate_end"
  | "system_message"
  | "error"
  | "pong";

export interface WSEvent {
  type: WSEventType;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface HeadlineEvent {
  type: "headline";
  data: {
    headline: string;
    source: string;
    sourceUrl?: string;
    summary: string;
    timestamp: string;
  };
}

export interface AgentThinkingEvent {
  type: "agent_thinking";
  data: {
    countryCode: CountryCode;
    reasoning: string;
    relevanceScore: number;
    ragQuery: string;
  };
}

export interface AgentSpeakingEvent {
  type: "agent_speaking";
  data: {
    message: DebateMessage;
    globalTension: number;
    turnCount: number;
  };
}

export interface TensionUpdateEvent {
  type: "tension_update";
  data: {
    globalTension: number;
    aggressionScores: Record<CountryCode, number>;
    turnCount: number;
  };
}

export interface DebateEndEvent {
  type: "debate_end";
  data: {
    status: "consensus" | "deadlock" | "halted";
    afterActionReport: string;
    totalTurns: number;
    finalTension: number;
  };
}

// ── Agent State (for UI) ─────────────────────────────
export interface AgentUIState {
  countryCode: CountryCode;
  isSpeaking: boolean;
  isThinking: boolean;
  aggression: number;
  relevanceScore: number;
  lastStatement: string;
  turnCount: number;
}

// ── Debate Session ───────────────────────────────────
export interface DebateSession {
  id: string;
  headline: string;
  headlineSource: string;
  messages: DebateMessage[];
  globalTension: number;
  aggressionScores: Record<CountryCode, number>;
  activeSpeaker: CountryCode | null;
  status: "idle" | "active" | "consensus" | "deadlock" | "halted";
  turnCount: number;
  afterActionReport: string | null;
  participants: CountryCode[];
}

export const createInitialSession = (): DebateSession => ({
  id: crypto.randomUUID(),
  headline: "",
  headlineSource: "",
  messages: [],
  globalTension: 0,
  aggressionScores: Object.fromEntries(
    COUNTRY_CODES.map((c) => [c, 0])
  ) as Record<CountryCode, number>,
  activeSpeaker: null,
  status: "idle",
  turnCount: 0,
  afterActionReport: null,
  participants: [...COUNTRY_CODES],
});
