// ---------------------------------------------------
// 24時間稼働用サーバー
// ---------------------------------------------------
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(process.env.PORT || 3000, () => console.log('✅ Web server is running!'));

// ---------------------------------------------------
// Discord Bot 診断モード
// ---------------------------------------------------
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// 1. 環境変数がちゃんと入っているかチェック
console.log('--- 環境変数チェック ---');
console.log('DISCORD_TOKENが入っているか:', process.env.DISCORD_TOKEN ? '⭕ 入ってる' : '❌ 空っぽです！');
console.log('CHANNEL_IDが入っているか:', process.env.CHANNEL_ID ? '⭕ 入ってる' : '❌ 空っぽです！');

if (process.env.DISCORD_TOKEN) {
  // トークンの頭数文字だけ表示（確認用）
  console.log('TOKENの先頭3文字:', process.env.DISCORD_TOKEN.substring(0, 3));
}

// 2. ログインを試みる
console.log('--- ログイン試行 ---');
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log(`✅ 成功！ ${client.user.tag} としてログインしました！`);
  })
  .catch(err => {
    console.error('❌ ログイン失敗！理由はこちら ↓');
    console.error(err); // ここにエラーの正体が出ます
  });

client.once('ready', () => {
    console.log('🚀 Botが準備完了しました！');
});
