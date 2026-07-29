import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

/**
 * Builds the verification panel embed + button row.
 * Used by ?setupverification, ?setupauthverification, and ?testauth
 * so they all stay in sync.
 */
export function buildVerifyPanel(
  guildName: string,
  oauthUrl: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const embed = new EmbedBuilder()
    .setColor(0x23272a)
    .setAuthor({ name: guildName })
    .setTitle("you're almost in.")
    .setDescription(
      `Hey, glad you made it!\n\n` +
      `We verify everyone before giving server access — keeps things clean and the bots out. ` +
      `It's just a quick Discord check, nothing weird.\n\n` +
      `Hit the button below and you'll be through in under a minute.`,
    )
    .setFooter({ text: "only members who verify can see the rest of the server" });

  const button = new ButtonBuilder()
    .setLabel("Get Verified")
    .setStyle(ButtonStyle.Link)
    .setURL(oauthUrl)
    .setEmoji("🔓");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return { embed, row };
}
