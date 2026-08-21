import {
  Message,
  PermissionFlagsBits,
  OverwriteType,
  ChannelType,
  Role,
  TextChannel,
  GuildMember,
  Colors,
  EmbedBuilder,
} from "discord.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const STORE_FILE = join(DATA_DIR, "quarantine_store.json");

const QUARANTINE_ROLE_NAME = "Quarantined";
const QUARANTINE_CHANNEL_NAME = "quarantine-chat";

// ─── Persistence ─────────────────────────────────────────────────────────────

interface QuarantineStore {
  // guildId -> userId -> array of role IDs that were removed
  guilds: Record<string, Record<string, string[]>>;
  // guildId -> { userIds: string[], roleIds: string[] }
  whitelist: Record<string, { userIds: string[]; roleIds: string[] }>;
}

function readStore(): QuarantineStore {
  try {
    if (existsSync(STORE_FILE)) {
      const parsed = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Partial<QuarantineStore>;
      return {
        guilds: parsed.guilds ?? {},
        whitelist: parsed.whitelist ?? {},
      };
    }
  } catch { /* ignore */ }
  return { guilds: {}, whitelist: {} };
}

function writeStore(store: QuarantineStore): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function saveRoles(guildId: string, userId: string, roleIds: string[]): void {
  const store = readStore();
  if (!store.guilds[guildId]) store.guilds[guildId] = {};
  store.guilds[guildId][userId] = roleIds;
  writeStore(store);
}

function loadRoles(guildId: string, userId: string): string[] | null {
  const store = readStore();
  return store.guilds[guildId]?.[userId] ?? null;
}

function clearRoles(guildId: string, userId: string): void {
  const store = readStore();
  if (store.guilds[guildId]) {
    delete store.guilds[guildId][userId];
    writeStore(store);
  }
}

// ─── Whitelist helpers ────────────────────────────────────────────────────────

function getWhitelist(guildId: string): { userIds: string[]; roleIds: string[] } {
  const store = readStore();
  return store.whitelist[guildId] ?? { userIds: [], roleIds: [] };
}

function addToWhitelist(guildId: string, type: "user" | "role", id: string): boolean {
  const store = readStore();
  if (!store.whitelist[guildId]) store.whitelist[guildId] = { userIds: [], roleIds: [] };
  const wl = store.whitelist[guildId];
  const list = type === "user" ? wl.userIds : wl.roleIds;
  if (list.includes(id)) return false;
  list.push(id);
  writeStore(store);
  return true;
}

function removeFromWhitelist(guildId: string, type: "user" | "role", id: string): boolean {
  const store = readStore();
  if (!store.whitelist[guildId]) return false;
  const wl = store.whitelist[guildId];
  if (type === "user") {
    if (!wl.userIds.includes(id)) return false;
    wl.userIds = wl.userIds.filter((x) => x !== id);
  } else {
    if (!wl.roleIds.includes(id)) return false;
    wl.roleIds = wl.roleIds.filter((x) => x !== id);
  }
  writeStore(store);
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function isWhitelisted(member: GuildMember): boolean {
  if (isAdmin(member)) return true;
  const wl = getWhitelist(member.guild.id);
  if (wl.userIds.includes(member.id)) return true;
  return member.roles.cache.some((r) => wl.roleIds.includes(r.id));
}

async function getOrFindQuarantineRole(message: Message): Promise<Role | null> {
  const guild = message.guild!;
  return guild.roles.cache.find((r) => r.name === QUARANTINE_ROLE_NAME) ?? null;
}

async function getOrFindQuarantineChannel(message: Message): Promise<TextChannel | null> {
  const guild = message.guild!;
  const ch = guild.channels.cache.find(
    (c) => c.name === QUARANTINE_CHANNEL_NAME && c.type === ChannelType.GuildText,
  );
  return (ch as TextChannel) ?? null;
}

async function applyQuarantineChannelPermissions(
  guild: Message["guild"],
  quarantineRole: Role,
  quarantineChannel: TextChannel | null,
): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;

  for (const [, channel] of guild!.channels.cache) {
    if (channel.isThread()) continue;

    try {
      if (quarantineChannel && channel.id === quarantineChannel.id) {
        await channel.permissionOverwrites.edit(guild!.roles.everyone, {
          ViewChannel: false,
        });
        await channel.permissionOverwrites.edit(quarantineRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: false,
          AddReactions: false,
          UseApplicationCommands: false,
        });
      } else {
        await channel.permissionOverwrites.edit(quarantineRole, {
          ViewChannel: false,
        });
      }
      updated++;
    } catch {
      failed++;
    }
  }

  return { updated, failed };
}

// ─── ,sq — Setup Quarantine ───────────────────────────────────────────────────

