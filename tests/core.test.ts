import { describe, expect, it } from "vitest";
import {
  type AppState,
  type Bubble,
  addBubble,
  removeBubble,
  moveBubble,
  updateBubble,
  makeId,
  defaultState,
  encodeState,
  decodeState,
  formatCount,
  formatClock,
  formatClock12,
  formatDate,
  MAX_TEXT_LEN,
} from "../src/model";

function b(id: string, side: "sent" | "received", text: string): Bubble {
  return { id, side, text };
}

describe("formatCount", () => {
  it("passes the spec boundaries", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1000)).toBe("1K");
    expect(formatCount(1500)).toBe("1.5K");
    expect(formatCount(1_000_000)).toBe("1M");
  });

  it("truncates rather than rounds and trims .0", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1)).toBe("1");
    expect(formatCount(1999)).toBe("1.9K"); // not "2K"
    expect(formatCount(3_400_000)).toBe("3.4M");
    expect(formatCount(2_000_000_000)).toBe("2B");
  });

  it("handles negatives and non-finite input", () => {
    expect(formatCount(-1500)).toBe("-1.5K");
    expect(formatCount(NaN)).toBe("0");
    expect(formatCount(Infinity)).toBe("0");
  });
});

describe("clock + date helpers", () => {
  it("formatClock is 12-hour with no leading zero", () => {
    expect(formatClock(new Date(2026, 5, 2, 9, 41))).toBe("9:41");
    expect(formatClock(new Date(2026, 5, 2, 0, 5))).toBe("12:05"); // midnight → 12
    expect(formatClock(new Date(2026, 5, 2, 13, 0))).toBe("1:00"); // 13:00 → 1:00
    expect(formatClock(new Date(2026, 5, 2, 12, 30))).toBe("12:30"); // noon → 12
  });

  it("formatClock12 appends AM/PM", () => {
    expect(formatClock12(new Date(2026, 5, 2, 9, 41))).toBe("9:41 AM");
    expect(formatClock12(new Date(2026, 5, 2, 21, 7))).toBe("9:07 PM");
    expect(formatClock12(new Date(2026, 5, 2, 0, 0))).toBe("12:00 AM");
  });

  it("formatDate renders a tweet-style date", () => {
    expect(formatDate(new Date(2026, 5, 2))).toBe("Jun 2, 2026");
    expect(formatDate(new Date(2025, 0, 15))).toBe("Jan 15, 2025");
  });
});

