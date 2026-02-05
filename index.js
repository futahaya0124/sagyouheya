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

// メインボタン（やる・やるかわからん・今日はやらない）
function createMainButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('join')
      .setLabel('やる！')
      .setEmoji('🔥')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('maybe')
      .setLabel('やるかわからん')
      .setEmoji('🤔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('skip')
      .setLabel('今日はやらない')
      .setEmoji('😴')
      .setStyle(ButtonStyle.Danger)
  );
  return [row];
}

// 時間選択ボタン（やるを押した人だけに表示）
function createTimeButtons() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('time_22')
      .setLabel('22時頃から')
      .setEmoji('🌙')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('time_23')
      .setLabel('23時頃から')
      .setEmoji('🌃')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('time_24')
      .setLabel('24時以降')
      .setEmoji('🌛')
      .setStyle(ButtonStyle.Primary)
  );
  return [row];
}

// 初期データ
function createInitialData() {
  return {
    time_22: [],
    time_23: [],
    time_24: [],
    maybe: [],
    skip: []
  };
}

// 参加状況のEmbedを作成
function createEmbed(messageId) {
  const data = participants.get(messageId) || createInitialData();

  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

  // やる人の合計
  const joinCount = data.time_22.length + data.time_23.length + data.time_24.length;

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('🔧 今日の作業はどうする？')
    .setDescription(`**${today}** のガンプラ作業通話の参加状況だよ！\nまずは下のボタンから参加するか選んでね✨`)
    .setFooter({ text: 'ボタンは何度でも押し直せるよ！' })
    .setTimestamp();

  // 参加者がいる枠だけ表示
  const fields = [];

  // 「やる！」系（1人でもいれば親カテゴリ表示）
  if (joinCount > 0) {
    fields.push({ name: `🔥 やる！（${joinCount}人）`, value: '\u200b', inline: false });

    if (data.time_22.length > 0) {
      fields.push({ name: `　🌙 22時頃から（${data.time_22.length}人）`, value: data.time_22.join(', '), inline: false });
    }
    if (data.time_23.length > 0) {
      fields.push({ name: `　🌃 23時頃から（${data.time_23.length}人）`, value: data.time_23.join(', '), inline: false });
    }
    if (data.time_24.length > 0) {
      fields.push({ name: `　🌛 24時以降（${data.time_24.length}人）`, value: data.time_24.join(', '), inline: false });
    }
  }

  if (data.maybe.length > 0) {
    fields.push({ name: `🤔 やるかわからん（${data.maybe.length}人）`, value: data.maybe.join(', '), inline: false });
  }

  if (data.skip.length > 0) {
    fields.push({ name: `😴 今日はやらない（${data.skip.length}人）`, value: data.skip.join(', '), inline: false });
  }

  // 誰もいない場合
  if (fields.length === 0) {
    fields.push({ name: 'まだ誰も押してないよ！', value: '下のボタンから参加してね🙌', inline: false });
  }

  embed.addFields(fields);

  return embed;
}

// ユーザーを全枠から削除
function removeUserFromAll(data, userName) {
  for (const key of Object.keys(data)) {
    data[key] = data[key].filter(name => name !== userName);
  }
}

// 募集メッセージを投稿
async function postDailyMessage() {
  const channel = client.channels.cache.get(process.env.CHANNEL_ID);
  if (!channel) {
    console.error('チャンネルが見つからないよ！CHANNEL_IDを確認してね');
    return;
  }

  const embed = createEmbed('temp');
  const buttons = createMainButtons();

  const message = await channel.send({
    embeds: [embed],
    components: buttons
  });

  participants.set(message.id, createInitialData());

  const updatedEmbed = createEmbed(message.id);
  await message.edit({ embeds: [updatedEmbed] });

  console.log(`投稿したよ！ (${new Date().toLocaleString('ja-JP')})`);
}

// Bot起動時
client.once('ready', () => {
  console.log(`${client.user.tag} がログインしたよ！`);

  // 毎日18時（日本時間）に投稿
  cron.schedule('0 18 * * *', () => {
    console.log('18時になったよ！投稿するね');
    postDailyMessage();
  }, {
    timezone: 'Asia/Tokyo'
  });

  console.log('毎日18時に投稿するよう設定したよ！');
  postDailyMessage(); // テスト投稿（本番では削除してね）
});

// ボタンが押されたとき
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, message } = interaction;
  const userName = user.displayName || user.username;

  // ===== 「やる！」ボタン → 時間選択を本人だけに表示 =====
  if (customId === 'join') {
    await interaction.reply({
      content: '何時から参加する？🕐',
      components: createTimeButtons(),
      ephemeral: true  // 本人だけに見える
    });
    return;
  }

  // ===== 時間選択ボタン（22時・23時・24時以降） =====
  if (customId.startsWith('time_')) {
    // participantsに登録されてる最新の募集メッセージを探す
    let targetMessageId = null;
    for (const [msgId] of participants) {
      targetMessageId = msgId;
    }

    if (!targetMessageId) {
      await interaction.update({ content: '募集メッセージが見つからなかった…ごめん！', components: [] });
      return;
    }

    const data = participants.get(targetMessageId);
    if (!data) {
      await interaction.update({ content: '募集メッセージが見つからなかった…ごめん！', components: [] });
      return;
    }

    // ユーザーを全枠から削除して、選んだ時間に追加
    removeUserFromAll(data, userName);
    data[customId].push(userName);

    // 元の募集メッセージを更新
    try {
      const targetMessage = await interaction.channel.messages.fetch(targetMessageId);
      const updatedEmbed = createEmbed(targetMessageId);
      await targetMessage.edit({ embeds: [updatedEmbed], components: createMainButtons() });
    } catch (e) {
      console.error('メッセージの更新に失敗:', e);
    }

    const timeLabel = customId === 'time_22' ? '22時頃から' : customId === 'time_23' ? '23時頃から' : '24時以降';
    await interaction.update({
      content: `✅ **${timeLabel}** で登録したよ！変更したい場合はもう一度ボタンを押してね`,
      components: []
    });
    return;
  }

  // ===== 「やるかわからん」「今日はやらない」ボタン =====
  if (customId === 'maybe' || customId === 'skip') {
    if (!participants.has(message.id)) {
      participants.set(message.id, createInitialData());
    }

    const data = participants.get(message.id);
    removeUserFromAll(data, userName);
    data[customId].push(userName);

    const updatedEmbed = createEmbed(message.id);
    await interaction.update({
      embeds: [updatedEmbed],
      components: createMainButtons()
    });
    return;
  }
});

// ログイン
client.login(process.env.DISCORD_TOKEN);
