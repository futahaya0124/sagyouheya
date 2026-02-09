// index.js 全文

// ---------------------------------------------------
// 1. Renderで24時間動かすためのWebサーバー機能 (Express)
// ---------------------------------------------------
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is alive! 🤖');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Web server is running!');
});
// ---------------------------------------------------

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

const participants = new Map();

// --- ボタン作成関数 ---

function createMainButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join').setLabel('やる！').setEmoji('🔥').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('maybe').setLabel('やるかわからん').setEmoji('🤔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('skip').setLabel('今日はやらない').setEmoji('😴').setStyle(ButtonStyle.Danger)
  );
  return [row];
}

function createTimeButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('time_22').setLabel('22時頃から').setEmoji('🌙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('time_23').setLabel('23時頃から').setEmoji('🌃').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('time_24').setLabel('24時以降').setEmoji('🌛').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('戻る').setStyle(ButtonStyle.Secondary)
  );
  return [row];
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

  if (data.maybe.length > 0) {
    fields.push({ name: `🤔 やるかわからん（${data.maybe.length}人）`, value: data.maybe.join(', '), inline: false });
  }

  if (data.skip.length > 0) {
    fields.push({ name: `😴 今日はやらない（${data.skip.length}人）`, value: data.skip.join(', '), inline: false });
  }

  if (fields.length === 0) {
    fields.push({ name: 'まだ誰も押してないよ！', value: '下のボタンから参加してね🙌', inline: false });
  }

  embed.addFields(fields);
  return embed;
}

function removeUserFromAll(data, userName) {
  for (const key of Object.keys(data)) {
    data[key] = data[key].filter(name => name !== userName);
  }
}

async function postDailyMessage() {
  const channel = client.channels.cache.get(process.env.CHANNEL_ID);
  if (!channel) return;

  const embed = createEmbed('temp');
  const message = await channel.send({
    embeds: [embed],
    components: createMainButtons()
  });

  participants.set(message.id, createInitialData());
}

client.once('ready', () => {
  console.log(`${client.user.tag} がログイン！`);
  cron.schedule('0 18 * * *', () => {
    postDailyMessage();
  }, { timezone: 'Asia/Tokyo' });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, message } = interaction;
  const userName = user.displayName || user.username;

  if (!participants.has(message.id)) {
    participants.set(message.id, createInitialData());
  }
  const data = participants.get(message.id);

  if (customId === 'join') {
    await interaction.update({
      content: '🕒 **何時から始める？**',
      embeds: [],
      components: createTimeButtons()
    });
    return;
  }

  if (customId === 'back') {
    await interaction.update({
      content: '',
      embeds: [createEmbed(message.id)],
      components: createMainButtons()
    });
    return;
  }

  if (customId.startsWith('time_') || customId === 'maybe' || customId === 'skip') {
    removeUserFromAll(data, userName);
    if (customId !== 'back') {
       data[customId].push(userName);
    }

    await interaction.update({
      content: '',
      embeds: [createEmbed(message.id)],
      components: createMainButtons()
    });
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);
