import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { getPool } from "../persistence.js";
import { updateAuthTokens } from "./db.js";
import { buildOAuthUrl, refreshAccessToken } from "./oauth.js";

const COLOR_ACCENT  = 0x00ffff;
const COLOR_SUCCESS = 0x00ff88;

export const REVERIFY_PREFIX = "reverify:";

// ── bot_kv config ──────────────────────────────────────────────────────────────

interface AuthVerifyConfig {
  verifiedRoleId:          string;
  unverifiedRoleId:        string;
  verifyChannelId:         string;
  unverifiedChatChannelId: string;
}

async function saveConfig(guildId: string, config: AuthVerifyConfig): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO bot_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [`auth_verify_config:${guildId}`, JSON.stringify(config)],
  );
}

async function loadConfig(guildId: string): Promise<AuthVerifyConfig | null> {
  const db = getPool();
  const res = await db.query<{ value: AuthVerifyConfig }>(
    `SELECT value FROM bot_kv WHERE key = $1`,
    [`auth_verify_config:${guildId}`],
  );
  return res.rows[0]?.value ?? null;
}

async function getUserBackup(userId: string, guildId: string) {
  const db = getPool();
  const res = await db.query<{
    user_id:       string;
    access_token:  string;
    refresh_token: string;
    token_expiry:  Date;
    guild_id:      string;
  }>(
    `SELECT user_id, access_token, refresh_token, token_expiry, guild_id
       FROM auth_backups WHERE user_id = $1 AND guild_id = $2 LIMIT 1`,
    [userId, guildId],
  );
  return res.rows[0] ?? null;
}

// ── ?setupauthverification ─────────────────────────────────────────────────────

