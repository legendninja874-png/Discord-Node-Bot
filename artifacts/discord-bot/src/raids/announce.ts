import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
  type Message,
} from "discord.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { botKvTable } from "@workspace/db/schema";

// ── Whitelist storage (bot_kv key: raid:whitelist:<guildId>) ─────────────────

function kvKey(guildId: string): string {
  return `raid:whitelist:${guildId}`;
}

async function getWhitelist(guildId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(botKvTable)
    .where(eq(botKvTable.key, kvKey(guildId)));
  const val = rows[0]?.value;
  if (!Array.isArray(val)) return [];
  return val as string[];
}

async function setWhitelist(guildId: string, ids: string[]): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(botKvTable)
    .values({ key: kvKey(guildId), value: ids, updatedAt: now })
    .onConflictDoUpdate({
      target: botKvTable.key,
      set: { value: ids, updatedAt: now },
    });
}

export async function addToRaidWhitelist(guildId: string, userId: string): Promise<boolean> {
  const list = await getWhitelist(guildId);
  if (list.includes(userId)) return false;
  await setWhitelist(guildId, [...list, userId]);
  return true;
}

export async function removeFromRaidWhitelist(guildId: string, userId: string): Promise<boolean> {
  const list = await getWhitelist(guildId);
  if (!list.includes(userId)) return false;
  await setWhitelist(guildId, list.filter((id) => id !== userId));
  return true;
}

async function isAuthorized(member: GuildMember, guildId: string): Promise<boolean> {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const list = await getWhitelist(guildId);
  return list.includes(member.id);
}

// ── Embed builder ────────────────────────────────────────────────────────────

interface RaidEmbedOptions {
  clanName: string;
  target: string;
  difficulty: string;
  headline: string;
  instructions: string[];
  imageUrl: string | null;
  guildIconUrl: string | null;
}

function buildRaidEmbed(opts: RaidEmbedOptions): EmbedBuilder {
  const { clanName, target, difficulty, headline, instructions, imageUrl, guildIconUrl } = opts;

  const instructionBlock = instructions.map((l) => `  → ${l}`).join("\n");

  const now = new Date();
  const footerDate =
    now.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }) +
    " " +
    now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const embed = new EmbedBuilder()
    .setColor(0x1a1c2e)
    .setAuthor({
      name: `${clanName}  •  Raid Incoming`,
      iconURL: guildIconUrl ?? undefined,
    })
    .setDescription(
      `⟨ ⚔ ⟩ 🚨 RAID ALERT — DEPLOY NOW\n` +
        `\`\`\`ansi\n\u001b[1;34m${headline}\u001b[0m\n\`\`\`\n` +
        `⚔️  Difficulty\n` +
        `\`\`\`fix\n${difficulty}\n\`\`\`\n` +
        `🎯  Targets\n` +
        `\`\`\`yaml\n${target}\n\`\`\`\n` +
        `↳ ⟨⚔⟩ Instructions\n` +
        `\`\`\`yaml\n${instructionBlock}\n\`\`\``,
    )
    .setFooter({
      text: `⟨ ${clanName} ⟩ | ${footerDate}`,
      iconURL: guildIconUrl ?? undefined,
    });

  if (imageUrl) embed.setImage(imageUrl);

  return embed;
}

// ── ,test raidcall ────────────────────────────────────────────────────────────

export async function handleTestRaidCall(message: Message): Promise<void> {
  if (!message.guild) return;

  const member = message.member as GuildMember | null;
  const authorized = await isAuthorized(member!, message.guild.id).catch(() => false);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild) && !authorized) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("❌ Only admins and whitelisted users can use `,test raidcall`.")
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  const embed = buildRaidEmbed({
    clanName: "Last Stand",
    target: "UNL clan",
    difficulty: "High",
    headline: "AN LS RAID STARTED AGAINST UNL",
    instructions: [
      "Click Join below to enter the server",
      "Follow callouts from raid leadership",
      "Stay until the raid is concluded",
    ],
    imageUrl: null,
    guildIconUrl: message.guild.iconURL(),
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Join")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Link)
      .setURL("https://www.roblox.com/games/"),
  );

  try {
    await message.author.send({ embeds: [embed], components: [row] });
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription("✅ Test raid alert sent to your DMs.")
          .setFooter({ text: "mewo • raid" }),
      ],
    });
  } catch {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("❌ Couldn't DM you — please enable DMs from server members.")
          .setFooter({ text: "mewo • raid" }),
      ],
    });
  }
}

// ── ,rc add / ,rc remove / ,rc list ──────────────────────────────────────────

