import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  PermissionFlagsBits,
  ChannelType,
  GuildMember,
} from "discord.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { botKvTable } from "@workspace/db/schema";

// ── Config ─────────────────────────────────────────────────────────────────────

interface PromoteCfg {
  logChannelId:  string | null;
  accessRoleIds: string[];
}

function cfgKey(guildId: string): string {
  return `promote_cfg_${guildId}`;
}

async function getCfg(guildId: string): Promise<PromoteCfg> {
  try {
    const db  = getDb();
    const row = (await db.select().from(botKvTable).where(eq(botKvTable.key, cfgKey(guildId))).limit(1))[0];
    return (row?.value ?? { logChannelId: null, accessRoleIds: [] }) as PromoteCfg;
  } catch {
    return { logChannelId: null, accessRoleIds: [] };
  }
}

async function saveCfg(guildId: string, cfg: PromoteCfg): Promise<void> {
  const db = getDb();
  await db
    .insert(botKvTable)
    .values({ key: cfgKey(guildId), value: cfg as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: botKvTable.key,
      set:    { value: cfg as unknown as Record<string, unknown> },
    });
}

// ── Access check ───────────────────────────────────────────────────────────────

async function hasAccess(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId || !interaction.member) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

  const cfg = await getCfg(interaction.guildId);
  if (cfg.accessRoleIds.length === 0) return false;

  const roles = interaction.member.roles;
  const roleIds: string[] = Array.isArray(roles)
    ? roles
    : [...(interaction.member as GuildMember).roles.cache.keys()];

  return cfg.accessRoleIds.some(id => roleIds.includes(id));
}

// ── Reason formatter ──────────────────────────────────────────────────────────

function formatReasons(raw: string): string {
  return raw
    .split(/[,\n]+/)
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => `• ${r}`)
    .join("\n");
}

// ── Shared send helper ────────────────────────────────────────────────────────

async function sendEmbed(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder,
): Promise<void> {
  // Send in current channel
  if (interaction.channel?.type === ChannelType.GuildText) {
    await (interaction.channel as TextChannel).send({ embeds: [embed] }).catch(() => null);
  }

  // Also send to log channel if configured and different from current channel
  const cfg    = await getCfg(interaction.guildId!);
  if (cfg.logChannelId && cfg.logChannelId !== interaction.channelId) {
    const logCh = interaction.guild?.channels.cache.get(cfg.logChannelId) as TextChannel | undefined;
    await logCh?.send({ embeds: [embed] }).catch(() => null);
  }
}

// ── Command definitions ────────────────────────────────────────────────────────

export const promoteData = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Promote a member or configure the promotion system.")
  .addSubcommand(sub =>
    sub
      .setName("member")
      .setDescription("Promote a member to a higher role.")
      .addUserOption(o =>
        o.setName("user").setDescription("Member to promote").setRequired(true)
      )
      .addRoleOption(o =>
        o.setName("from").setDescription("Their current role").setRequired(true)
      )
      .addRoleOption(o =>
        o.setName("to").setDescription("Their new higher role").setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reasons").setDescription("Reasons — separate with commas").setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("logs")
      .setDescription("Set the channel where promotion/demotion logs are sent.")
      .addChannelOption(o =>
        o
          .setName("channel")
          .setDescription("Log channel")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("access")
      .setDescription("Grant a role permission to use /promote and /demote.")
      .addRoleOption(o =>
        o.setName("role").setDescription("Role to grant access").setRequired(true)
      )
  );

export const demoteData = new SlashCommandBuilder()
  .setName("demote")
  .setDescription("Demote a member to a lower role.")
  .addSubcommand(sub =>
    sub
      .setName("member")
      .setDescription("Demote a member to a lower role.")
      .addUserOption(o =>
        o.setName("user").setDescription("Member to demote").setRequired(true)
      )
      .addRoleOption(o =>
        o.setName("from").setDescription("Their current role").setRequired(true)
      )
      .addRoleOption(o =>
        o.setName("to").setDescription("Their new lower role").setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reasons").setDescription("Reasons — separate with commas").setRequired(true)
      )
  );

// ── /promote handler ──────────────────────────────────────────────────────────

export async function executePromote(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  // /promote logs
  if (sub === "logs") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply("❌ Only admins can set the log channel.");
      return;
    }
    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    const cfg     = await getCfg(interaction.guildId!);
    cfg.logChannelId = channel.id;
    await saveCfg(interaction.guildId!, cfg);
    await interaction.editReply(`✅ Promotion/demotion logs → <#${channel.id}>`);
    return;
  }

  // /promote access
  if (sub === "access") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply("❌ Only admins can manage access.");
      return;
    }
    const role = interaction.options.getRole("role", true);
    const cfg  = await getCfg(interaction.guildId!);
    if (!cfg.accessRoleIds.includes(role.id)) {
      cfg.accessRoleIds.push(role.id);
      await saveCfg(interaction.guildId!, cfg);
      await interaction.editReply(`✅ <@&${role.id}> can now use /promote and /demote.`);
    } else {
      await interaction.editReply(`ℹ️ <@&${role.id}> already has access.`);
    }
    return;
  }

  // /promote member
  if (!(await hasAccess(interaction))) {
    await interaction.editReply("❌ You don't have permission to use this command.");
    return;
  }

  const target    = interaction.options.getUser("user", true);
  const fromRole  = interaction.options.getRole("from", true);
  const toRole    = interaction.options.getRole("to", true);
  const reasons   = formatReasons(interaction.options.getString("reasons", true));

  const embed = new EmbedBuilder()
    .setColor(0x1565C0)
    .setDescription(
      `## <@${target.id}> PROMOTED\n### FROM <@&${fromRole.id}> → <@&${toRole.id}>\n\n${reasons}`
    )
    .setFooter({
      text:    `Promoted by ${interaction.user.displayName}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await sendEmbed(interaction, embed);
  await interaction.editReply("✅ Done.");
}

// ── /demote handler ───────────────────────────────────────────────────────────

export async function executeDemote(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub !== "member") {
    await interaction.editReply("❌ Unknown subcommand.");
    return;
  }

  if (!(await hasAccess(interaction))) {
    await interaction.editReply("❌ You don't have permission to use this command.");
    return;
  }

  const target   = interaction.options.getUser("user", true);
  const fromRole = interaction.options.getRole("from", true);
  const toRole   = interaction.options.getRole("to", true);
  const reasons  = formatReasons(interaction.options.getString("reasons", true));

  const embed = new EmbedBuilder()
    .setColor(0xFF6B00)
    .setDescription(
      `## <@${target.id}> DEMOTED\n### FROM <@&${fromRole.id}> → <@&${toRole.id}>\n\n${reasons}`
    )
    .setFooter({
      text:    `Demoted by ${interaction.user.displayName}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await sendEmbed(interaction, embed);
  await interaction.editReply("✅ Done.");
}
