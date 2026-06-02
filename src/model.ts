// Pure, DOM-free model for fake-text.
//
// Everything that defines a fabricated screenshot lives here as plain data, plus
// the (de)serialization that lets a mock round-trip through the URL hash so it is
// shareable and reloadable. No DOM, no html-to-image — this module must import
// cleanly under vitest's node environment.

// ---- Types ----------------------------------------------------------------

export type Mode = "imessage" | "sms" | "tweet";
export type Theme = "light" | "dark";
export type Side = "sent" | "received";

export type Bubble = {
  id: string;
  side: Side;
  text: string;
  /** Optional human time label shown under/above the bubble (e.g. "9:41 AM"). */
  time?: string;
};

export type ChatState = {
  /** Contact / conversation title shown in the header. */
  contact: string;
  /** Status-bar clock text, e.g. "9:41". */
  statusTime: string;
  /** Carrier label on the left of the status bar. */
  carrier: string;
  /** Battery percentage 0–100 shown in the status bar. */
  battery: number;
  /** Whether to render the per-bubble time labels. */
  showTimestamps: boolean;
  bubbles: Bubble[];
};

export type TweetState = {
  name: string;
  handle: string;
  /** Avatar: either initials (rendered as a coloured circle) or a data URL. */
  avatar: string;
  /** Whether `avatar` should be treated as an image data URL. */
  avatarIsImage: boolean;
  verified: boolean;
  text: string;
  time: string;
  date: string;
  replies: number;
  retweets: number;
  likes: number;
};

export type AppState = {
  mode: Mode;
  theme: Theme;
  chat: ChatState;
  tweet: TweetState;
};

// ---- Defaults -------------------------------------------------------------

let idCounter = 0;
/** Short, collision-resistant-enough id for a bubble (local, single session). */
export function makeId(): string {
  idCounter += 1;
  return `b${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function defaultBubbles(): Bubble[] {
  return [
    { id: makeId(), side: "received", text: "wait you actually built this?" },
    { id: makeId(), side: "sent", text: "yeah it's all client-side, nothing leaves the browser" },
    { id: makeId(), side: "received", text: "ok that's kind of sick" },
  ];
}

export function defaultChat(): ChatState {
  return {
    contact: "Mom",
    statusTime: "9:41",
    carrier: "Carrier",
    battery: 82,
    showTimestamps: false,
    bubbles: defaultBubbles(),
  };
}

export function defaultTweet(): TweetState {
  return {
    name: "Florin",
    handle: "baditaflorin",
    avatar: "FB",
    avatarIsImage: false,
    verified: true,
    text: "this tweet is fabricated. it never happened. you are looking at a meme prop.",
    time: "9:41 AM",
    date: "Jun 2, 2026",
    replies: 12,
    retweets: 340,
    likes: 1500,
  };
}

export function defaultState(): AppState {
  return {
    mode: "imessage",
    theme: "light",
    chat: defaultChat(),
    tweet: defaultTweet(),
  };
}

// ---- Bubble reducers (pure, immutable) ------------------------------------

/** Append a bubble; returns a new array (input is never mutated). */
export function addBubble(bubbles: Bubble[], bubble: Bubble): Bubble[] {
  return [...bubbles, bubble];
}

/** Remove the bubble with the given id; returns a new array. */
export function removeBubble(bubbles: Bubble[], id: string): Bubble[] {
  return bubbles.filter((b) => b.id !== id);
}

/**
 * Move the bubble at `from` to `to`, clamping both indices into range.
 * Returns a new array; out-of-range or no-op moves return a shallow copy.
 */
export function moveBubble(bubbles: Bubble[], from: number, to: number): Bubble[] {
  const next = [...bubbles];
  if (next.length === 0) return next;
  const f = clampIndex(from, next.length);
  const t = clampIndex(to, next.length);
  if (f === t) return next;
  const [moved] = next.splice(f, 1);
  if (moved === undefined) return next;
  next.splice(t, 0, moved);
  return next;
}

/** Replace fields of one bubble by id; returns a new array. */
export function updateBubble(
  bubbles: Bubble[],
  id: string,
  patch: Partial<Omit<Bubble, "id">>,
): Bubble[] {
  return bubbles.map((b) => (b.id === id ? { ...b, ...patch } : b));
}

function clampIndex(i: number, len: number): number {
  if (!Number.isFinite(i)) return 0;
  const n = Math.trunc(i);
  if (n < 0) return 0;
  if (n > len - 1) return len - 1;
  return n;
}

// ---- Formatters -----------------------------------------------------------

/**
 * Format a social-style count: 999 → "999", 1000 → "1K", 1500 → "1.5K",
 * 1_000_000 → "1M". One decimal place, but trailing ".0" is dropped.
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const neg = n < 0;
  const abs = Math.abs(n);
  let out: string;
  if (abs < 1000) {
    out = String(Math.trunc(abs));
  } else if (abs < 1_000_000) {
    out = trimDecimal(abs / 1000) + "K";
  } else if (abs < 1_000_000_000) {
    out = trimDecimal(abs / 1_000_000) + "M";
  } else {
    out = trimDecimal(abs / 1_000_000_000) + "B";
  }
  return neg ? "-" + out : out;
}

function trimDecimal(v: number): string {
  // Truncate (don't round up) to one decimal so 1999 → "1.9K", not "2K".
  const oneDp = Math.floor(v * 10) / 10;
  const s = oneDp.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Format a Date as a 12-hour clock without leading zero, e.g. "9:41". */
export function formatClock(date: Date): string {
  let h = date.getHours() % 12;
  if (h === 0) h = 12;
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Format a Date as a 12-hour clock with AM/PM, e.g. "9:41 AM". */
export function formatClock12(date: Date): string {
  const ampm = date.getHours() < 12 ? "AM" : "PM";
  return `${formatClock(date)} ${ampm}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a Date as "Jun 2, 2026" (tweet-style date). */
export function formatDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// ---- Hash (de)serialization ----------------------------------------------

/**
 * Serialize the full app state into a compact, URL-safe hash payload.
 * We JSON-encode then base64url so arbitrary bubble text survives intact.
 */
export function encodeState(state: AppState): string {
  const json = JSON.stringify(toWire(state));
  return base64UrlEncode(json);
}

/**
 * Parse a hash fragment (with or without a leading "#") back into AppState.
 * Any malformed / partial / garbage input falls back to defaults field-by-field.
 */
export function decodeState(hash: string): AppState {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!clean) return defaultState();
  try {
    const json = base64UrlDecode(clean);
    const raw = JSON.parse(json) as unknown;
    return fromWire(raw);
  } catch {
    return defaultState();
  }
}

