import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import {
  antiNukeConfigTable,
  antiNukeWhitelistTable,
  antiNukeCtbyTable,
} from "@workspace/db/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ActionType =
  | "channelDelete"
  | "channelCreate"
  | "roleDelete"
  | "roleCreate"
  | "ban"
  | "kick"
  | "guildUpdate"
  | "webhookCreate"
  | "emojiDelete";

/**
 * What happens to an offender when they cross a threshold.
 *   ban   — permanently bans from the server (strongest, use for confirmed threats)
 *   kick  — kicks; they can rejoin but lose admin access immediately
 *   strip — removes all roles (default; reversible via ?antinuke restore)
 *
 * Bots are ALWAYS banned regardless of this setting — managed/integration
 * roles cannot be stripped, so ban is the only effective action.
 */
export type PunishAction = "ban" | "kick" | "strip";

/**
 * Whitelist tier for a user:
 *   immune  — completely ignored; no action ever taken regardless of what they do
 *   lenient — trusted staff with much higher thresholds; if triggered, always strips
 *   none    — normal user subject to default thresholds + configured punishment
 */
export type WhitelistStatus = "immune" | "lenient" | "none";

export interface WhitelistData {
  lenient: Set<string>;
  immune:  Set<string>;
}

export interface AntiNukeConfig {
  enabled:      boolean;
  logChannelId: string | null;
  logPingIds:   string[];
  punishAction: PunishAction;
  thresholds:   Record<ActionType, { count: number; window: number }>;
}

// ── Default thresholds ────────────────────────────────────────────────────────

/**
 * Default thresholds — tuned for fast detection:
 *   - 10 second sliding window
 *   - Destructive actions trigger on 3 events; creative actions also 3 since
 *     even legitimate bots rarely batch-create 3+ channels/roles in 10 s.
 */
export const DEFAULT_THRESHOLDS: AntiNukeConfig["thresholds"] = {
  channelDelete: { count: 3, window: 10_000 },
  channelCreate: { count: 3, window: 10_000 },
  roleDelete:    { count: 3, window: 10_000 },
  roleCreate:    { count: 3, window: 10_000 },
  ban:           { count: 3, window: 10_000 },
  kick:          { count: 3, window: 10_000 },
  guildUpdate:   { count: 3, window: 10_000 },
  webhookCreate: { count: 3, window: 10_000 },
  emojiDelete:   { count: 3, window: 10_000 },
};

/**
 * Lenient thresholds — applied to whitelisted trusted staff.
 * Only triggers on sustained mass-action (10+ destructive actions in 60 s).
 * Punishment is always "strip" — never ban/kick a trusted staff member.
 */
export const LENIENT_THRESHOLDS: AntiNukeConfig["thresholds"] = {
  channelDelete: { count: 10, window: 60_000 },
  channelCreate: { count: 20, window: 60_000 },
  roleDelete:    { count: 10, window: 60_000 },
  roleCreate:    { count: 20, window: 60_000 },
  ban:           { count: 10, window: 60_000 },
  kick:          { count: 10, window: 60_000 },
  guildUpdate:   { count:  5, window: 60_000 },
  webhookCreate: { count: 10, window: 60_000 },
  emojiDelete:   { count: 15, window: 60_000 },
};

// ── TTL cache helpers ─────────────────────────────────────────────────────────
// All caches use a 5-minute TTL. On DB error we fall back to the stale entry
// (even if expired) so a transient Postgres hiccup never silently disables
// protection. Stale entries are kept in the map until evicted on next write.

const CACHE_TTL_MS = 5 * 60 * 1_000;

interface CacheEntry<T> {
  value:     T;
  expiresAt: number;
}

function getCachedFresh<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) return undefined; // expired — do not delete yet (kept for stale fallback)
  return entry.value;
}

/** Returns the cached value even if expired — used as a fallback on DB errors. */
function getCachedStale<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  return cache.get(key)?.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── In-memory caches ──────────────────────────────────────────────────────────

const configCache    = new Map<string, CacheEntry<AntiNukeConfig>>();
const whitelistCache = new Map<string, CacheEntry<WhitelistData>>();
const ctbyCache      = new Map<string, CacheEntry<Set<string>>>();

// ── In-memory sliding window ───────────────────────────────────────────────────
// guildId → executorId → actionType → timestamps[]
// This is intentionally in-memory: the window is ≤60 s so persistence adds
// complexity without meaningful gain. The real protection against restarts is
// the 60-s quarantineActive lock in mitigation.ts.
const actionMap = new Map<string, Map<string, Map<ActionType, number[]>>>();

// ── Sliding-window counter ────────────────────────────────────────────────────