export async function handleSetupAuthVerification(message: import("discord.js").Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!(message.member as GuildMember).permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ content: "❌ You need **Administrator** permissions to run this command." });
    return;
  }

  const guild = message.guild;
  const args  = message.content.trim().split(/\s+/).slice(1);
  const verifiedName   = args[0]?.trim() || "Verified";
  const unverifiedName = args[1]?.trim() || "Unverified";

  const statusMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_ACCENT)
        .setTitle("⚙️ Setting Up Auth Verification…")
        .setDescription("Creating roles and channels — please wait."),
    ],
  });

  // ── 1. Roles ───────────────────────────────────────────────────────────────
  // Load existing config so we reuse role IDs even if names were changed.
  const existing = await loadConfig(guild.id).catch(() => null);

  let verifiedRole =
    (existing?.verifiedRoleId ? guild.roles.cache.get(existing.verifiedRoleId) : undefined) ??
    guild.roles.cache.find(r => r.name === verifiedName);

  if (!verifiedRole) {
    verifiedRole = await guild.roles.create({
      name:        verifiedName,
      color:       0x00ff88,
      mentionable: false,
      reason:      "Auth verification setup",
    });
  }

  let unverifiedRole =
    (existing?.unverifiedRoleId ? guild.roles.cache.get(existing.unverifiedRoleId) : undefined) ??
    guild.roles.cache.find(r => r.name === unverifiedName);

  if (!unverifiedRole) {
    unverifiedRole = await guild.roles.create({
      name:        unverifiedName,
      color:       0x99aab5,
      mentionable: false,
      reason:      "Auth verification setup",
    });
  }

  // ── 2. #verify channel ─────────────────────────────────────────────────────
  // Reuse existing channel if already set up.
  let verifyChannel = existing?.verifyChannelId
    ? (guild.channels.cache.get(existing.verifyChannelId) as TextChannel | undefined)
    : undefined;

  if (!verifyChannel) {
    verifyChannel = await guild.channels.create({
      name:  "verify",
      type:  ChannelType.GuildText,
      topic: "Click the button below to verify and gain access to the server.",
      permissionOverwrites: [
        // @everyone: cannot see this channel
        {
          id:   guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        // Unverified: can see & read, but NOT send messages
        {
          id:    unverifiedRole.id,
          type:  OverwriteType.Role,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny:  [PermissionFlagsBits.SendMessages],
        },
        // Verified: no need to see the verify channel once verified
        {
          id:   verifiedRole.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        // Bot: full access
        ...(guild.members.me
          ? [{
              id:    guild.members.me.id,
              type:  OverwriteType.Member as OverwriteType,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ReadMessageHistory,
              ] as bigint[],
            }]
          : []),
      ],
      reason: "Auth verification setup",
    }) as TextChannel;
  }

  // ── 3. #unverified-chat channel ───────────────────────────────────────────
  // Reuse existing channel if already set up.
  let unverifiedChatChannel = existing?.unverifiedChatChannelId
    ? (guild.channels.cache.get(existing.unverifiedChatChannelId) as TextChannel | undefined)
    : undefined;

  if (!unverifiedChatChannel) {
    unverifiedChatChannel = await guild.channels.create({
      name:  "unverified-chat",
      type:  ChannelType.GuildText,
      topic: "Chat here while you wait to verify.",
      permissionOverwrites: [
        // @everyone: cannot see this channel
        {
          id:   guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        // Unverified: can see and chat freely
        {
          id:    unverifiedRole.id,
          type:  OverwriteType.Role,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        // Verified: cannot see it
        {
          id:   verifiedRole.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        // Bot: full access
        ...(guild.members.me
          ? [{
              id:    guild.members.me.id,
              type:  OverwriteType.Member as OverwriteType,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
              ] as bigint[],
            }]
          : []),
      ],
      reason: "Auth verification setup",
    }) as TextChannel;
  }

  // ── 4. Lock every other channel for unverified members ────────────────────
  const otherChannels = [...guild.channels.cache.values()].filter(
    c => c.id !== verifyChannel!.id && c.id !== unverifiedChatChannel!.id && "permissionOverwrites" in c,
  );

  await Promise.allSettled(
    otherChannels.map(ch =>
      (ch as TextChannel).permissionOverwrites.edit(
        unverifiedRole!,
        { ViewChannel: false },
        { reason: "Auth verification setup — blocking unverified" },
      ),
    ),
  );

  // ── 5. Post verification embed in #verify ─────────────────────────────────
  const oauthUrl = process.env.DISCORD_CLIENT_ID && process.env.OAUTH_REDIRECT_URI
    ? buildOAuthUrl(guild.id)
    : "https://discord.com";

  const verifyEmbed = new EmbedBuilder()
    .setColor(COLOR_ACCENT)
    .setTitle("🔐 Verification Required")
    .setDescription(
      `Welcome to **${guild.name}**!\n\n` +
      "To gain full access to the server, verify your account by clicking the button below.\n" +
      "**It only takes a few seconds.**",
    )
    .setFooter({ text: `You will receive the ${verifiedName} role upon verification.` });

  const verifyButton = new ButtonBuilder()
    .setLabel("Verify Now")
    .setStyle(ButtonStyle.Link)
    .setURL(oauthUrl)
    .setEmoji("✅");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);

  // Clear old messages and repost so it's always at the bottom
  await verifyChannel.bulkDelete(10).catch(() => {});
  await verifyChannel.send({ embeds: [verifyEmbed], components: [row] });

  // ── 6. Persist config ──────────────────────────────────────────────────────
  await saveConfig(guild.id, {
    verifiedRoleId:          verifiedRole.id,
    unverifiedRoleId:        unverifiedRole.id,
    verifyChannelId:         verifyChannel.id,
    unverifiedChatChannelId: unverifiedChatChannel.id,
  });

  // ── 7. Success reply ───────────────────────────────────────────────────────
  await statusMsg.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle("✅ Auth Verification Ready")
        .setDescription(
          `Setup complete! Here's what was configured:\n\n` +
          `🟢 **Verified role:** ${verifiedRole}\n` +
          `⚪ **Unverified role:** ${unverifiedRole}\n` +
          `🔒 **Verify channel:** ${verifyChannel}\n` +
          `💬 **Unverified chat:** ${unverifiedChatChannel}\n\n` +
          `New members get **${unverifiedName}** on join, can chat in ${unverifiedChatChannel} while waiting, and must verify to see the rest of the server.\n` +
          `Previously verified members who rejoin get a one-click re-verify DM.`,
        )
        .addFields({
          name:   "⚠️ Heads up",
          value:  `Existing members who **don't** have **${verifiedName}** have been locked out of all channels. ` +
                  `Give them the role manually if needed, or use \`?addauthplayers\` to pull them back in.`,
          inline: false,
        })
        .setFooter({ text: "Run ?setupauthverification [verified] [unverified] to reconfigure." }),
    ],
  });
}

