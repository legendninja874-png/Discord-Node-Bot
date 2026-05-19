import type { Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getAiUsage, incrementAiUsage } from "../store.js";

type Handler = (msg: Message, args: string[]) => Promise<void>;

function err(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${text}`);
}

function unavailable(): EmbedBuilder {
  return err("This feature is currently unavailable.");
}

const AI_DAILY_LIMIT = 25;

export const cmdChatgpt: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide a prompt. Usage: `mewo ai chatgpt <prompt>`")] });
    return;
  }
  const usage = getAiUsage(msg.author.id);
  if (usage.chatgpt >= AI_DAILY_LIMIT) {
    await msg.reply({ embeds: [err(`Daily limit reached (${AI_DAILY_LIMIT} requests). Resets at midnight UTC.`)] });
    return;
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  const sambaKey  = process.env.SAMBANOVA_API_KEY;
  const groqKey   = process.env.GROQ_API_KEY;
  if (!openaiKey && !sambaKey && !groqKey) {
    await msg.reply({ embeds: [unavailable()] });
    return;
  }

  let apiUrl: string;
  let model: string;
  let authKey: string;
  let modelLabel: string;

  if (openaiKey) {
    apiUrl     = "https://api.openai.com/v1/chat/completions";
    model      = "gpt-4o-mini";
    authKey    = openaiKey;
    modelLabel = "GPT-4o Mini";
  } else if (sambaKey) {
    apiUrl     = "https://api.sambanova.ai/v1/chat/completions";
    model      = "Meta-Llama-3.3-70B-Instruct";
    authKey    = sambaKey;
    modelLabel = "LLaMA 3.3 70B";
  } else {
    apiUrl     = "https://api.groq.com/openai/v1/chat/completions";
    model      = "llama-3.1-8b-instant";
    authKey    = groqKey!;
    modelLabel = "LLaMA 3.1 8B";
  }

  const prompt = args.join(" ");
  const typing = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x00B4FF).setDescription("💭 Processing your request...")]
  });
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are mewo, a helpful and friendly Discord bot assistant. Keep responses concise and suitable for Discord." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1000,
      }),
    });
    const data = await res.json() as {
      choices?: Array<{ message: { content: string } }>;
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      console.error(`[MEWO AI] chatgpt HTTP ${res.status}:`, JSON.stringify(data.error ?? {}));
      throw new Error("api error");
    }
    const reply = data.choices?.[0]?.message?.content ?? "No response.";
    incrementAiUsage(msg.author.id, "chatgpt");
    await typing.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x00B4FF)
        .setTitle("AI Chat")
        .addFields(
          { name: "Question", value: prompt.slice(0, 1024), inline: false },
          { name: "Answer",   value: reply.slice(0, 1024),  inline: false }
        )
        .setFooter({ text: `mewo • ai • ${modelLabel} • ${usage.chatgpt + 1}/${AI_DAILY_LIMIT} today` })
      ],
    });
  } catch (e) {
    console.error("[MEWO AI] chatgpt error:", e);
    await typing.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};

export const cmdLlama: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide a prompt. Usage: `mewo ai llama <prompt>`")] });
    return;
  }
  const usage = getAiUsage(msg.author.id);
  if (usage.llama >= AI_DAILY_LIMIT) {
    await msg.reply({ embeds: [err(`Daily limit reached (${AI_DAILY_LIMIT} requests). Resets at midnight UTC.`)] });
    return;
  }
  const sambaKey = process.env.SAMBANOVA_API_KEY;
  const groqKey  = process.env.GROQ_API_KEY;
  if (!sambaKey && !groqKey) {
    await msg.reply({ embeds: [unavailable()] });
    return;
  }

  let apiUrl: string;
  let model: string;
  let authKey: string;
  let modelLabel: string;

  if (sambaKey) {
    apiUrl     = "https://api.sambanova.ai/v1/chat/completions";
    model      = "Meta-Llama-3.3-70B-Instruct";
    authKey    = sambaKey;
    modelLabel = "LLaMA 3.3 70B (SambaNova)";
  } else {
    apiUrl     = "https://api.groq.com/openai/v1/chat/completions";
    model      = "llama-3.1-8b-instant";
    authKey    = groqKey!;
    modelLabel = "LLaMA 3.1 8B (Groq)";
  }

  const prompt = args.join(" ");
  const typing = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x00B4FF).setDescription("💭 Processing your request...")]
  });
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are mewo, a helpful and friendly Discord bot assistant. Keep responses concise and suitable for Discord." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1000,
      }),
    });
    const data = await res.json() as {
      choices?: Array<{ message: { content: string } }>;
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      console.error(`[MEWO AI] llama HTTP ${res.status}:`, JSON.stringify(data.error ?? {}));
      throw new Error("api error");
    }
    const reply = data.choices?.[0]?.message?.content ?? "No response.";
    incrementAiUsage(msg.author.id, "llama");
    await typing.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x00B4FF)
        .setTitle("LLaMA")
        .addFields(
          { name: "Question", value: prompt.slice(0, 1024), inline: false },
          { name: "Answer",   value: reply.slice(0, 1024),  inline: false }
        )
        .setFooter({ text: `mewo • ai • ${modelLabel} • ${usage.llama + 1}/${AI_DAILY_LIMIT} today` })
      ],
    });
  } catch (e) {
    console.error("[MEWO AI] llama error:", e);
    await typing.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};

export const cmdAiUsage: Handler = async (msg) => {
  const usage = getAiUsage(msg.author.id);
  const bar = (used: number, max: number) => {
    const filled = Math.round((used / max) * 10);
    return `\`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` ${used}/${max}`;
  };
  await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x00B4FF)
      .setTitle("AI Usage — Today")
      .addFields(
        { name: "AI Chat",  value: bar(usage.chatgpt,  AI_DAILY_LIMIT), inline: false },
        { name: "LLaMA",    value: bar(usage.llama,    AI_DAILY_LIMIT), inline: false },
        { name: "DeepSeek", value: bar(usage.deepseek, AI_DAILY_LIMIT), inline: false },
        { name: "Resets",   value: "Daily at **midnight UTC**",          inline: false }
      )
      .setFooter({ text: "mewo • ai" })
    ],
  });
};

export const cmdDeepseek: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide a prompt. Usage: `mewo ai deepseek <prompt>`")] });
    return;
  }
  const usage = getAiUsage(msg.author.id);
  if (usage.deepseek >= AI_DAILY_LIMIT) {
    await msg.reply({ embeds: [err(`Daily limit reached (${AI_DAILY_LIMIT} requests). Resets at midnight UTC.`)] });
    return;
  }
  const sambaKey = process.env.SAMBANOVA_API_KEY;
  if (!sambaKey) {
    await msg.reply({ embeds: [unavailable()] });
    return;
  }
  const prompt = args.join(" ");
  const typing = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x4B5CC4).setDescription("💭 Processing your request...")]
  });
  try {
    const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${sambaKey}` },
      body: JSON.stringify({
        model: "DeepSeek-V3-0324",
        messages: [
          { role: "system", content: "You are mewo, a helpful and friendly Discord bot assistant. Keep responses concise and suitable for Discord." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
      }),
    });
    const data = await res.json() as {
      choices?: Array<{ message: { content: string } }>;
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      console.error(`[MEWO AI] deepseek HTTP ${res.status}:`, JSON.stringify(data.error ?? {}));
      throw new Error("api error");
    }
    const reply = data.choices?.[0]?.message?.content ?? "No response.";
    incrementAiUsage(msg.author.id, "deepseek");
    await typing.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x4B5CC4)
        .setTitle("DeepSeek")
        .addFields(
          { name: "Prompt", value: prompt.slice(0, 1024), inline: false },
          { name: "Answer", value: reply.slice(0, 1024),  inline: false }
        )
        .setFooter({ text: `mewo • ai • DeepSeek-V3 • ${usage.deepseek + 1}/${AI_DAILY_LIMIT} today` })
      ],
    });
  } catch (e) {
    console.error("[MEWO AI] deepseek error:", e);
    await typing.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};

