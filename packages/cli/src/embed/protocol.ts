/** frogoe-card protocol, game → host (v1). One direction, three states
 *  and a nameless failure — the hyperframes discipline: every message
 *  carries its version and source tag, and the host validates BOTH plus
 *  the frame identity (event.source) before trusting anything. Payloads
 *  are closed: a "running" message with a score field is rejected, an
 *  "over" message without a finite score is rejected, an "error" never
 *  carries a message (unforgeable failure signal — no UGC text leaks
 *  into host logs). */

export const CARD_PROTOCOL_VERSION = 1;
export const CARD_SOURCE_TAG = "frogoe-card";
/** Capability flags — a v:1 host can check these before using optional
 *  features (the hyperframes negotiation pattern, minus the complexity:
 *  we add capabilities monotonically, never remove them, so a host that
 *  knows v:1 always works). */
export const CARD_CAPABILITIES = [
  "state",
  "error",
  "control-pause",
  "control-resume",
  "control-mute",
  "card-state-event",
  "destroy",
] as const;

export type CardState = "loading" | "running" | "over";

/** Host→game control (the hyperframes play/pause/set-muted parity).
 *  Same version + source discipline as game→host, one closed action
 *  set — the relay only ever calls the contract's own handle. */
export const HOST_SOURCE_TAG = "frogoe-card-host";
export const HOST_ACTIONS = ["pause", "resume", "mute"] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

export type HostControl = { action: "pause" | "resume" } | { action: "mute"; muted: boolean };

export type HostMessage =
  | { type: "error" }
  | { type: "state"; state: Exclude<CardState, "over"> }
  | { type: "state"; score: number; state: "over" };

const STATES: readonly CardState[] = ["loading", "running", "over"];

const isCardState = (value: string): value is CardState => STATES.some((state) => state === value);

export const parseHostMessage = (data: unknown): HostMessage | null => {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.v !== CARD_PROTOCOL_VERSION) return null;
  if (message.source !== CARD_SOURCE_TAG) return null;
  if (message.type === "error") return { type: "error" };
  if (message.type !== "state") return null;
  const state = message.state;
  if (typeof state !== "string" || !isCardState(state)) return null;
  if (state === "over") {
    const score = message.score;
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    return { score, state: "over", type: "state" };
  }
  if ("score" in message) return null; // scores only exist on "over"
  return { state, type: "state" };
};

export const parseHostControl = (data: unknown): HostControl | null => {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.v !== CARD_PROTOCOL_VERSION) return null;
  if (message.source !== HOST_SOURCE_TAG) return null;
  if (message.type !== "control") return null;
  const action = message.action;
  if (action === "pause" || action === "resume") return { action };
  if (action === "mute") {
    if (typeof message.muted !== "boolean") return null;
    return { action: "mute", muted: message.muted };
  }
  return null;
};
