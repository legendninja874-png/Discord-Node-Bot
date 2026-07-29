import { requireLowoOwnerMessage } from "../utility/lowoOwner.js";
import {
  EmbedBuilder,
  Message,
  PermissionFlagsBits,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import { getAllAuthBackups, getAuthBackupCount, updateAuthTokens } from "./db.js";
import {
  buildOAuthUrl,
  refreshAccessToken,
  addUserToGuild,
} from "./oauth.js";

const COLOR_PRIMARY = 0x2f3136;
const COLOR_ACCENT = 0x00ffff;
const COLOR_RED = 0xff4444;

function isAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

export async function handleSetupVerification(message: Message): Promise<void> {
  if (!message.guild || !message.member || !isAdmin(message.member)) return;

  const oauthUrl = buildOAuthUrl(message.guild.id);
  if (!process.env.DISCORD_CLIENT_ID || !process.env.OAUTH_REDIRECT_URI) {
    await message.reply({
      content:
        "❌ `DISCORD_CLIENT_ID` and `OAUTH_REDIRECT_URI` must be set in Railway env vars before running this.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR_ACCENT)
    .setTitle("LAST STAND")
    .setDescription(
      "## Verification Required\n\n" +
      "Click the button below to verify your account and gain access to the server.\n\n" +
      "**It only takes a few seconds.**",
    )
    .setFooter({ text: "Last Stand · Verification" });

  const button = new ButtonBuilder()
    .setLabel("Verify")
    .setStyle(ButtonStyle.Link)
    .setURL(oauthUrl)
    .setEmoji("✅");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  try {
    await (message.channel as TextChannel).send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
  } catch (err) {
    console.error("[VERIFICATION] Failed to send verification panel:", err);
    await message.reply({ content: "❌ Failed to post the verification panel. Check my **Send Messages** and **Embed Links** permissions in this channel." }).catch(() => {});
  }
}

export async function handleAddAuthPlayers(message: Message): Promise<void> {
  if (!message.guild || !message.member || !isAdmin(message.member)) return;
  await (message.channel as TextChannel).sendTyping();

  const guildId = message.guild.id;
  const rows = await getAllAuthBackups(guildId);

  if (rows.length === 0) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_PRIMARY)
          .setDescription("No backed-up players found in the database."),
      ],
    });
    return;
  }

  // Find "clan members" role case-insensitively
  const clanRole = message.guild.roles.cache.find(
    (r) => r.name.toLowerCase() === "clan members" || r.name.toLowerCase() === "member",
  );
  const clanRoleId = clanRole?.id ? [clanRole.id] : [];

  const statusMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_ACCENT)
        .setDescription(
          `⏳ Pulling **${rows.length}** backed-up players back in. This takes a moment…`,
        ),
    ],
  });

  let recovered = 0;
  let failed = 0;
  let refreshed = 0;

  for (const row of rows) {
    let token = row.access_token;

    // Refresh if expired
    if (new Date(row.token_expiry) < new Date()) {
      const newTokens = await refreshAccessToken(row.refresh_token);
      if (!newTokens) { failed++; continue; }
      token = newTokens.access_token;
      refreshed++;
      await updateAuthTokens(
        row.user_id,
        guildId,
        newTokens.access_token,
        newTokens.refresh_token,
        newTokens.expires_in,
      ).catch(() => {});
    }

    const ok = await addUserToGuild(row.user_id, token, guildId, clanRoleId);
    if (ok) recovered++;
    else failed++;
  }

  const embed = new EmbedBuilder()
    .setColor(recovered > 0 ? COLOR_ACCENT : COLOR_RED)
    .setTitle("🛡️ Disaster Recovery Complete")
    .setDescription(
      `Pulled **${recovered}** players back into the server.` +
        (refreshed > 0 ? ` Refreshed **${refreshed}** expired tokens.` : "") +
        (failed > 0 ? ` **${failed}** couldn't be recovered (tokens dead or user left willingly).` : ""),
    )
    .addFields(
      { name: "Role Assigned", value: clanRole ? clanRole.name : "None found — role must be recreated first", inline: true },
    )
    .setFooter({ text: "Last Stand Management • OAuth2 Backup System" });

  await statusMsg.edit({ embeds: [embed] });
}

export async function handleEmergencyLockdown(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!requireLowoOwnerMessage(message)) return;
  await (message.channel as TextChannel).sendTyping();

  const everyoneRole = message.guild.roles.everyone;
  let locked = 0;
  let failed = 0;

  for (const [, channel] of message.guild.channels.cache) {
    if (channel.type === ChannelType.GuildCategory) continue;

    try {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
        const tc = channel as TextChannel;
        await tc.permissionOverwrites.edit(everyoneRole, {
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
        });
        locked++;
      } else if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        const vc = channel as VoiceChannel;
        await vc.permissionOverwrites.edit(everyoneRole, {
          Connect: false,
          Speak: false,
        });
        locked++;
      }
    } catch {
      failed++;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR_RED)
    .setTitle("🚨 EMERGENCY LOCKDOWN ACTIVE")
    .setDescription(
      `Locked **${locked}** channels. Server is closed.` +
        (failed > 0 ? ` Couldn't reach **${failed}** channels (check bot permissions).` : ""),
    )
    .addFields({
      name: "To Lift",
      value: "Manually restore @everyone permissions or use your server's unlock flow.",
    })
    .setFooter({ text: "Last Stand Management • Emergency Protocol" });

  await message.reply({ embeds: [embed] });
}

export async function handleBackupStats(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!requireLowoOwnerMessage(message)) return;

  const guildId = message.guild.id;
  const count = await getAuthBackupCount(guildId);
  const rows = await getAllAuthBackups(guildId);
  const now = new Date();
  const valid = rows.filter((r) => new Date(r.token_expiry) > now).length;
  const expired = rows.length - valid;

  const embed = new EmbedBuilder()
    .setColor(COLOR_ACCENT)
    .setTitle("🗄️ OAuth2 Backup Status")
    .setDescription(
      `We can recover **${count}** players if the server gets nuked.`,
    )
    .addFields(
      { name: "Total Backed Up", value: String(count), inline: true },
      { name: "Valid Tokens", value: String(valid), inline: true },
      { name: "Needs Refresh", value: String(expired), inline: true },
    )
    .addFields({
      name: "Note",
      value:
        "Expired tokens auto-refresh during `?addauthplayers`. As long as the refresh token is alive (30 days), recovery still works.",
    })
    .setFooter({ text: "Last Stand Management • OAuth2 Backup System" });

  await message.reply({ embeds: [embed] });
}
