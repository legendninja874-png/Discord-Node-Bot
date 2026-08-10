import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";

export type PermanentNicknameRecord = {
  originalNickname: string | null;
  enforcedNickname: string;
};

export type PermanentNicknameStore = Record<string, Record<string, PermanentNicknameRecord>>;

export const permanentNicknameStore: PermanentNicknameStore = {};

function parseTargetMemberId(raw: string): string | null {
  const mentionId = raw.match(/^<@!?([0-9]+)>$/)?.[1];
  if (mentionId) return mentionId;

  const clean = raw.replace(/[<@!>]/g, "").trim();
  return /^\d{17,20}$/.test(clean) ? clean : null;
}

export function setPermanentNickname({
  guildId,
  userId,
  nickname,
  originalNickname,
  store = permanentNicknameStore,
}: {
  guildId: string;
  userId: string;
  nickname: string;
  originalNickname?: string | null;
  store?: PermanentNicknameStore;
}): PermanentNicknameRecord {
  const guildStore = store[guildId] ?? (store[guildId] = {});
  const record: PermanentNicknameRecord = {
    originalNickname: originalNickname ?? null,
    enforcedNickname: nickname,
  };

  guildStore[userId] = record;
  return record;
}

export async function applyPermanentNickname({
  guildId,
  userId,
  member,
  store = permanentNicknameStore,
}: {
  guildId: string;
  userId: string;
  member: { nickname: string | null; displayName: string; setNickname: (nickname: string | null) => Promise<unknown> };
  store?: PermanentNicknameStore;
}): Promise<boolean> {
  const record = store[guildId]?.[userId];
  if (!record) return false;

  const currentName = member.nickname ?? member.displayName;
  if (currentName === record.enforcedNickname) return false;

  await member.setNickname(record.enforcedNickname);
  return true;
}

export async function removePermanentNickname({
  guildId,
  userId,
  member,
  store = permanentNicknameStore,
}: {
  guildId: string;
  userId: string;
  member: { setNickname: (nickname: string | null) => Promise<unknown> };
  store?: PermanentNicknameStore;
}): Promise<string | null> {
  const guildStore = store[guildId];
  if (!guildStore) return null;

  const record = guildStore[userId];
  if (!record) return null;

  const restoreTo = record.originalNickname ?? null;
  delete guildStore[userId];
  if (Object.keys(guildStore).length === 0) delete store[guildId];

  await member.setNickname(restoreTo);
  return restoreTo;
}

export async function handlePermanentNickCommand(message: Message): Promise<boolean> {
  if (!message.guild || !message.member) return false;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return false;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (lower === "?rnick" || lower.startsWith("?rnick ")) {
    const raw = content.slice("?rnick".length).trim();
    if (!raw) {
      await message.reply("Usage: `?rnick <@user>`");
      return true;
    }

    const targetId = parseTargetMemberId(raw);
    if (!targetId) {
      await message.reply("Usage: `?rnick <@user>`");
      return true;
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      await message.reply("❌ Please mention a valid server member.");
      return true;
    }

    const previous = await removePermanentNickname({
      guildId: message.guild.id,
      userId: target.id,
      member: target,
    });

    if (previous === null) {
      await message.reply(`❌ **${target.user.username}** does not have a permanent nickname set.`);
      return true;
    }

    await message.reply(`Removed permanent nickname from **${target.user.username}**.`);
    return true;
  }

  if (lower === "?nick" || lower.startsWith("?nick ")) {
    const raw = content.slice("?nick".length).trim();
    if (!raw) {
      await message.reply("Usage: `?nick <@user> <nickname>`");
      return true;
    }

    const match = raw.match(/^<@!?([0-9]+)>(?:\s+|$)(.*)$/s);
    const targetId = match ? match[1] : parseTargetMemberId(raw.split(/\s+/)[0] ?? "");
    const rawNewName = match ? match[2].trim() : raw.slice((raw.split(/\s+/)[0] ?? "").length).trim();

    if (!targetId || !rawNewName) {
      await message.reply("Usage: `?nick <@user> <nickname>`");
      return true;
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      await message.reply("❌ Please mention a valid server member.");
      return true;
    }

    const originalNickname = target.nickname ?? target.displayName ?? null;
    const nextName = rawNewName.trim();

    if (!nextName || nextName.length > 32) {
      await message.reply("❌ Nicknames must be 1–32 characters long.");
      return true;
    }

    setPermanentNickname({
      guildId: message.guild.id,
      userId: target.id,
      nickname: nextName,
      originalNickname,
    });

    await target.setNickname(nextName);
    await message.reply(`Changed **${target.user.username}** to ${nextName}`);
    return true;
  }

  return false;
}