export async function handleRaidCallWhitelist(message: Message): Promise<void> {
  if (!message.guild) return;

  const member = message.member as GuildMember | null;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("❌ You need **Manage Server** permission to manage the raid call whitelist.")
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  const args = message.content.trim().split(/\s+/);
  const sub = args[1]?.toLowerCase();
  const targetUser = message.mentions.users.first();

  if (!sub || !["add", "remove", "list"].includes(sub)) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚔️ Raid Call Whitelist")
          .setDescription(
            "`,rc add @user` — grant access to `/raid call`\n" +
              "`,rc remove @user` — revoke access\n" +
              "`,rc list` — show all whitelisted users",
          )
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  const guildId = message.guild.id;

  if (sub === "list") {
    const list = await getWhitelist(guildId);
    const display =
      list.length > 0 ? list.map((id) => `<@${id}>`).join("\n") : "*No users whitelisted.*";
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚔️ Raid Call Whitelist")
          .setDescription(display)
          .setFooter({ text: `mewo • raid • ${list.length} user(s)` }),
      ],
    });
    return;
  }

  if (!targetUser) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("❌ Please mention a user. Example: `,rc add @user`")
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  if (sub === "add") {
    const added = await addToRaidWhitelist(guildId, targetUser.id);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(
            added
              ? `✅ <@${targetUser.id}> can now use \`/raid call\`.`
              : `ℹ️ <@${targetUser.id}> is already on the whitelist.`,
          )
          .setFooter({ text: "mewo • raid" }),
      ],
    });
  } else {
    const removed = await removeFromRaidWhitelist(guildId, targetUser.id);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(removed ? 0x57f287 : 0xed4245)
          .setDescription(
            removed
              ? `✅ Removed <@${targetUser.id}> from the raid call whitelist.`
              : `❌ <@${targetUser.id}> is not on the whitelist.`,
          )
          .setFooter({ text: "mewo • raid" }),
      ],
    });
  }
}

// ── /raid call slash command definition ──────────────────────────────────────

export const raidCallData = new SlashCommandBuilder()
  .setName("raid")
  .setDescription("Raid management commands")
  .addSubcommand((sub) =>
    sub
      .setName("call")
      .setDescription("Send a raid alert to all members and DM the server.")
      .addStringOption((o) =>
        o
          .setName("clan_name")
          .setDescription("Your clan name  (e.g. HellBorn Raiders)")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("target")
          .setDescription("Target clan / group  (e.g. UNL clan)")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("difficulty")
          .setDescription("Raid difficulty")
          .setRequired(false)
          .addChoices(
            { name: "Low",           value: "Low"           },
            { name: "Mid",           value: "Mid"           },
            { name: "High",          value: "High"          },
            { name: "Not specified", value: "Not specified" },
          ),
      )
      .addStringOption((o) =>
        o
          .setName("headline")
          .setDescription("Custom ANSI headline text  (default: auto-generated from clan & target)")
          .setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName("instructions")
          .setDescription("Custom instructions — separate lines with  |  (e.g. Join now | Stay in VC)")
          .setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName("image_url")
          .setDescription("Full-width image URL to show in the embed  (https://...)")
          .setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName("game_link")
          .setDescription("Roblox game / server join link  (https://...)")
          .setRequired(false),
      ),
  );

// ── /raid call execute ────────────────────────────────────────────────────────

export async function executeRaidCall(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "This command can only be used in a server." });
    return;
  }

  const member = interaction.member as GuildMember | null;
  if (!member) {
    await interaction.editReply({ content: "Unable to resolve your membership." });
    return;
  }

  const authorized = await isAuthorized(member, guild.id);
  if (!authorized) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(
            "❌ You don't have permission to use `/raid call`.\n" +
              "Only admins and users added via `,rc add` can use this command.",
          )
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  const clanName  = interaction.options.getString("clan_name", true);
  const target    = interaction.options.getString("target", true);
  const difficulty = interaction.options.getString("difficulty") ?? "Not specified";
  const gameLink  = interaction.options.getString("game_link")?.trim() ?? null;
  const imageUrl  = interaction.options.getString("image_url")?.trim() ?? null;

  if (gameLink && !/^https?:\/\/\S+$/.test(gameLink)) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("❌ Game link must start with `https://`.")
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  if (imageUrl && !/^https?:\/\/\S+$/.test(imageUrl)) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("❌ Image URL must start with `https://`.")
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  // Headline: custom OR auto-generated abbreviation
  const customHeadline = interaction.options.getString("headline");
  const clanAbbr   = clanName.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase();
  const targetAbbr = target.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase();
  const headline   = customHeadline ?? `AN ${clanAbbr} RAID STARTED AGAINST ${targetAbbr}`;

  // Instructions: custom (pipe-separated) OR defaults
  const rawInstructions = interaction.options.getString("instructions");
  const instructions: string[] = rawInstructions
    ? rawInstructions.split("|").map((s) => s.trim()).filter(Boolean)
    : [
        "Click Join below to enter the server",
        "Follow callouts from raid leadership",
        "Stay until the raid is concluded",
      ];

  const embed = buildRaidEmbed({
    clanName,
    target,
    difficulty,
    headline,
    instructions,
    imageUrl,
    guildIconUrl: guild.iconURL(),
  });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (gameLink) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Join")
          .setEmoji("🎮")
          .setStyle(ButtonStyle.Link)
          .setURL(gameLink),
      ),
    );
  }

  const msgPayload = { embeds: [embed], components };

  // 1. Post in the channel the command was used in
  const channel = interaction.channel;
  if (channel?.isTextBased() && "send" in channel) {
    await channel.send({
      content: "@everyone",
      allowedMentions: { parse: ["everyone"] },
      ...msgPayload,
    });
  }

  // 2. DM every non-bot member
  let members;
  try {
    members = await guild.members.fetch();
  } catch {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(
            "❌ Failed to fetch members. Check the **Server Members Intent** is enabled.",
          )
          .setFooter({ text: "mewo • raid" }),
      ],
    });
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const m of members.values()) {
    if (m.user.bot) continue;
    try {
      await m.send(msgPayload);
      sent++;
    } catch {
      failed++;
    }
  }

  const failNote = failed > 0 ? ` (${failed} had DMs closed)` : "";
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(`✅ Raid alert sent to **${sent}** members${failNote}.`)
        .setFooter({ text: "mewo • raid" }),
    ],
  });
}