export const cmdOcr: Handler = async (msg) => {
  const attachment = msg.attachments.first();
  if (!attachment) {
    await msg.reply({ embeds: [err("Attach an image to extract text from. Usage: `mewo ai ocr` + image attachment")] });
    return;
  }
  const key = process.env.OCR_API_KEY ?? "K81768361488957";
  const thinking = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x00B4FF).setDescription("🔍 Extracting text...")]
  });
  try {
    const res = await fetch(
      `https://api.ocr.space/parse/imageurl?apikey=${key}&url=${encodeURIComponent(attachment.url)}&language=eng&isOverlayRequired=false`,
      { headers: { "User-Agent": "MewoBot/1.0" } }
    );
    const data = await res.json() as {
      ParsedResults?: Array<{ ParsedText: string }>;
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
    };
    if (data.IsErroredOnProcessing) {
      await thinking.edit({ embeds: [err("Could not extract text from this image.")] });
      return;
    }
    const text = data.ParsedResults?.[0]?.ParsedText?.trim();
    if (!text) {
      await thinking.edit({ embeds: [err("No text found in the image.")] });
      return;
    }
    await thinking.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x00B4FF)
        .setTitle("OCR — Extracted Text")
        .setThumbnail(attachment.url)
        .setDescription(`\`\`\`\n${text.slice(0, 2000)}\n\`\`\``)
        .setFooter({ text: "mewo • ai • OCR.space" })
      ],
    });
  } catch (e) {
    console.error("[MEWO AI] ocr error:", e);
    await thinking.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};