export function recordAction(
  guildId:            string,
  executorId:         string,
  action:             ActionType,
  config:             AntiNukeConfig,
  overrideThresholds?: AntiNukeConfig["thresholds"],
): boolean {
  const { count, window } = (overrideThresholds ?? config.thresholds)[action];
  const now    = Date.now();
  const cutoff = now - window;

  if (!actionMap.has(guildId)) actionMap.set(guildId, new Map());
  const byGuild = actionMap.get(guildId)!;
  if (!byGuild.has(executorId)) byGuild.set(executorId, new Map());
  const byUser = byGuild.get(executorId)!;
  if (!byUser.has(action)) byUser.set(action, []);
  const timestamps = byUser.get(action)!;

  const fresh = timestamps.filter(t => t > cutoff);
  fresh.push(now);
  byUser.set(action, fresh);
  return fresh.length >= count;
}

export function clearActions(guildId: string, executorId: string): void {
  actionMap.get(guildId)?.delete(executorId);
}

// ── Ctby (whitelist-management grants) ───────────────────────────────────────
// Previously in-memory only — now persisted to the antinuke_ctby table.
// The owner can grant other trusted users the ability to manage the whitelist
// without giving them full Administrator permissions.

async function loadCtbySet(guildId: string): Promise<Set<string>> {
  const fresh = getCachedFresh(ctbyCache, guildId);
  if (fresh) return fresh;

  try {
    const db  = getDb();
    const row = (await db.select().from(antiNukeCtbyTable).where(eq(antiNukeCtbyTable.guildId, guildId)).limit(1))[0];
    const set = new Set<string>(row?.userIds ?? []);
    setCached(ctbyCache, guildId, set);
    return set;
  } catch (err) {
    const stale = getCachedStale(ctbyCache, guildId);
    if (stale) {
      console.error("[ANTINUKE] DB error loading ctby — using stale cache:", (err as Error).message);
      return stale;
    }
    console.error("[ANTINUKE] DB error loading ctby — no cache, returning empty set:", (err as Error).message);
    return new Set();
  }
}

async function persistCtby(guildId: string, set: Set<string>): Promise<void> {
  const db = getDb();
  await db
    .insert(antiNukeCtbyTable)
    .values({ guildId, userIds: [...set] })
    .onConflictDoUpdate({ target: antiNukeCtbyTable.guildId, set: { userIds: [...set] } });
}

export async function addCtbyUser(guildId: string, userId: string): Promise<void> {
  const set = await loadCtbySet(guildId);
  set.add(userId);
  setCached(ctbyCache, guildId, set);
  await persistCtby(guildId, set);
}

export async function removeCtbyUser(guildId: string, userId: string): Promise<void> {
  const set = await loadCtbySet(guildId);
  set.delete(userId);
  setCached(ctbyCache, guildId, set);
  await persistCtby(guildId, set);
}

export async function isCtbyUser(guildId: string, userId: string): Promise<boolean> {
  return (await loadCtbySet(guildId)).has(userId);
}

export async function getCtbyUsers(guildId: string): Promise<string[]> {
  return [...(await loadCtbySet(guildId))];
}

// ── Whitelist ──────────────────────────────────────────────────────────────────

export async function getWhitelistData(guildId: string): Promise<WhitelistData> {
  const fresh = getCachedFresh(whitelistCache, guildId);
  if (fresh) return fresh;

  try {
    const db   = getDb();
    const rows = await db
      .select()
      .from(antiNukeWhitelistTable)
      .where(eq(antiNukeWhitelistTable.guildId, guildId))
      .limit(1);
    const row  = rows[0];
    const data: WhitelistData = {
      lenient: new Set<string>(row?.userIds   ?? []),
      immune:  new Set<string>(row?.immuneIds ?? []),
    };
    setCached(whitelistCache, guildId, data);
    return data;
  } catch (err) {
    const stale = getCachedStale(whitelistCache, guildId);
    if (stale) {
      console.error("[ANTINUKE] DB error loading whitelist — using stale cache:", (err as Error).message);
      return stale;
    }
    console.error("[ANTINUKE] DB error loading whitelist — no cache, whitelist bypassed for this request:", (err as Error).message);
    return { lenient: new Set(), immune: new Set() };
  }
}

export async function saveWhitelistData(guildId: string, data: WhitelistData): Promise<void> {
  setCached(whitelistCache, guildId, data);
  const db = getDb();
  await db
    .insert(antiNukeWhitelistTable)
    .values({ guildId, userIds: [...data.lenient], immuneIds: [...data.immune] })
    .onConflictDoUpdate({
      target: antiNukeWhitelistTable.guildId,
      set:    { userIds: [...data.lenient], immuneIds: [...data.immune] },
    });
}

export async function getWhitelistStatus(guildId: string, userId: string): Promise<WhitelistStatus> {
  const data = await getWhitelistData(guildId);
  if (data.immune.has(userId))  return "immune";
  if (data.lenient.has(userId)) return "lenient";
  return "none";
}

