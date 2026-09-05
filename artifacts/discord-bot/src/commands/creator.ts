import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { getLowoOwnerId } from "../utility/lowoOwner.js";

const CREATOR_FOOTER = "Dm **e.782** if you want a custom bot like this for your server • affordable rates";
const BOT_STACK = "Node.js • TypeScript • Discord.js • PostgreSQL • Drizzle ORM";

export const creatorData = new SlashCommandBuilder()
  .setName("creator")
  .setDescription("Learn more about the creator of this bot.");

export async function executeCreator(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const ownerId = getLowoOwnerId();
  const owner = ownerId ? await client.users.fetch(ownerId).catch(() => null) : null;
  const ownerName = owner?.globalName ?? owner?.username ?? "Unknown";
  const ownerAvatar = owner?.displayAvatarURL({ size: 1024 }) ?? null;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .addFields(
      { name: "Creator", value: `**${ownerName}**`, inline: false },
      { name: "Stack", value: BOT_STACK, inline: false },
    )
    .setFooter({ text: CREATOR_FOOTER });

  if (ownerAvatar) embed.setImage(ownerAvatar);
  await interaction.editReply({ embeds: [embed] });
}