// Wire shape is just AppState today, but going through these functions keeps a
// single sanitisation choke-point and room to version the payload later.
function toWire(state: AppState): AppState {
  return state;
}

function fromWire(raw: unknown): AppState {
  const base = defaultState();
  if (!isRecord(raw)) return base;

  const mode = raw.mode;
  if (mode === "imessage" || mode === "sms" || mode === "tweet") base.mode = mode;
  const theme = raw.theme;
  if (theme === "light" || theme === "dark") base.theme = theme;

  if (isRecord(raw.chat)) base.chat = sanitizeChat(raw.chat, base.chat);
  if (isRecord(raw.tweet)) base.tweet = sanitizeTweet(raw.tweet, base.tweet);
  return base;
}

function sanitizeChat(raw: Record<string, unknown>, fallback: ChatState): ChatState {
  return {
    contact: str(raw.contact, fallback.contact, 60),
    statusTime: str(raw.statusTime, fallback.statusTime, 12),
    carrier: str(raw.carrier, fallback.carrier, 20),
    battery: clampNum(raw.battery, 0, 100, fallback.battery),
    showTimestamps:
      typeof raw.showTimestamps === "boolean" ? raw.showTimestamps : fallback.showTimestamps,
    bubbles: sanitizeBubbles(raw.bubbles, fallback.bubbles),
  };
}

function sanitizeBubbles(raw: unknown, fallback: Bubble[]): Bubble[] {
  if (!Array.isArray(raw)) return fallback;
  const out: Bubble[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const side: Side = item.side === "sent" ? "sent" : "received";
    const text = str(item.text, "", 4000);
    const id = str(item.id, makeId(), 64) || makeId();
    const bubble: Bubble = { id, side, text };
    if (typeof item.time === "string" && item.time) bubble.time = item.time.slice(0, 24);
    out.push(bubble);
  }
  return out;
}

function sanitizeTweet(raw: Record<string, unknown>, fallback: TweetState): TweetState {
  return {
    name: str(raw.name, fallback.name, 60),
    handle: str(raw.handle, fallback.handle, 30).replace(/^@+/, ""),
    avatar: str(raw.avatar, fallback.avatar, 500_000),
    avatarIsImage:
      typeof raw.avatarIsImage === "boolean" ? raw.avatarIsImage : fallback.avatarIsImage,
    verified: typeof raw.verified === "boolean" ? raw.verified : fallback.verified,
    text: str(raw.text, fallback.text, 4000),
    time: str(raw.time, fallback.time, 24),
    date: str(raw.date, fallback.date, 32),
    replies: clampNum(raw.replies, 0, 1e12, fallback.replies),
    retweets: clampNum(raw.retweets, 0, 1e12, fallback.retweets),
    likes: clampNum(raw.likes, 0, 1e12, fallback.likes),
  };
}

// ---- Small typed helpers --------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback: string, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : fallback;
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// base64url that works in both browser (btoa/atob) and node (Buffer), with
// proper UTF-8 handling so emoji and non-ASCII bubble text survive a round-trip.
function base64UrlEncode(input: string): string {
  const bytes = utf8Encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = b64encode(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  const bin = b64decode(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return utf8Decode(bytes);
}

function b64encode(bin: string): string {
  if (typeof btoa === "function") return btoa(bin);
  return Buffer.from(bin, "binary").toString("base64");
}

function b64decode(b64: string): string {
  if (typeof atob === "function") return atob(b64);
  return Buffer.from(b64, "base64").toString("binary");
}

function utf8Encode(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  return new Uint8Array(Buffer.from(s, "utf-8"));
}

function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  return Buffer.from(bytes).toString("utf-8");
}
