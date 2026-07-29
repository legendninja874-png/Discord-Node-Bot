import {
  type Client,
  Events,
  type Interaction,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  MessageFlags,
} from "discord.js";

import { SHOP_BUTTON_PREFIX, ZOO_BUTTON_PREFIX } from "../lowo/embeds.js";
import { REVERIFY_PREFIX, handleReverifyButton } from "../verification/setupAuthVerification.js";
import { SHOP_CATEGORIES, type ShopCategory } from "../lowo/data.js";
import { formatShopCategory } from "../lowo/shop.js";
import { buildZooPage } from "../lowo/hunt.js";
import { handleUniversalLeaderboardSelect } from "../leveling/universalLeaderboard.js";
import { handleDashboardButton, handleDashboardSelect } from "../leveling/dashboard.js";

function formatDiscordError(err: unknown): string {
  const code: string | undefined = (err as { code?: string })?.code;
  const message: string = err instanceof Error ? err.message : String(err);
  if (code === "MissingPermissions" || message.includes("Missing Permissions")) {
    return "❌ I'm missing permissions. Please make sure I have **Send Messages**, **Embed Links**, and **Manage Channels** permissions.";
  }
  if (code === "MissingAccess" || message.includes("Missing Access")) {
    return "❌ I don't have access to that channel.";
  }
  return `❌ Error: ${message.split("\n")[0]}`;
}