export const cmdScreenshot: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide a URL. Usage: `mewo ai screenshot <url>`")] });
    return;
  }
  let url = args[0];
  if (!url.startsWith("http")) url = "https://" + url;
  const thinking = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x00B4FF).setDescription("📸 Taking screenshot...")]
  });
  try {
    const screenshotUrl = `https://image.thum.io/get/width/1280/crop/720/noanimate/${encodeURIComponent(url)}`;
    const check = await fetch(screenshotUrl, { method: "HEAD" });
    if (!check.ok) throw new Error(`HEAD ${check.status}`);
    await thinking.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x00B4FF)
        .setTitle("Website Screenshot")
        .setURL(url)
        .setDescription(`📸 **[${url}](${url})**`)
        .setImage(screenshotUrl)
        .setFooter({ text: "mewo • ai • thum.io" })
      ],
    });
  } catch (e) {
    console.error("[MEWO AI] screenshot error:", e);
    await thinking.edit({ embeds: [err("Could not take a screenshot of that URL.")] });
  }
};

export const cmdDownload: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide a URL. Usage: `mewo ai download <url>`\nSupports YouTube, TikTok, Twitter, Instagram, Reddit, and more.")] });
    return;
  }
  const url = args[0];
  const thinking = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x00B4FF).setDescription("⬇️ Processing download...")]
  });
  try {
    const res = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ url, videoQuality: "720", filenameStyle: "pretty" }),
    });
    if (!res.ok) throw new Error(`cobalt HTTP ${res.status}`);
    const data = await res.json() as {
      status: string;
      url?: string;
      error?: { code?: string };
      picker?: Array<{ url: string; thumb?: string }>;
    };
    if (data.status === "error") {
      console.error("[MEWO AI] download cobalt error:", data.error?.code);
      throw new Error("cobalt error");
    }
    if (data.status === "picker" && data.picker?.length) {
      const links = data.picker.slice(0, 5).map((p, i) => `[Media ${i + 1}](${p.url})`).join("\n");
      await thinking.edit({
        embeds: [new EmbedBuilder()
          .setColor(0x00B4FF)
          .setTitle("Media Download — Multiple Files")
          .setDescription(`**${url}**\n\n${links}\n\n> Right-click → Save as to download`)
          .setFooter({ text: "mewo • ai • cobalt.tools" })
        ],
      });
      return;
    }
    if (data.url) {
      await thinking.edit({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("Media Download — Ready")
          .setDescription(`**[Click here to download](${data.url})**\n\n\`${url}\`\n\n> Link expires in a few minutes. Download quickly!`)
          .setFooter({ text: "mewo • ai • cobalt.tools" })
        ],
      });
      return;
    }
    throw new Error("no url returned");
  } catch (e) {
    console.error("[MEWO AI] download error:", e);
    await thinking.edit({ embeds: [err("Could not download that URL. Make sure it is a supported platform.")] });
  }
};

async function imagineViaHorde(prompt: string, apiKey: string): Promise<Buffer> {
  const submitRes = await fetch("https://stablehorde.net/api/v2/generate/async", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": apiKey,
      "Client-Agent": "MewoBot:1.0:discord",
    },
    body: JSON.stringify({
      prompt,
      params: {
        width: 512,
        height: 512,
        steps: 20,
        cfg_scale: 7,
        sampler_name: "k_euler_a",
        n: 1,
      },
      nsfw: true,
      censor_nsfw: false,
      r2: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`horde submit ${submitRes.status}: ${body.slice(0, 200)}`);
  }
  const { id } = await submitRes.json() as { id: string };
  for (let i = 0; i < 72; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const checkRes = await fetch(`https://stablehorde.net/api/v2/generate/check/${id}`, {
      headers: { "Client-Agent": "MewoBot:1.0:discord" },
      signal: AbortSignal.timeout(10000),
    });
    const check = await checkRes.json() as { done: boolean; faulted?: boolean };
    if (check.faulted) throw new Error("horde generation faulted");
    if (check.done) {
      const statusRes = await fetch(`https://stablehorde.net/api/v2/generate/status/${id}`, {
        headers: { "Client-Agent": "MewoBot:1.0:discord" },
        signal: AbortSignal.timeout(10000),
      });
      const status = await statusRes.json() as { generations: Array<{ img: string; model?: string }> };
      const b64 = status.generations?.[0]?.img;
      if (!b64) throw new Error("horde: no image in response");
      console.log(`[MEWO AI] imagine done via horde model: ${status.generations[0]?.model}`);
      return Buffer.from(b64, "base64");
    }
  }
  throw new Error("horde timeout");
}

