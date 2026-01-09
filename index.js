const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

// 参加者データを保持（メッセージIDごと）
const participants = new Map();

// ボタンの設定
const TIME_SLOTS = {
  'time_21': { label: '21時頃から', emoji: '🌙' },
  'time_22': { label: '22時頃から', emoji: '🌃' },
  'time_23': { label: '23時以降', emoji: '🌛' },
  'time_skip': { label: '今日はやらない', emoji: '😴' }
};

// ボタン行を作成
function createButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('time_21')
      .setLabel('21時頃から')
      .setEmoji('🌙')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('time_22')
      .setLabel('22時頃から')
      .setEmoji('🌃')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('time_23')
      .setLabel('23時以降')
      .setEmoji('🌛')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('time_skip')
      .setLabel('今日はやらない')
      .setEmoji('😴')
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

// 参加状況のEmbedを作成
function createEmbed(messageId) {
  const data = participants.get(messageId) || {
    time_21: [],
    time_22: [],
    time_23: [],
    time_skip: []
  };

  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('🔧 今日の作業はどうする？')
    .setDescription(`**${today}** のガンプラ作業通話の参加状況だよ！\nボタンを押して参加表明してね✨`)
    .addFields(
      {
        name: `🌙 21時頃から（${data.time_21.length}人）`,
        value: data.time_21.length > 0 ? data.time_21.join(', ') : '_まだいないよ_',
        inline: false
      },
      {
        name: `🌃 22時頃から（${data.time_22.length}人）`,
        value: data.time_22.length > 0 ? data.time_22.join(', ') : '_まだいないよ_',
        inline: false
      },
      {
        name: `🌛 23時以降（${data.time_23.length}人）`,
        value: data.time_23.length > 0 ? data.time_23.join(', ') : '_まだいないよ_',
        inline: false
      },
      {
        name: `😴 今日はやらない（${data.time_skip.length}人）`,
        value: data.time_skip.length > 0 ? data.time_skip.join(', ') : '_まだいないよ_',
        inline: false
      }
    )
    .setFooter({ text: 'ボタンは何度でも押し直せるよ！' })
    .setTimestamp();

  return embed;
}

// 募集メッセージを投稿
async function postDailyMessage() {
  const channel = client.channels.cache.get(process.env.CHANNEL_ID);
  if (!channel) {
    console.error('チャンネルが見つからないよ！CHANNEL_IDを確認してね');
    return;
  }

  const embed = createEmbed('temp');
  const buttons = createButtons();

  const message = await channel.send({
    embeds: [embed],
    components: buttons
  });

  // 新しいメッセージの参加者データを初期化
  participants.set(message.id, {
    time_21: [],
    time_22: [],
    time_23: [],
    time_skip: []
  });

  // Embedを正しいメッセージIDで更新
  const updatedEmbed = createEmbed(message.id);
  await message.edit({ embeds: [updatedEmbed] });

  console.log(`投稿したよ！ (${new Date().toLocaleString('ja-JP')})`);
}

// Bot起動時
client.once('ready', () => {
  console.log(`${client.user.tag} がログインしたよ！`);

  // 毎日18時（日本時間）に投稿 - cronは UTC なので 9時間引いて 9:00 UTC = 18:00 JST
  cron.schedule('0 9 * * *', () => {
    console.log('18時になったよ！投稿するね');
    postDailyMessage();
  }, {
    timezone: 'Asia/Tokyo'
  });

  console.log('毎日18時に投稿するよう設定したよ！');
  postDailyMessage(); // テスト投稿


});

// ボタンが押されたとき
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, message } = interaction;

  // このメッセージの参加者データを取得（なければ初期化）
  if (!participants.has(message.id)) {
    participants.set(message.id, {
      time_21: [],
      time_22: [],
      time_23: [],
      time_skip: []
    });
  }

  const data = participants.get(message.id);
  const userName = user.displayName || user.username;

  // まず全ての枠からこのユーザーを削除
  for (const key of Object.keys(data)) {
    data[key] = data[key].filter(name => name !== userName);
  }

  // 選択した枠に追加
  data[customId].push(userName);

  // Embedを更新
  const updatedEmbed = createEmbed(message.id);

  await interaction.update({
    embeds: [updatedEmbed],
    components: createButtons()
  });
});

// ログイン
client.login(process.env.DISCORD_TOKEN);
