import { and, eq } from "drizzle-orm";
import type { GuildChannel, Role, GuildBan } from "discord.js";
import { OverwriteType } from "discord.js";
import { getDb } from "../db.js";
import { antiNukeSnapshotsTable } from "@workspace/db/schema";

// ─── Data shapes ──────────────────────────────────────────────────────────────

export interface OverwriteSnap {
  id:    string;
  type:  OverwriteType;
  allow: string; // bigint as string
  deny:  string;
}

export interface ChannelSnap {
  id:               string;   // original channel ID — used to remap parentId references
  name:             string;
  type:             number;   // ChannelType enum value
  topic:            string | null;
  position:         number;
  parentId:         string | null;
  nsfw:             boolean;
  rateLimitPerUser: number;
  bitrate:          number | null;
  userLimit:        number | null;
  overwrites:       OverwriteSnap[];
}

export interface RoleSnap {
  id:           string;  // original role ID — used to remap overwrite references
  name:         string;
  color:        number;
  hoist:        boolean;
  mentionable:  boolean;
  permissions:  string; // bigint as string
  position:     number;
  iconURL:      string | null;
  unicodeEmoji: string | null;
}

export interface BanSnap {
  userId:   string;
  username: string;
}

export interface OffenderSnap {
  channels:    ChannelSnap[];
  roles:       RoleSnap[];
  bans:        BanSnap[];
  capturedAt:  number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadSnap(guildId: string, executorId: string): Promise<OffenderSnap> {
  const db  = getDb();
  const row = (
    await db
      .select()
      .from(antiNukeSnapshotsTable)
      .where(
        and(
          eq(antiNukeSnapshotsTable.guildId,    guildId),
          eq(antiNukeSnapshotsTable.executorId, executorId),
        ),
      )
      .limit(1)
  )[0];

  if (row?.data && typeof row.data === "object") {
    return row.data as OffenderSnap;
  }
  return { channels: [], roles: [], bans: [], capturedAt: Date.now() };
}

async function persistSnap(guildId: string, executorId: string, snap: OffenderSnap): Promise<void> {
  const db = getDb();
  await db
    .insert(antiNukeSnapshotsTable)
    .values({ guildId, executorId, data: snap as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: [antiNukeSnapshotsTable.guildId, antiNukeSnapshotsTable.executorId],
      set:    { data: snap as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
}

// ─── Capture helpers ──────────────────────────────────────────────────────────

export async function recordChannelSnap(guildId: string, executorId: string, ch: GuildChannel): Promise<void> {
  try {
    const snap = await loadSnap(guildId, executorId);
    if (snap.channels.some(c => c.id === ch.id)) return; // deduplicate

    snap.channels.push({
      id:               ch.id,
      name:             ch.name,
      type:             ch.type,
      topic:            "topic" in ch ? (ch.topic as string | null) : null,
      position:         ch.rawPosition,
      parentId:         ch.parentId ?? null,
      nsfw:             "nsfw" in ch ? Boolean(ch.nsfw) : false,
      rateLimitPerUser: "rateLimitPerUser" in ch ? Number(ch.rateLimitPerUser) : 0,
      bitrate:          "bitrate" in ch ? Number(ch.bitrate) : null,
      userLimit:        "userLimit" in ch ? Number(ch.userLimit) : null,
      overwrites:       ch.permissionOverwrites.cache.map(ow => ({
        id:    ow.id,
        type:  ow.type,
        allow: ow.allow.bitfield.toString(),
        deny:  ow.deny.bitfield.toString(),
      })),
    });

    await persistSnap(guildId, executorId, snap);
  } catch (err) {
    console.error("[ANTINUKE] recordChannelSnap failed:", (err as Error).message);
  }
}

export async function recordRoleSnap(guildId: string, executorId: string, role: Role): Promise<void> {
  try {
    const snap = await loadSnap(guildId, executorId);
    if (snap.roles.some(r => r.id === role.id)) return; // deduplicate

    snap.roles.push({
      id:           role.id,
      name:         role.name,
      color:        role.color,
      hoist:        role.hoist,
      mentionable:  role.mentionable,
      permissions:  role.permissions.bitfield.toString(),
      position:     role.rawPosition,
      iconURL:      role.iconURL() ?? null,
      unicodeEmoji: role.unicodeEmoji ?? null,
    });

    await persistSnap(guildId, executorId, snap);
  } catch (err) {
    console.error("[ANTINUKE] recordRoleSnap failed:", (err as Error).message);
  }
}

export async function recordBanSnap(guildId: string, executorId: string, ban: GuildBan): Promise<void> {
  try {
    const snap = await loadSnap(guildId, executorId);
    if (snap.bans.some(b => b.userId === ban.user.id)) return; // deduplicate

    snap.bans.push({ userId: ban.user.id, username: ban.user.username });
    await persistSnap(guildId, executorId, snap);
  } catch (err) {
    console.error("[ANTINUKE] recordBanSnap failed:", (err as Error).message);
  }
}

// ─── Read / clear ─────────────────────────────────────────────────────────────

export async function getSnap(guildId: string, executorId: string): Promise<OffenderSnap | null> {
  try {
    const db  = getDb();
    const row = (
      await db
        .select()
        .from(antiNukeSnapshotsTable)
        .where(
          and(
            eq(antiNukeSnapshotsTable.guildId,    guildId),
            eq(antiNukeSnapshotsTable.executorId, executorId),
          ),
        )
        .limit(1)
    )[0];

    if (!row?.data || typeof row.data !== "object") return null;
    return row.data as OffenderSnap;
  } catch (err) {
    console.error("[ANTINUKE] getSnap failed:", (err as Error).message);
    return null;
  }
}

export async function clearSnap(guildId: string, executorId: string): Promise<void> {
  try {
    const db = getDb();
    await db
      .delete(antiNukeSnapshotsTable)
      .where(
        and(
          eq(antiNukeSnapshotsTable.guildId,    guildId),
          eq(antiNukeSnapshotsTable.executorId, executorId),
        ),
      );
  } catch (err) {
    console.error("[ANTINUKE] clearSnap failed:", (err as Error).message);
  }
}