export async function handleSetupQuarantine(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!isAdmin(message.member)) {
    await message.reply("❌ You need Administrator permission to use `,sq`.");
    return;
  }

  const guild = message.guild;
  const loading = await message.reply("⚙️ Setting up quarantine system…");

  // ── 1. Create or find the Quarantined role ───────────────────────────────
  let quarantineRole = guild.roles.cache.find((r) => r.name === QUARANTINE_ROLE_NAME);
  if (!quarantineRole) {
    quarantineRole = await guild.roles.create({
      name: QUARANTINE_ROLE_NAME,
      color: Colors.DarkRed,
      permissions: [],
      reason: "Quarantine system setup",
    });
  }

  // ── 2. Create or find the quarantine-chat channel ────────────────────────
  let quarantineChannel = guild.channels.cache.find(
    (c) => c.name === QUARANTINE_CHANNEL_NAME && c.type === ChannelType.GuildText,
  ) as TextChannel | undefined;

  if (!quarantineChannel) {
    quarantineChannel = await guild.channels.create({
      name: QUARANTINE_CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: "This channel is for quarantined members.",
      permissionOverwrites: [
        {
          // @everyone cannot see it
          id: guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          // Quarantined role CAN see it, but cannot attach files / add reactions
          id: quarantineRole.id,
          type: OverwriteType.Role,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.AddReactions, PermissionFlagsBits.UseApplicationCommands],
        },
      ],
      reason: "Quarantine system setup",
    });
  }

  // Apply the isolation rules after the quarantine channel exists.
  await applyQuarantineChannelPermissions(guild, quarantineRole, quarantineChannel);

  const embed = new EmbedBuilder()
    .setColor(Colors.DarkRed)
    .setTitle("🔒 Quarantine System Ready")
    .addFields(
      { name: "Role", value: `<@&${quarantineRole.id}>`, inline: true },
      { name: "Channel", value: `<#${quarantineChannel.id}>`, inline: true },
    )
    .setDescription(
      "All existing channels have been locked for quarantined members.\n" +
      "Use `,q @user` to quarantine someone, `,rq @user` to release them.",
    )
    .setTimestamp();

  await loading.edit({ content: "", embeds: [embed] });
}

// ─── ,q rerole — Reapply quarantine isolation to all channels ────────────────

export async function handleReroleQuarantine(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!isAdmin(message.member)) {
    await message.reply("❌ You need Administrator permission to use `,q rerole`.");
    return;
  }

  const quarantineRole = await getOrFindQuarantineRole(message);
  if (!quarantineRole) {
    await message.reply("❌ Quarantine role not found. Run `,sq` first to set up the quarantine system.");
    return;
  }

  const quarantineChannel = await getOrFindQuarantineChannel(message);
  if (!quarantineChannel) {
    await message.reply("❌ `quarantine-chat` channel not found. Run `,sq` first to set up the quarantine system.");
    return;
  }

  const { updated, failed } = await applyQuarantineChannelPermissions(
    message.guild,
    quarantineRole,
    quarantineChannel,
  );

  await message.reply(
    `rerole done ✅🔥☺️` +
    (failed > 0
      ? "\n⚠️ Could not update some channels; check the bot's permissions."
      : ""),
  );
}

// ─── ,q @user — Quarantine a member ──────────────────────────────────────────

export async function handleQuarantine(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!isWhitelisted(message.member)) {
    await message.reply("❌ You don't have permission to use `,q`.");
    return;
  }

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("**Usage:** `,q @user`");
    return;
  }

  if (target.id === message.author.id) {
    await message.reply("❌ You cannot quarantine yourself.");
    return;
  }

  if (target.user.bot) {
    await message.reply("❌ You cannot quarantine a bot.");
    return;
  }

  const guild = message.guild;

  const quarantineRole = await getOrFindQuarantineRole(message);
  if (!quarantineRole) {
    await message.reply("❌ Quarantine role not found. Run `,sq` first to set up the quarantine system.");
    return;
  }

  if (target.roles.cache.has(quarantineRole.id)) {
    await message.reply(`ℹ️ <@${target.id}> is already quarantined.`);
    return;
  }

  // Save all assignable roles (exclude @everyone and managed/integration roles)
  const rolesToRemove = target.roles.cache.filter(
    (r) => r.id !== guild.roles.everyone.id && !r.managed && r.id !== quarantineRole.id,
  );
  const savedIds = rolesToRemove.map((r) => r.id);

  saveRoles(guild.id, target.id, savedIds);

  // Remove all roles then add the quarantine role
  try {
    await target.roles.set([quarantineRole], `Quarantined by ${message.author.tag}`);
  } catch {
    await message.reply("❌ Failed to update roles. Make sure the bot's role is above the member's roles.");
    return;
  }

  const quarantineChannel = await getOrFindQuarantineChannel(message);

  const embed = new EmbedBuilder()
    .setColor(Colors.DarkRed)
    .setTitle("🔒 Member Quarantined")
    .addFields(
      { name: "Member", value: `<@${target.id}>`, inline: true },
      { name: "By", value: `<@${message.author.id}>`, inline: true },
      { name: "Roles Saved", value: `${savedIds.length} role(s)`, inline: true },
      { name: "Channel", value: quarantineChannel ? `<#${quarantineChannel.id}>` : QUARANTINE_CHANNEL_NAME, inline: true },
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });

  if (quarantineChannel) {
    await quarantineChannel.send(
      `🔒 <@${target.id}> has been quarantined. A staff member will be with you shortly.`,
    ).catch(() => {});
  }
}