// ── Config ─────────────────────────────────────────────────────────────────────
//
// punishAction was previously crammed into the thresholds JSONB blob under
// the magic key "_punishAction" to avoid a schema migration. It now has its
// own column. Rows written by old code are migrated transparently on first
// read: if the JSONB still carries "_punishAction", it's moved to the column
// and the key is scrubbed from the blob in a fire-and-forget UPDATE.

const LEGACY_PUNISH_KEY = "_punishAction";

export async function getConfig(guildId: string): Promise<AntiNukeConfig> {
  const fresh = getCachedFresh(configCache, guildId);
  if (fresh) return fresh;

  try {
    const db   = getDb();
    const rows = await db
      .select()
      .from(antiNukeConfigTable)
      .where(eq(antiNukeConfigTable.guildId, guildId))
      .limit(1);
    const row  = rows[0];

    if (!row) {
      const defaults: AntiNukeConfig = {
        enabled:      false,
        logChannelId: null,
        logPingIds:   [],
        punishAction: "strip",
        thresholds:   { ...DEFAULT_THRESHOLDS },
      };
      setCached(configCache, guildId, defaults);
      return defaults;
    }

    const raw             = (row.thresholds ?? {}) as Record<string, unknown>;
    const legacyPunish    = raw[LEGACY_PUNISH_KEY] as PunishAction | undefined;
    const punishAction: PunishAction = legacyPunish ?? (row.punishAction as PunishAction) ?? "strip";

    // If the old JSONB hack is still present, migrate it to the proper column
    // in the background so the next read is clean.
    if (legacyPunish) {
      const { [LEGACY_PUNISH_KEY]: _removed, ...cleanThresholds } = raw;
      void db
        .update(antiNukeConfigTable)
        .set({ punishAction: legacyPunish, thresholds: cleanThresholds as Record<string, unknown> })
        .where(eq(antiNukeConfigTable.guildId, guildId))
        .catch(e => console.error("[ANTINUKE] punishAction column migration failed:", (e as Error).message));
      const { [LEGACY_PUNISH_KEY]: _drop, ...thresholdBlob } = raw;
      const cfg: AntiNukeConfig = {
        enabled:      row.enabled,
        logChannelId: row.logChannelId ?? null,
        logPingIds:   row.logPingIds ?? [],
        punishAction,
        thresholds:   { ...DEFAULT_THRESHOLDS, ...(thresholdBlob as Partial<AntiNukeConfig["thresholds"]>) },
      };
      setCached(configCache, guildId, cfg);
      return cfg;
    }

    const cfg: AntiNukeConfig = {
      enabled:      row.enabled,
      logChannelId: row.logChannelId ?? null,
      logPingIds:   row.logPingIds ?? [],
      punishAction,
      thresholds:   { ...DEFAULT_THRESHOLDS, ...(raw as Partial<AntiNukeConfig["thresholds"]>) },
    };
    setCached(configCache, guildId, cfg);
    return cfg;

  } catch (err) {
    // A DB error must never silently disable protection.
    // If we have a stale cache entry (even expired), use it and log a warning.
    const stale = getCachedStale(configCache, guildId);
    if (stale) {
      console.error(
        `[ANTINUKE] WARN: DB error fetching config for guild ${guildId} — serving stale cache. Protection continues.`,
        (err as Error).message,
      );
      return stale;
    }
    // No cache at all. Log critically — there is nothing we can do.
    console.error(
      `[ANTINUKE] CRITICAL: DB error fetching config for guild ${guildId} AND no cache available. ` +
      `Anti-nuke defaulting to disabled for this request. Investigate DB connectivity immediately.`,
      (err as Error).message,
    );
    return {
      enabled:      false,
      logChannelId: null,
      logPingIds:   [],
      punishAction: "strip",
      thresholds:   { ...DEFAULT_THRESHOLDS },
    };
  }
}

export async function saveConfig(guildId: string, cfg: AntiNukeConfig): Promise<void> {
  setCached(configCache, guildId, cfg);
  const db = getDb();

  // Write thresholds cleanly — no more _punishAction hack in the JSONB.
  await db
    .insert(antiNukeConfigTable)
    .values({
      guildId,
      enabled:      cfg.enabled,
      logChannelId: cfg.logChannelId,
      logPingIds:   cfg.logPingIds,
      punishAction: cfg.punishAction,
      thresholds:   cfg.thresholds as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: antiNukeConfigTable.guildId,
      set: {
        enabled:      cfg.enabled,
        logChannelId: cfg.logChannelId,
        logPingIds:   cfg.logPingIds,
        punishAction: cfg.punishAction,
        thresholds:   cfg.thresholds as Record<string, unknown>,
      },
    });
}