export function registerInteractionHandler(
  client: Client,
  slashHandlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>>,
  buttonHandlers: Record<string, (i: ButtonInteraction) => Promise<void>>,
  publicCommands: ReadonlySet<string>,
): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      const cmd = interaction as ChatInputCommandInteraction;
      const t0 = Date.now();
      console.log(`[INTERACTION] /${cmd.commandName} received`);

      try {
        if (publicCommands.has(cmd.commandName)) {
          await cmd.deferReply();
        } else {
          await cmd.deferReply({ flags: MessageFlags.Ephemeral });
        }
      } catch (err) {
        console.error(`[INTERACTION] /${cmd.commandName} — defer failed, cannot respond`, err);
        return;
      }

      console.log(`[INTERACTION] /${cmd.commandName} — deferred in ${Date.now() - t0}ms, running handler`);

      const handler = slashHandlers[cmd.commandName];
      if (handler) {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Command timed out — the database may be unavailable.")), 25_000)
        );
        Promise.race([handler(cmd), timeout]).catch(async (err) => {
          console.error(`[ERROR] /${cmd.commandName}:`, err);
          try {
            await cmd.editReply({ content: formatDiscordError(err) });
          } catch (e2) {
            console.error(`[ERROR] editReply also failed for /${cmd.commandName}:`, e2);
          }
        });
      } else {
        console.warn(`[WARN] No handler for command: ${cmd.commandName}`);
        await cmd.editReply({ content: "❌ Unknown command." });
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const sel = interaction as StringSelectMenuInteraction;

      if (sel.customId.startsWith("ulb_")) {
        try {
          await sel.deferUpdate();
        } catch (err) {
          console.error(`[INTERACTION] select:${sel.customId} — deferUpdate failed`, err);
          return;
        }
        handleUniversalLeaderboardSelect(sel).catch(async (err) => {
          console.error(`[ERROR] universal leaderboard select [${sel.customId}]:`, err);
          try {
            await sel.followUp({
              content: "❌ Leaderboard error: " + (err instanceof Error ? err.message : String(err)),
              flags: MessageFlags.Ephemeral,
            });
          } catch { /* ignore */ }
        });
        return;
      }

      if (sel.customId.startsWith("dash_")) {
        try {
          await sel.deferUpdate();
        } catch (err) {
          console.error(`[INTERACTION] select:${sel.customId} — deferUpdate failed`, err);
          return;
        }
        handleDashboardSelect(sel).catch(async (err) => {
          console.error(`[ERROR] dashboard select [${sel.customId}]:`, err);
          try {
            await sel.editReply({ content: "❌ Dashboard error: " + (err instanceof Error ? err.message : String(err)) });
          } catch { /* ignore */ }
        });
        return;
      }
    }

    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;
      const t0 = Date.now();
      console.log(`[INTERACTION] button:${btn.customId} received`);

      if (btn.customId.startsWith(ZOO_BUTTON_PREFIX)) {
        const rest = btn.customId.slice(ZOO_BUTTON_PREFIX.length);
        const [pageRaw, targetId, invokerId] = rest.split(":");

        if (invokerId && btn.user.id !== invokerId) {
          await btn
            .reply({
              content: "❌ These zoo buttons are for the user who opened it. Run `lowo zoo` to open your own.",
              flags: MessageFlags.Ephemeral,
            })
            .catch((e) => console.error(`[INTERACTION] zoo wrong-user reply failed`, e));
          return;
        }

        try {
          await btn.deferUpdate();
        } catch (err) {
          console.error(`[INTERACTION] zoo deferUpdate failed`, err);
          return;
        }

        try {
          if (pageRaw === "close") {
            await btn.message.delete().catch((e) => console.error(`[INTERACTION] zoo close delete failed`, e));
            return;
          }
          const page = parseInt(pageRaw, 10);
          if (!targetId || !Number.isFinite(page)) return;
          const targetUser = await btn.client.users.fetch(targetId).catch(() => null);
          if (!targetUser) {
            await btn.editReply({ content: "❌ Couldn't load that user.", embeds: [], components: [] }).catch(() => {});
            return;
          }
          const { embed, components } = buildZooPage(btn.user, targetUser, page);
          await btn.editReply({ embeds: [embed], components });
        } catch (err) {
          console.error(`[ERROR] lowo:zoo button [${btn.customId}]:`, err);
          try { await btn.editReply({ content: "❌ Couldn't update the zoo page." }); } catch { /* ignore */ }
        }
        return;
      }

      if (btn.customId.startsWith("dash_")) {
        try {
          await btn.deferUpdate();
        } catch (err) {
          console.error(`[INTERACTION] button:${btn.customId} — deferUpdate failed`, err);
          return;
        }
        handleDashboardButton(btn).catch(async (err) => {
          console.error(`[ERROR] dashboard button [${btn.customId}]:`, err);
          try {
            await btn.editReply({ content: "❌ Dashboard error: " + (err instanceof Error ? err.message : String(err)) });
          } catch { /* ignore */ }
        });
        return;
      }

      try {
        await btn.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (err) {
        console.error(`[INTERACTION] button:${btn.customId} — defer failed, cannot respond`, err);
        return;
      }

      console.log(`[INTERACTION] button:${btn.customId} — deferred in ${Date.now() - t0}ms, running handler`);

      if (btn.customId.startsWith(REVERIFY_PREFIX)) {
        handleReverifyButton(btn).catch(async (err) => {
          console.error(`[ERROR] reverify button [${btn.customId}]:`, err);
          try { await btn.editReply({ content: "❌ Re-verify failed: " + (err instanceof Error ? err.message : String(err)) }); } catch { /* ignore */ }
        });
        return;
      }

      if (btn.customId.startsWith(SHOP_BUTTON_PREFIX)) {
        try {
          const rest = btn.customId.slice(SHOP_BUTTON_PREFIX.length);
          const [cat, invokerId] = rest.split(":");
          if (invokerId && btn.user.id !== invokerId) {
            await btn.editReply({ content: "❌ These shop buttons are for the user who opened the menu — type `lowo shop` to open your own." });
            return;
          }
          if (!cat || !(SHOP_CATEGORIES as string[]).includes(cat)) {
            await btn.editReply({ content: `❌ Unknown shop category \`${cat}\`.` });
            return;
          }
          const chunks = formatShopCategory(cat as ShopCategory);
          if (chunks.length === 0) {
            await btn.editReply({ content: `📭 No items in **${cat}** yet.` });
            return;
          }
          await btn.editReply({ content: chunks[0] });
          for (let i = 1; i < chunks.length; i++) {
            await btn.followUp({ content: chunks[i], flags: MessageFlags.Ephemeral }).catch(() => {});
          }
        } catch (err) {
          console.error(`[ERROR] lowo:shop button [${btn.customId}]:`, err);
          try { await btn.editReply({ content: "❌ Couldn't load that shop category." }); } catch { /* ignore */ }
        }
        return;
      }

      const handler = buttonHandlers[btn.customId];
      if (handler) {
        handler(btn).catch(async (err) => {
          console.error(`[ERROR] button [${btn.customId}]:`, err);
          try {
            await btn.editReply({ content: formatDiscordError(err) });
          } catch (e2) {
            console.error(`[ERROR] editReply also failed for button [${btn.customId}]:`, e2);
          }
        });
      } else {
        await btn.editReply({ content: "⚠️ This button is no longer active." });
      }
    }
  });
}