describe("bubble reducers", () => {
  const base: Bubble[] = [
    b("1", "received", "hi"),
    b("2", "sent", "yo"),
    b("3", "received", "sup"),
  ];

  it("addBubble appends without mutating the input", () => {
    const next = addBubble(base, b("4", "sent", "new"));
    expect(next).toHaveLength(4);
    expect(next[3]!.id).toBe("4");
    expect(base).toHaveLength(3); // immutability
    expect(next).not.toBe(base);
  });

  it("removeBubble drops by id without mutating", () => {
    const next = removeBubble(base, "2");
    expect(next.map((x) => x.id)).toEqual(["1", "3"]);
    expect(base).toHaveLength(3); // immutability
  });

  it("removeBubble is a no-op (copy) for an unknown id", () => {
    const next = removeBubble(base, "nope");
    expect(next.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(next).not.toBe(base);
  });

  it("moveBubble reorders and clamps out-of-range targets", () => {
    expect(moveBubble(base, 0, 2).map((x) => x.id)).toEqual(["2", "3", "1"]);
    expect(moveBubble(base, 2, 0).map((x) => x.id)).toEqual(["3", "1", "2"]);
    // out-of-range "to" clamps to the last slot
    expect(moveBubble(base, 0, 99).map((x) => x.id)).toEqual(["2", "3", "1"]);
    // same index is a no-op copy
    const same = moveBubble(base, 1, 1);
    expect(same.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(same).not.toBe(base);
    expect(base.map((x) => x.id)).toEqual(["1", "2", "3"]); // immutability
  });

  it("moveBubble handles an empty array", () => {
    expect(moveBubble([], 0, 1)).toEqual([]);
  });

  it("updateBubble patches one bubble immutably", () => {
    const next = updateBubble(base, "2", { text: "edited" });
    expect(next[1]!.text).toBe("edited");
    expect(next[1]!.side).toBe("sent"); // untouched
    expect(base[1]!.text).toBe("yo"); // immutability
  });
});

describe("makeId", () => {
  it("produces distinct ids", () => {
    expect(makeId()).not.toBe(makeId());
  });
});

describe("encodeState / decodeState", () => {
  it("round-trips a full custom state", () => {
    const s = defaultState();
    s.mode = "tweet";
    s.theme = "dark";
    s.chat.contact = "The Group Chat 😤";
    s.chat.battery = 7;
    s.chat.showTimestamps = true;
    s.chat.bubbles = [b("a", "sent", "emoji ✅ and ünïcödé"), b("b", "received", "ok")];
    s.tweet.name = "Someone";
    s.tweet.handle = "someone";
    s.tweet.likes = 1234567;
    s.tweet.verified = false;

    const decoded = decodeState("#" + encodeState(s));
    expect(decoded.mode).toBe("tweet");
    expect(decoded.theme).toBe("dark");
    expect(decoded.chat.contact).toBe("The Group Chat 😤"); // emoji survives
    expect(decoded.chat.battery).toBe(7);
    expect(decoded.chat.showTimestamps).toBe(true);
    expect(decoded.chat.bubbles).toHaveLength(2);
    expect(decoded.chat.bubbles[0]!.text).toBe("emoji ✅ and ünïcödé");
    expect(decoded.chat.bubbles[0]!.side).toBe("sent");
    expect(decoded.tweet.likes).toBe(1234567);
    expect(decoded.tweet.verified).toBe(false);
  });

  it("works without a leading '#'", () => {
    const s = defaultState();
    s.chat.contact = "No Hash";
    const decoded = decodeState(encodeState(s));
    expect(decoded.chat.contact).toBe("No Hash");
  });

  it("falls back to defaults on garbage / empty input", () => {
    const def = defaultState();
    expect(decodeState("").chat.contact).toBe(def.chat.contact);
    expect(decodeState("#not-valid-base64-$$$").mode).toBe(def.mode);
    expect(decodeState("#" + btoaSafe("not json")).mode).toBe(def.mode);
  });

  it("sanitizes partial / wrong-typed payloads", () => {
    const def = defaultState();
    const payload = btoaSafe(
      JSON.stringify({
        mode: "bogus", // invalid → default
        theme: "dark", // valid
        chat: { battery: 999, bubbles: [{ side: "weird", text: 5 }, "junk"] },
        tweet: { likes: "not a number", handle: "@@stripme" },
      }),
    );
    const decoded = decodeState("#" + payload) as AppState;
    expect(decoded.mode).toBe(def.mode); // invalid mode fell back
    expect(decoded.theme).toBe("dark"); // valid theme kept
    expect(decoded.chat.battery).toBe(100); // clamped to max
    expect(decoded.chat.bubbles).toHaveLength(1); // "junk" dropped
    expect(decoded.chat.bubbles[0]!.side).toBe("received"); // invalid side → received
    expect(decoded.chat.bubbles[0]!.text).toBe(""); // non-string text → ""
    expect(decoded.tweet.likes).toBe(def.tweet.likes); // bad number → default
    expect(decoded.tweet.handle).toBe("stripme"); // leading @ stripped
  });

  // Regression test for a real bug: a single unbroken run of characters (a
  // long URL, hashtag, or base64 blob — no whitespace for the layout to
  // break on) in a bubble or tweet body blew the rendered bubble out to a
  // multi-million-pixel-wide flex item (CSS min-content sizing ignores
  // `word-wrap: break-word`), silently clipped by the phone frame's
  // `overflow: hidden` in both the live preview and the exported PNG — the
  // text just vanished past ~380px with no wrapping and no indication
  // anything was cut off. The CSS fix (min-width: 0 + overflow-wrap:
  // anywhere on .bubble/.msg/.tw-text) isn't exercised by this DOM-free
  // suite, but the length cap that bounds how bad it can get is enforced
  // right here at the data layer — a shared-link payload can't smuggle in
  // more than MAX_TEXT_LEN characters of unbroken body text no matter what
  // the sender puts in the hash.
  it("clamps oversized bubble/tweet text to MAX_TEXT_LEN on decode", () => {
    const hugeWord = "A".repeat(MAX_TEXT_LEN * 3); // no whitespace to wrap on
    const payload = btoaSafe(
      JSON.stringify({
        chat: { bubbles: [{ side: "sent", text: hugeWord }] },
        tweet: { text: hugeWord },
      }),
    );
    const decoded = decodeState("#" + payload);
    expect(decoded.chat.bubbles[0]!.text).toHaveLength(MAX_TEXT_LEN);
    expect(decoded.tweet.text).toHaveLength(MAX_TEXT_LEN);
  });
});

// base64url-ish helper for the garbage tests (uses the same alphabet swap the
// model expects so we only exercise the JSON/validation failure paths).
function btoaSafe(s: string): string {
  const b64 = Buffer.from(s, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