async function imagineViaPollinations(prompt: string): Promise<{ buffer: Buffer; ext: string }> {
  const seed = Math.floor(Math.random() * 2147483647);
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=flux-realism&width=1024&height=1024&seed=${seed}&nologo=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`pollinations ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, ext };
}

export const cmdGrokImagine: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide a prompt. Usage: `mewo ai imagine <prompt>`")] });
    return;
  }
  const prompt = args.join(" ");
  const hordeKey = process.env.AI_HORDE_API_KEY;
  const useHorde = hordeKey && hordeKey !== "0000000000";

  const thinking = await msg.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x00B4FF)
      .setDescription(useHorde
        ? "🎨 Generating image... (may take 1–2 minutes)"
        : "🎨 Generating image... (this may take a few seconds)")
    ]
  });

  try {
    let buffer: Buffer;
    let ext = "jpg";
    let footer: string;

    if (useHorde) {
      buffer = await imagineViaHorde(prompt, hordeKey);
      ext = "webp";
      footer = "mewo • ai • AI Horde";
    } else {
      const result = await imagineViaPollinations(prompt);
      buffer = result.buffer;
      ext = result.ext;
      footer = "mewo • ai • FLUX Realism";
    }

    await thinking.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x00B4FF)
        .setTitle("AI Image Generation")
        .setDescription(`> ${prompt.slice(0, 200)}`)
        .setImage(`attachment://image.${ext}`)
        .setFooter({ text: footer })
      ],
      files: [{ attachment: buffer, name: `image.${ext}` }],
    });
  } catch (e) {
    console.error("[MEWO AI] imagine error:", e);
    await thinking.edit({ embeds: [err("Image generation failed. Please try again.")] }).catch(() => {});
  }
};

export const cmdPerplexity: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide a query. Usage: `mewo ai perplexity <query>`")] });
    return;
  }
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) {
    await msg.reply({ embeds: [unavailable()] });
    return;
  }
  const query = args.join(" ");
  const thinking = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x20B2AA).setDescription("🔎 Searching the web...")]
  });
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: query }], max_tokens: 800 }),
    });
    const data = await res.json() as {
      choices?: Array<{ message: { content: string } }>;
      citations?: string[];
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      console.error(`[MEWO AI] perplexity HTTP ${res.status}:`, JSON.stringify(data.error ?? {}));
      throw new Error("api error");
    }
    const answer = data.choices?.[0]?.message?.content ?? "No answer.";
    const citations = data.citations?.slice(0, 3) ?? [];
    const embed = new EmbedBuilder()
      .setColor(0x20B2AA)
      .setTitle("Web Search")
      .addFields({ name: "Query", value: query.slice(0, 256), inline: false })
      .setDescription(answer.slice(0, 2000))
      .setFooter({ text: "mewo • ai • Perplexity Sonar" });
    if (citations.length) {
      embed.addFields({ name: "Sources", value: citations.map((c, i) => `[${i + 1}] ${c}`).join("\n").slice(0, 1024), inline: false });
    }
    await thinking.edit({ embeds: [embed] });
  } catch (e) {
    console.error("[MEWO AI] perplexity error:", e);
    await thinking.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};

export const cmdTtsOpenai: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide text. Usage: `mewo ai tts openai <text>`")] });
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    await msg.reply({ embeds: [unavailable()] });
    return;
  }
  const text = args.join(" ").slice(0, 4096);
  const thinking = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x00B4FF).setDescription("🔊 Generating speech...")]
  });
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: "tts-1", voice: "alloy", input: text }),
    });
    if (!res.ok) {
      console.error(`[MEWO AI] tts-openai HTTP ${res.status}`);
      throw new Error("tts failed");
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await thinking.delete().catch(() => {});
    await msg.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x00B4FF)
        .setTitle("Text to Speech")
        .setDescription(`> ${text.slice(0, 300)}`)
        .setFooter({ text: "mewo • ai • OpenAI TTS (alloy)" })
      ],
      files: [{ attachment: buffer, name: "speech.mp3" }],
    });
  } catch (e) {
    console.error("[MEWO AI] tts-openai error:", e);
    await thinking.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};

