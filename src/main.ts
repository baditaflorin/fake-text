import { toPng } from "html-to-image";
import {
  type AppState,
  type Bubble,
  type Mode,
  type Side,
  addBubble,
  removeBubble,
  moveBubble,
  updateBubble,
  makeId,
  encodeState,
  decodeState,
  formatCount,
} from "./model";

// ---- DOM helpers ----------------------------------------------------------
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

let state: AppState = decodeState(location.hash);

// ---- Persistence ----------------------------------------------------------
function persist(): void {
  history.replaceState(null, "", `#${encodeState(state)}`);
}

function initials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

// ===========================================================================
// Rendering — turns `state` into the live preview DOM (the capture target).
// ===========================================================================
function render(): void {
  const phone = el<HTMLElement>("phone");
  const tweet = el<HTMLElement>("tweet-card");
  const isTweet = state.mode === "tweet";

  phone.hidden = isTweet;
  tweet.hidden = !isTweet;

  if (isTweet) renderTweet();
  else renderChat();
}

function renderChat(): void {
  const { chat } = state;
  const phone = el<HTMLElement>("phone");
  phone.classList.toggle("dark", state.theme === "dark");
  phone.classList.toggle("sms", state.mode === "sms");

  el<HTMLElement>("sb-time").textContent = chat.statusTime;
  el<HTMLElement>("sb-carrier").textContent = chat.carrier;
  el<HTMLElement>("sb-battery").textContent = `${chat.battery}%`;
  el<HTMLElement>("sb-batt-icon").style.setProperty("--batt-fill", `${chat.battery}%`);

  el<HTMLElement>("chat-name").textContent = chat.contact;
  el<HTMLElement>("chat-avatar").textContent = initials(chat.contact);
  el<HTMLElement>("input-pill").textContent = state.mode === "sms" ? "Text message" : "iMessage";

  const list = el<HTMLElement>("messages");
  list.innerHTML = "";
  for (const bubble of chat.bubbles) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${bubble.side}`;
    const b = document.createElement("div");
    b.className = "bubble";
    b.textContent = bubble.text;
    wrap.appendChild(b);
    if (chat.showTimestamps && bubble.time) {
      const t = document.createElement("div");
      t.className = "bubble-time";
      t.textContent = bubble.time;
      wrap.appendChild(t);
    }
    list.appendChild(wrap);
  }
}

function renderTweet(): void {
  const { tweet } = state;
  const card = el<HTMLElement>("tweet-card");
  card.classList.toggle("dark", state.theme === "dark");

  el<HTMLElement>("tw-name-view").textContent = tweet.name;
  el<HTMLElement>("tw-handle-view").textContent = `@${tweet.handle}`;
  el<HTMLElement>("tw-text-view").textContent = tweet.text;
  el<HTMLElement>("tw-meta-view").textContent = `${tweet.time} · ${tweet.date}`;
  el<HTMLElement>("tw-badge").classList.toggle("hidden", !tweet.verified);

  const avatar = el<HTMLElement>("tw-avatar-view");
  if (tweet.avatarIsImage && tweet.avatar) {
    avatar.style.backgroundImage = `url("${tweet.avatar}")`;
    avatar.textContent = "";
  } else {
    avatar.style.backgroundImage = "";
    avatar.textContent = initials(tweet.avatar || tweet.name);
  }

  el<HTMLElement>("tw-stats-view").innerHTML =
    `<span><b>${formatCount(tweet.replies)}</b> Replies</span>` +
    `<span><b>${formatCount(tweet.retweets)}</b> Reposts</span>` +
    `<span><b>${formatCount(tweet.likes)}</b> Likes</span>`;
}

// ===========================================================================
// Editor — bubble list rows (built per-render so reorder/remove stay simple).
// ===========================================================================
function renderBubbleEditor(): void {
  const list = el<HTMLOListElement>("bubble-list");
  list.innerHTML = "";
  const bubbles = state.chat.bubbles;

  bubbles.forEach((bubble, i) => {
    const li = document.createElement("li");
    li.className = "bubble-row";

    const side = document.createElement("button");
    side.type = "button";
    side.className = `side-pill ${bubble.side}`;
    side.textContent = bubble.side === "sent" ? "Sent" : "Recv";
    side.title = "Toggle sent / received";
    side.addEventListener("click", () => {
      const next: Side = bubble.side === "sent" ? "received" : "sent";
      state.chat.bubbles = updateBubble(state.chat.bubbles, bubble.id, { side: next });
      commit();
    });

    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.value = bubble.text;
    ta.placeholder = "message text…";
    ta.addEventListener("input", () => {
      state.chat.bubbles = updateBubble(state.chat.bubbles, bubble.id, { text: ta.value });
      // Light commit: update preview + hash without rebuilding the editor list
      // (keeps focus/caret in the textarea while typing).
      render();
      persist();
    });

    const ctrl = document.createElement("div");
    ctrl.className = "bubble-ctrl";
    const up = mkCtrl("↑", "Move up", i === 0, () => {
      state.chat.bubbles = moveBubble(state.chat.bubbles, i, i - 1);
      commit();
    });
    const down = mkCtrl("↓", "Move down", i === bubbles.length - 1, () => {
      state.chat.bubbles = moveBubble(state.chat.bubbles, i, i + 1);
      commit();
    });
    const del = mkCtrl("✕", "Delete", false, () => {
      state.chat.bubbles = removeBubble(state.chat.bubbles, bubble.id);
      commit();
    });
    del.classList.add("del");
    ctrl.append(up, down, del);

    li.append(side, ta, ctrl);
    list.appendChild(li);
  });
}

function mkCtrl(
  label: string,
  title: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

// `commit` = full refresh: preview + editor list + hash. Used for structural
// changes (add/remove/reorder/side). Text edits use the lighter path above.
function commit(): void {
  render();
  renderBubbleEditor();
  persist();
}

// ===========================================================================
// Tab + pane switching
// ===========================================================================
function setMode(mode: Mode): void {
  state.mode = mode;
  for (const tab of document.querySelectorAll<HTMLElement>(".tab")) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
    tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  }
  el<HTMLElement>("edit-chat").hidden = mode === "tweet";
  el<HTMLElement>("edit-tweet").hidden = mode !== "tweet";
  // The carrier line only makes sense for iMessage's iOS status bar.
  el<HTMLElement>("chat-carrier-field").style.display = mode === "sms" ? "none" : "";
  render();
  persist();
}

// ===========================================================================
// Form wiring — push editor inputs into `state`.
// ===========================================================================
function bindText(id: string, set: (v: string) => void): void {
  const input = el<HTMLInputElement | HTMLTextAreaElement>(id);
  input.addEventListener("input", () => {
    set(input.value);
    render();
    persist();
  });
}

function bindNumber(id: string, set: (v: number) => void): void {
  const input = el<HTMLInputElement>(id);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) set(v);
    render();
    persist();
  });
}

function syncForm(): void {
  // Chat
  el<HTMLInputElement>("chat-contact").value = state.chat.contact;
  el<HTMLInputElement>("chat-time").value = state.chat.statusTime;
  el<HTMLInputElement>("chat-carrier").value = state.chat.carrier;
  el<HTMLInputElement>("chat-battery").value = String(state.chat.battery);
  el<HTMLInputElement>("chat-timestamps").checked = state.chat.showTimestamps;
  // Tweet
  el<HTMLInputElement>("tw-name").value = state.tweet.name;
  el<HTMLInputElement>("tw-handle").value = state.tweet.handle;
  el<HTMLInputElement>("tw-verified").checked = state.tweet.verified;
  el<HTMLInputElement>("tw-initials").value = state.tweet.avatarIsImage ? "" : state.tweet.avatar;
  el<HTMLTextAreaElement>("tw-text").value = state.tweet.text;
  el<HTMLInputElement>("tw-time").value = state.tweet.time;
  el<HTMLInputElement>("tw-date").value = state.tweet.date;
  el<HTMLInputElement>("tw-replies").value = String(state.tweet.replies);
  el<HTMLInputElement>("tw-retweets").value = String(state.tweet.retweets);
  el<HTMLInputElement>("tw-likes").value = String(state.tweet.likes);
  // Theme
  el<HTMLInputElement>("theme").checked = state.theme === "dark";
}

function toast(msg: string): void {
  const t = el<HTMLElement>("toast");
  t.textContent = msg;
  t.classList.add("show");
  window.setTimeout(() => t.classList.remove("show"), 1800);
}

// ===========================================================================
// Wire everything once on load.
// ===========================================================================
function wire(): void {
  syncForm();

  for (const tab of document.querySelectorAll<HTMLElement>(".tab")) {
    tab.addEventListener("click", () => setMode(tab.dataset.mode as Mode));
  }

  el<HTMLInputElement>("theme").addEventListener("change", (e) => {
    state.theme = (e.target as HTMLInputElement).checked ? "dark" : "light";
    render();
    persist();
  });

  // Chat fields
  bindText("chat-contact", (v) => (state.chat.contact = v));
  bindText("chat-time", (v) => (state.chat.statusTime = v));
  bindText("chat-carrier", (v) => (state.chat.carrier = v));
  bindNumber("chat-battery", (v) => (state.chat.battery = Math.min(100, Math.max(0, v))));
  el<HTMLInputElement>("chat-timestamps").addEventListener("change", (e) => {
    state.chat.showTimestamps = (e.target as HTMLInputElement).checked;
    render();
    persist();
  });

  const addBubbleOf = (side: Side): void => {
    const bubble: Bubble = { id: makeId(), side, text: "", time: state.chat.statusTime };
    state.chat.bubbles = addBubble(state.chat.bubbles, bubble);
    commit();
  };
  el("add-received").addEventListener("click", () => addBubbleOf("received"));
  el("add-sent").addEventListener("click", () => addBubbleOf("sent"));

  // Tweet fields
  bindText("tw-name", (v) => (state.tweet.name = v));
  bindText("tw-handle", (v) => (state.tweet.handle = v.replace(/^@+/, "")));
  bindText("tw-text", (v) => (state.tweet.text = v));
  bindText("tw-time", (v) => (state.tweet.time = v));
  bindText("tw-date", (v) => (state.tweet.date = v));
  bindNumber("tw-replies", (v) => (state.tweet.replies = Math.max(0, v)));
  bindNumber("tw-retweets", (v) => (state.tweet.retweets = Math.max(0, v)));
  bindNumber("tw-likes", (v) => (state.tweet.likes = Math.max(0, v)));
  el<HTMLInputElement>("tw-verified").addEventListener("change", (e) => {
    state.tweet.verified = (e.target as HTMLInputElement).checked;
    render();
    persist();
  });
  el<HTMLInputElement>("tw-initials").addEventListener("input", (e) => {
    state.tweet.avatar = (e.target as HTMLInputElement).value;
    state.tweet.avatarIsImage = false;
    render();
    persist();
  });
  el<HTMLInputElement>("tw-avatar").addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.tweet.avatar = String(reader.result);
      state.tweet.avatarIsImage = true;
      render();
      persist();
    };
    reader.readAsDataURL(file);
  });
  el("tw-avatar-clear").addEventListener("click", () => {
    state.tweet.avatarIsImage = false;
    state.tweet.avatar = initials(state.tweet.name);
    el<HTMLInputElement>("tw-avatar").value = "";
    syncForm();
    render();
    persist();
  });

  // Export + share
  el("png").addEventListener("click", exportPng);
  el("share").addEventListener("click", share);

  el<HTMLElement>("version").textContent = `v${__APP_VERSION__} · ${__GIT_COMMIT__}`;
}

async function exportPng(): Promise<void> {
  const node = state.mode === "tweet" ? el<HTMLElement>("tweet-card") : el<HTMLElement>("phone");
  try {
    const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `fake-text-${state.mode}.png`;
    a.click();
    toast("PNG downloaded — remember: it's a parody prop");
  } catch (err) {
    console.error(err);
    toast("PNG export failed — try again");
  }
}

async function share(): Promise<void> {
  const url = `${location.origin}${location.pathname}#${encodeState(state)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied — reopens this exact mock");
  } catch {
    toast(url);
  }
}

// ---- Boot -----------------------------------------------------------------
wire();
setMode(state.mode);
renderBubbleEditor();
persist();