// ─── ,rq @user — Release from quarantine ──────────────────────────────────────

export async function handleReleaseQuarantine(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!isWhitelisted(message.member)) {
    await message.reply("❌ You don't have permission to use `,rq`.");
    return;
  }

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("**Usage:** `,rq @user`");
    return;
  }

  const guild = message.guild;

  const quarantineRole = await getOrFindQuarantineRole(message);
  if (!quarantineRole) {
    await message.reply("❌ Quarantine role not found. Run `,sq` first to set up the quarantine system.");
    return;
  }

  if (!target.roles.cache.has(quarantineRole.id)) {
    await message.reply(`ℹ️ <@${target.id}> is not currently quarantined.`);
    return;
  }

  const savedIds = loadRoles(guild.id, target.id) ?? [];

  // Restore saved roles, skipping any that no longer exist
  const rolesToRestore = savedIds.filter((id) => guild.roles.cache.has(id));

  try {
    await target.roles.set(rolesToRestore, `Released from quarantine by ${message.author.tag}`);
  } catch {
    await message.reply("❌ Failed to restore roles. Make sure the bot has the Manage Roles permission.");
    return;
  }

  clearRoles(guild.id, target.id);

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("✅ Member Released from Quarantine")
    .addFields(
      { name: "Member", value: `<@${target.id}>`, inline: true },
      { name: "By", value: `<@${message.author.id}>`, inline: true },
      { name: "Roles Restored", value: `${rolesToRestore.length} role(s)`, inline: true },
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// ─── ,wq — Manage quarantine whitelist ────────────────────────────────────────

export async function handleWhitelistQuarantine(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!isAdmin(message.member)) {
    await message.reply("❌ You need Administrator permission to use `,wq`.");
    return;
  }

  const guild = message.guild;
  const args = message.content.trim().split(/\s+/);
  // args[0] = ",wq"  args[1] = "remove" | mention  args[2] = mention (if remove)

  const isRemove = args[1]?.toLowerCase() === "remove";

  const mentionedUser = message.mentions.users.first();
  const mentionedRole = message.mentions.roles.first();

  if (!mentionedUser && !mentionedRole) {
    await message.reply(
      "**Usage:**\n" +
      "`,wq @role` — whitelist a role\n" +
      "`,wq @user` — whitelist a user\n" +
      "`,wq remove @role` — remove a role from whitelist\n" +
      "`,wq remove @user` — remove a user from whitelist",
    );
    return;
  }

  if (isRemove) {
    if (mentionedRole) {
      const removed = removeFromWhitelist(guild.id, "role", mentionedRole.id);
      await message.reply(
        removed
          ? `✅ Removed <@&${mentionedRole.id}> from the quarantine whitelist.`
          : `ℹ️ <@&${mentionedRole.id}> was not on the whitelist.`,
      );
    } else if (mentionedUser) {
      const removed = removeFromWhitelist(guild.id, "user", mentionedUser.id);
      await message.reply(
        removed
          ? `✅ Removed <@${mentionedUser.id}> from the quarantine whitelist.`
          : `ℹ️ <@${mentionedUser.id}> was not on the whitelist.`,
      );
    }
    return;
  }

  // Add to whitelist
  if (mentionedRole) {
    const added = addToWhitelist(guild.id, "role", mentionedRole.id);
    const wl = getWhitelist(guild.id);
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("📋 Quarantine Whitelist Updated")
      .addFields(
        { name: added ? "Role Added" : "Already Listed", value: `<@&${mentionedRole.id}>`, inline: true },
      )
      .setFooter({ text: `${wl.roleIds.length} role(s), ${wl.userIds.length} user(s) on whitelist` })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  } else if (mentionedUser) {
    const added = addToWhitelist(guild.id, "user", mentionedUser.id);
    const wl = getWhitelist(guild.id);
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("📋 Quarantine Whitelist Updated")
      .addFields(
        { name: added ? "User Added" : "Already Listed", value: `<@${mentionedUser.id}>`, inline: true },
      )
      .setFooter({ text: `${wl.roleIds.length} role(s), ${wl.userIds.length} user(s) on whitelist` })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
}