export const cmdTtsElevenlabs: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide text. Usage: `mewo ai tts elevenlabs <text>`")] });
    return;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    await msg.reply({ embeds: [unavailable()] });
    return;
  }
  const text = args.join(" ").slice(0, 2500);
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const thinking = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x9B59B6).setDescription("🎙️ Generating speech...")]
  });
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_monolingual_v1", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!res.ok) {
      console.error(`[MEWO AI] tts-elevenlabs HTTP ${res.status}`);
      throw new Error("tts failed");
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await thinking.delete().catch(() => {});
    await msg.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("Text to Speech")
        .setDescription(`> ${text.slice(0, 300)}`)
        .setFooter({ text: "mewo • ai • ElevenLabs" })
      ],
      files: [{ attachment: buffer, name: "speech.mp3" }],
    });
  } catch (e) {
    console.error("[MEWO AI] tts-elevenlabs error:", e);
    await thinking.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};

export const cmdDeepGeolocate: Handler = async (msg, args) => {
  if (!args.length) {
    await msg.reply({ embeds: [err("Provide an IP address or domain. Usage: `mewo ai deepgeolocate <ip/domain>`")] });
    return;
  }
  const target = args[0];
  const thinking = await msg.reply({
    embeds: [new EmbedBuilder().setColor(0x00B4FF).setDescription("🌍 Running deep geolocation analysis...")]
  });
  try {
    const [r1, r2, r3] = await Promise.allSettled([
      fetch(`https://ipapi.co/${target}/json/`).then(r => r.json()),
      fetch(`https://ip-api.com/json/${target}?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query`).then(r => r.json()),
      fetch(`https://ipinfo.io/${target}/json`).then(r => r.json()),
    ]);

    const d1 = r1.status === "fulfilled" ? r1.value as Record<string, unknown> : null;
    const d2 = r2.status === "fulfilled" ? r2.value as Record<string, unknown> : null;
    const d3 = r3.status === "fulfilled" ? r3.value as Record<string, unknown> : null;

    const pick = (...vals: unknown[]) => vals.find(v => v && String(v) !== "N/A" && String(v) !== "undefined" && String(v) !== "") ?? "N/A";

    const country = pick(d1?.["country_name"], d2?.["country"],    d3?.["country"]);
    const region  = pick(d1?.["region"],       d2?.["regionName"], d3?.["region"]);
    const city    = pick(d1?.["city"],          d2?.["city"],       d3?.["city"]);
    const isp     = pick(d1?.["org"],           d2?.["isp"],        d3?.["org"]);
    const asn     = pick(d1?.["asn"],           d2?.["as"],         d3?.["org"]);
    const tz      = pick(d1?.["timezone"],      d2?.["timezone"],   d3?.["timezone"]);
    const lat     = pick(d1?.["latitude"],      d2?.["lat"]);
    const lon     = pick(d1?.["longitude"],     d2?.["lon"]);
    const postal  = pick(d1?.["postal"],        d2?.["zip"],        d3?.["postal"]);
    const mobile  = d2?.["mobile"]  ?? "Unknown";
    const proxy   = d2?.["proxy"]   ?? "Unknown";
    const hosting = d2?.["hosting"] ?? "Unknown";

    const mapsUrl = lat !== "N/A" && lon !== "N/A"
      ? `[View on Map](https://www.google.com/maps?q=${lat},${lon})`
      : "N/A";

    await thinking.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x00B4FF)
        .setTitle(`🌍 Deep Geolocation — ${target}`)
        .addFields(
          { name: "Country",     value: String(country), inline: true },
          { name: "Region",      value: String(region),  inline: true },
          { name: "City",        value: String(city),    inline: true },
          { name: "Postal Code", value: String(postal),  inline: true },
          { name: "Coordinates", value: lat !== "N/A" ? `${lat}, ${lon}` : "N/A", inline: true },
          { name: "Map",         value: mapsUrl,         inline: true },
          { name: "ISP",         value: String(isp),     inline: false },
          { name: "ASN",         value: String(asn),     inline: true },
          { name: "Timezone",    value: String(tz),      inline: true },
          { name: "Mobile",      value: String(mobile),  inline: true },
          { name: "Proxy/VPN",   value: String(proxy),   inline: true },
          { name: "Hosting/DC",  value: String(hosting), inline: true },
        )
        .setFooter({ text: "mewo • ai • ipapi.co + ip-api.com + ipinfo.io" })
      ],
    });
  } catch (e) {
    console.error("[MEWO AI] deepgeolocate error:", e);
    await thinking.edit({ embeds: [err("Something went wrong. Please try again.")] });
  }
};