// ── GuildMemberAdd ─────────────────────────────────────────────────────────────

export async function handleMemberJoin(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const config = await loadConfig(member.guild.id).catch(() => null);
  if (!config) return;

  // Assign unverified role (works even if the role was renamed — we store the ID)
  const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRoleId);
  if (unverifiedRole) {
    await member.roles
      .add(unverifiedRole, "New member — awaiting verification")
      .catch(err => console.error("[AUTH_VERIFY] Failed to add unverified role:", err));
  }

  // Check if they verified before → one-click re-verify DM
  const backup = await getUserBackup(member.user.id, member.guild.id).catch(() => null);
  if (!backup) return;

  const reVerifyButton = new ButtonBuilder()
    .setCustomId(`${REVERIFY_PREFIX}${member.guild.id}`)
    .setLabel("Re-verify (One Click)")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(reVerifyButton);

  const embed = new EmbedBuilder()
    .setColor(COLOR_ACCENT)
    .setTitle("👋 Welcome Back!")
    .setDescription(
      `You've been here before and are already in our system for **${member.guild.name}**.\n\n` +
      "Click below to instantly regain your access — no sign-in flow needed.",
    )
    .setFooter({ text: `${member.guild.name} · One-Click Re-Verify` });

  await member.send({ embeds: [embed], components: [row] }).catch(() => {
    // DMs disabled — silently skip; they can verify normally via #verify
  });
}

// ── Re-verify button ───────────────────────────────────────────────────────────

export async function handleReverifyButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.customId.slice(REVERIFY_PREFIX.length);
  const userId  = interaction.user.id;

  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) {
    await interaction.editReply({ content: "❌ Server not found. Please contact an admin." });
    return;
  }

  const config = await loadConfig(guildId);
  if (!config) {
    await interaction.editReply({
      content: "❌ Verification isn't configured in that server anymore. Ask an admin to run `?setupauthverification`.",
    });
    return;
  }

  const backup = await getUserBackup(userId, guildId);
  if (!backup) {
    await interaction.editReply({
      content: "❌ No verification record found for you. Please verify normally via the **#verify** channel.",
    });
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: "❌ Couldn't find you in the server — please rejoin and try again." });
    return;
  }

  // Refresh token if expired (keeps auth_backups up to date)
  if (new Date(backup.token_expiry) < new Date()) {
    const newTokens = await refreshAccessToken(backup.refresh_token);
    if (newTokens) {
      await updateAuthTokens(
        userId, guildId,
        newTokens.access_token, newTokens.refresh_token, newTokens.expires_in,
      ).catch(() => {});
    }
    // If refresh failed it just means the OAuth token is stale — role assignment still works via bot perms
  }

  // Apply roles (uses bot token via discord.js, not the user's OAuth token)
  const verifiedRole   = guild.roles.cache.get(config.verifiedRoleId);
  const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);

  if (verifiedRole)   await member.roles.add(verifiedRole,    "One-click re-verify").catch(() => {});
  if (unverifiedRole) await member.roles.remove(unverifiedRole, "One-click re-verify").catch(() => {});

  await interaction.editReply({
    content: `✅ You're back in **${guild.name}**! You now have full access to the server.`,
  });
}
