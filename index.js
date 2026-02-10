'use strict';

// 1) dotenvは最上段（Renderでは不要でも害なし）
require('dotenv').config();

const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const cron = require('node-cron');

// ======== 例外ハンドリング（沈黙防止） ========
process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ uncaughtException:', err);
});

// ======== Renderのヘルスチェック用Web ========
const app = express();
app.get('/', (_req, res) => res.send('Bot is alive! 🤖'));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`✅ Web server is running! port=${port}`);
});

// ======== 必須環境変数チェック ========
const requiredEnv = ['DISCORD_TOKEN', 'CHANNEL_ID'];
const missing = requiredEnv.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
if (missing.length > 0) {
  console.error(`❌ 必須環境変数が未設定です: ${missing.join(', ')}`);
  console.error('   RenderのEnvironment設定→保存→Clear build cache & deploy（または手動再デプロイ）を確認してください。');
  process.exit(1);
}

const token = String(process.env.DISCORD_TOKEN).trim();
// トークンの一部だけ表示（安全）
console.log(`🔐 TOKEN check: len=${token.length}, head=${token.slice(0, 6)}, tail=${token.slice(-6)}`);

// ======== Discord Client ========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// discord.js 内部ログ（沈黙を潰す）
client
  .on('debug', (m) => console.log('🪵 debug:', m))
  .on('warn', (m) => console.warn('⚠️ warn:', m))
  .on('error', (e) => console.error('❌ client error:', e));

// Shard系（接続が落ちる/張れないの検出）
client.on('shardError', (error) => console.error('❌ shardError:', error));
client.on('shardDisconnect', (event, shardId) => console.warn(`⚠️ shardDisconnect: shard=${shardId}`, event));
client.on('shardReconnecting', (shardId) => console.warn(`⚠️ shardReconnecting: shard=${shardId}`));
client.on('shardReady', (shardId) => console.log(`✅ shardReady: shard=${shardId}`));

// RESTのレート制限（discord.js v14）
client.rest.on('rateLimited', (info) => {
  console.warn('⚠️ REST rateLimited:', info);
});

// ======== 参加者管理 ========
const participants = new Map();

function createMainButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join').setLabel('やる！').setEmoji('🔥').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('maybe').setLabel('やるかわからん').setEmoji('🤔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('skip').setLabel('今日はやらない').setEmoji('😴').setStyle(ButtonStyle.Danger)
  )];
}

function createTimeButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('time_22').setLabel('22時頃から').setEmoji('🌙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('time_23').setLabel('23時頃から').setEmoji('🌃').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('time_24').setLabel('24時以降').setEmoji('🌛').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('戻る').setStyle(ButtonStyle.Secondary)
  )];
}

function createInitialData() {
  return { time_22: [], time_23: [], time_24: [], maybe: [], skip: [] };
}

function createEmbed(messageId) {
  const data = participants.get(messageId) || createInitialData();
  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  const joinCount = data.time_22.length + data.time_23.length + data.time_24.length;

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('🔧 今日の作業はどうする？')
    .setDescription(`**${today}** のガンプラ作業通話の参加状況だよ！\nまずは下のボタンから参加するか選んでね✨`)
    .setFooter({ text: 'ボタンは何度でも押し直せるよ！' })
    .setTimestamp();

  const fields = [];
  if (joinCount > 0) {
    fields.push({ name: `🔥 やる！（${joinCount}人）`, value: '\u200b', inline: false });
    if (data.time_22.length > 0) fields.push({ name: `　🌙 22時頃から（${data.time_22.length}人）`, value: data.time_22.join(', '), inline: false });
    if (data.time_23.length > 0) fields.push({ name: `　🌃 23時頃から（${data.time_23.length}人）`, value: data.time_23.join(', '), inline: false });
    if (data.time_24.length > 0) fields.push({ name: `　🌛 24時以降（${data.time_24.length}人）`, value: data.time_24.join(', '), inline: false });
  }
  if (data.maybe.length > 0) fields.push({ name: `🤔 やるかわからん（${data.maybe.length}人）`, value: data.maybe.join(', '), inline: false });
  if (data.skip.length > 0) fields.push({ name: `😴 今日はやらない（${data.skip.length}人）`, value: data.skip.join(', '), inline: false });

  if (fields.length === 0) fields.push({ name: 'まだ誰も押してないよ！', value: '下のボタンから参加してね🙌', inline: false });
  embed.addFields(fields);
  return embed;
}

function removeUserFromAll(data, userName) {
  for (const key of Object.keys(data)) {
    data[key] = data[key].filter(name => name !== userName);
  }
}

async function postDailyMessage() {
  try {
    // cache依存を排除してfetch
    const channelId = String(process.env.CHANNEL_ID).trim();
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      console.error('❌ チャンネルが見つからない/テキストではありません。CHANNEL_IDを確認してね');
      return;
    }

    const embed = createEmbed('temp');
    const message = await channel.send({ embeds: [embed], components: createMainButtons() });
    participants.set(message.id, createInitialData());
    await message.edit({ embeds: [createEmbed(message.id)] });

    console.log(`✅ 投稿完了！ (${new Date().toLocaleString('ja-JP')})`);
  } catch (e) {
    console.error('❌ postDailyMessage error:', e);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`🚀 ログイン成功！ Bot名: ${c.user.tag}`);

  cron.schedule('0 18 * * *', () => {
    console.log('⏰ cron fired: postDailyMessage');
    void postDailyMessage();
  }, { timezone: 'Asia/Tokyo' });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, message } = interaction;
  // UserにはdisplayNameが無いので安全に（ギルドならmember優先）
  const userName = interaction.member?.displayName || user.username;

  if (!participants.has(message.id)) participants.set(message.id, createInitialData());
  const data = participants.get(message.id);

  if (customId === 'join') {
    await interaction.update({ content: '🕒 **何時から始める？**', embeds: [], components: createTimeButtons() });
    return;
  }
  if (customId === 'back') {
    await interaction.update({ content: '', embeds: [createEmbed(message.id)], components: createMainButtons() });
    return;
  }
  if (customId.startsWith('time_') || customId === 'maybe' || customId === 'skip') {
    removeUserFromAll(data, userName);
    data[customId].push(userName);
    await interaction.update({ content: '', embeds: [createEmbed(message.id)], components: createMainButtons() });
  }
});

// ======== ログイン処理 ========
(async () => {
  console.log('🔑 ログインを試行します...');
  try {
    await client.login(token);
    console.log('✅ client.login() resolved（Ready待ち）');
  } catch (e) {
    console.error('❌ ログイン失敗:', e);
    process.exit(1);
  }
})();
