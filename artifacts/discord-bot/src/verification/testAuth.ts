import {
  EmbedBuilder,
  GuildMember,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { buildOAuthUrl } from "./oauth.js";
import { buildVerifyPanel } from "./panel.js";

function isAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * ?testauth — posts the verification panel in the current channel as a preview.
 * Admin only. Adds a small disclaimer so nobody gets confused.
 */
export async function handleTestAuth(message: Message): Promise<void> {
  if (!message.guild || !message.member || !isAdmin(message.member as GuildMember)) {
    await message.reply({ content: "❌ You need **Administrator** permissions to use this." });
    return;
  }

  if (!process.env.DISCORD_CLIENT_ID || !process.env.OAUTH_REDIRECT_URI) {
    await message.reply({
      content: "❌ `DISCORD_CLIENT_ID` and `OAUTH_REDIRECT_URI` must be set on Railway before testing.",
    });
    return;
  }

  const oauthUrl = buildOAuthUrl(message.guild.id);
  const { embed, row } = buildVerifyPanel(message.guild.name, oauthUrl);

  // Add a subtle admin-only note so it's clear this is a preview
  embed.setFooter({ text: "⚠️ preview — run ?setupauthverification to deploy this to #verify" });

  try {
    await (message.channel as TextChannel).send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
  } catch (err) {
    console.error("[AUTH_VERIFY] ?testauth send failed:", err);
    await message
      .reply({ content: "❌ Couldn't post the preview. Check my permissions in this channel." })
      .catch(() => {});
  }
}
