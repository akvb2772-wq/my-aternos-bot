// ╔══════════════════════════════════════╗
// ║      🎮 Minecraft AFK Bot v5.0      ║
// ╚══════════════════════════════════════╝

const TOKEN         = process.env.BOT_TOKEN || '7415233806:AAE-KEZiu5zmQKa4dZnpH41Yld9phDpknqA';
const PORT          = process.env.PORT || 7860;
const SERVERS_FILE  = 'servers.json';
const SETTINGS_FILE = 'settings.json';

const TelegramBot = require('node-telegram-bot-api');
const bedrock     = require('bedrock-protocol');
const express     = require('express');
const fs          = require('fs');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الإعدادات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let settings = {
  botUsernames: [],         // قائمة البوتات: [{ name, version }]
  watchedPlayers: [],
  autoReply: true,          // تفعيل الرد التلقائي
};

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch(e) {}
}
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      // توافق مع النسخة القديمة: لو كانت أسماء فقط بدون كائنات
      if (loaded.botUsernames && loaded.botUsernames.length > 0 && typeof loaded.botUsernames[0] === 'string') {
        loaded.botUsernames = loaded.botUsernames.map(n => ({ name: n, version: 'latest' }));
      }
      settings = { ...settings, ...loaded };
    }
  } catch(e) {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  السيرفرات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const serversList = [];

function createServerObj(ip, port) {
  return {
    ip, port,
    clients: [],
    autoReconnect: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    connectedAt: null,
    serverVersion: null,
    playerCount: 0,
    onlinePlayers: [],
    chatLog: [],
    playerLog: [],
    watchedChatLog: [],
  };
}

function saveServers() {
  try {
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(
      serversList.map(s => ({ ip: s.ip, port: s.port })), null, 2
    ));
  } catch(e) {}
}

function loadServers() {
  try {
    if (fs.existsSync(SERVERS_FILE)) {
      JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'))
        .forEach(s => serversList.push(createServerObj(s.ip, s.port)));
      console.log(`📂 تم تحميل ${serversList.length} سيرفر.`);
    }
  } catch(e) { console.error('⚠️ خطأ تحميل:', e.message); }
}

function getTime() {
  return new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
}

// مساعد: يرجع قائمة الأسماء فقط
function getBotNames() {
  return settings.botUsernames.map(b => b.name);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Express + Bot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const app = express();
app.use(express.json());

let bot;
const SPACE_HOST = process.env.SPACE_HOST;

if (SPACE_HOST) {
  bot = new TelegramBot(TOKEN, { webHook: false });
  bot.setWebHook(`https://${SPACE_HOST}/bot${TOKEN}`)
    .then(() => console.log('✅ Webhook جاهز'))
    .catch(e => console.error('⚠️ Webhook:', e.message));
  app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log('🔄 Polling mode');
}

app.get('/', (_, res) => res.send('🚀 البوت يعمل!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Port: ${PORT}`));

process.on('uncaughtException',  e => console.error('⚠️', e.message));
process.on('unhandledRejection', e => console.error('⚠️', e.message));

loadServers();
loadSettings();
console.log('✅ البوت جاهز!');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  حالات الانتظار للإضافة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const pendingState = {}; // chatId -> { action, data }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الرسائل النصية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text   = msg.text.trim();
  const chatId = msg.chat.id;

  // ━━ معالجة حالات الانتظار ━━
  if (pendingState[chatId]) {
    const state = pendingState[chatId];
    delete pendingState[chatId];

    if (state.action === 'add_bot_name') {
      const name = text;
      if (name.length < 3 || name.length > 16) {
        bot.sendMessage(chatId, `❌ الاسم لازم يكون بين 3-16 حرف.`);
        return;
      }
      if (getBotNames().includes(name)) {
        bot.sendMessage(chatId, `⚠️ الاسم "${name}" موجود مسبقاً!`);
        return;
      }
      // انتظر الإصدار
      pendingState[chatId] = { action: 'add_bot_version', data: { name } };
      bot.sendMessage(chatId,
        `✅ الاسم: ${name}\n\nاكتب الآن إصدار البوت:\nمثال: 1.21.50\n\nأو اكتب "latest" لأحدث إصدار`,
        { reply_markup: { inline_keyboard: [[
          { text: '📦 latest (تلقائي)', callback_data: 'set_version_latest' }
        ]] } }
      );
      return;
    }

    if (state.action === 'add_bot_version') {
      const version = text.trim();
      const name    = state.data.name;
      settings.botUsernames.push({ name, version });
      saveSettings();
      bot.sendMessage(chatId,
        `✅ تم إضافة البوت!\n👤 الاسم: ${name}\n📦 الإصدار: ${version}\n\n/start للقائمة`
      );
      return;
    }

    if (state.action === 'add_server') {
      const clean = text.replace('سيرفر ', '').trim();
      const parts = clean.includes(':') ? clean.split(':') : clean.split(' ');
      const ip    = parts[0]?.trim();
      const port  = parseInt(parts[1]?.trim());
      if (!ip || !port || isNaN(port)) {
        bot.sendMessage(chatId, `❌ صيغة خاطئة!\nأرسل: ip:port`);
        return;
      }
      if (serversList.find(s => s.ip === ip && s.port === port)) {
        bot.sendMessage(chatId, `⚠️ هذا السيرفر موجود مسبقاً!`);
        return;
      }
      serversList.push(createServerObj(ip, port));
      saveServers();
      bot.sendMessage(chatId, `✅ تم إضافة السيرفر!\n🌐 ${ip}:${port}\n\n/start للقائمة`);
      return;
    }
  }

  // ━━ إضافة سيرفر بالنص المباشر ━━
  if (text.startsWith('سيرفر ')) {
    const clean = text.replace('سيرفر ', '').trim();
    const parts = clean.includes(':') ? clean.split(':') : clean.split(' ');
    const ip    = parts[0]?.trim();
    const port  = parseInt(parts[1]?.trim());
    if (!ip || !port || isNaN(port)) {
      bot.sendMessage(chatId, `❌ صيغة خاطئة!\nأرسل هكذا:\nسيرفر ip:port`);
      return;
    }
    if (serversList.find(s => s.ip === ip && s.port === port)) {
      bot.sendMessage(chatId, `⚠️ هذا السيرفر موجود مسبقاً!`);
      return;
    }
    serversList.push(createServerObj(ip, port));
    saveServers();
    bot.sendMessage(chatId, `✅ تم إضافة السيرفر!\n🌐 ${ip}:${port}\n\n/start للقائمة`);
    return;
  }

  // ━━ مراقبة لاعب ━━
  if (text.startsWith('راقب ')) {
    const name = text.replace('راقب ', '').trim();
    if (settings.watchedPlayers.includes(name)) {
      bot.sendMessage(chatId, `⚠️ "${name}" موجود بالمراقبة مسبقاً.`);
      return;
    }
    settings.watchedPlayers.push(name);
    saveSettings();
    bot.sendMessage(chatId, `👁️ تمت إضافة "${name}" للمراقبة!\nسأنبهك بكل دخول وخروج وكل رسالة يكتبها.`);
    return;
  }

  // ━━ إيقاف مراقبة ━━
  if (text.startsWith('وقف مراقبة ')) {
    const name = text.replace('وقف مراقبة ', '').trim();
    const idx  = settings.watchedPlayers.indexOf(name);
    if (idx === -1) {
      bot.sendMessage(chatId, `⚠️ "${name}" مو موجود بالمراقبة.`);
      return;
    }
    settings.watchedPlayers.splice(idx, 1);
    saveSettings();
    bot.sendMessage(chatId, `✅ تم إيقاف مراقبة "${name}".`);
    return;
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  /start - القائمة الرئيسية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/start/, (msg) => {
  sendMainMenu(msg.chat.id);
});

function sendMainMenu(chatId) {
  const botCount = settings.botUsernames.length;
  const srvCount = serversList.length;
  const connected = serversList.reduce((n, s) => n + (s.clients.filter(c => c.connection).length > 0 ? 1 : 0), 0);

  let txt = `🎮 لوحة التحكم\n${'━'.repeat(25)}\n\n`;
  txt += `🤖 البوتات: ${botCount}\n`;
  txt += `🌐 السيرفرات: ${srvCount} | متصل: ${connected}\n`;
  txt += `👁️ مراقبة: ${settings.watchedPlayers.length} لاعب\n`;

  const kb = [
    [
      { text: '🌐 السيرفرات',   callback_data: 'menu_servers' },
      { text: '🤖 البوتات',     callback_data: 'menu_bots' },
    ],
    [
      { text: '👁️ المراقبة',   callback_data: 'watch_list' },
      { text: '📖 المساعدة',    callback_data: 'menu_help' },
    ],
  ];

  if (srvCount > 0) {
    kb.push([
      { text: '▶️▶️ تشغيل الكل',  callback_data: 'join_all' },
      { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' },
    ]);
  }

  bot.sendMessage(chatId, txt, { reply_markup: { inline_keyboard: kb } });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  /status
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  if (!serversList.length) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }

  let txt = `📊 حالة السيرفرات\n${'━'.repeat(25)}\n\n`;
  let con  = 0;
  serversList.forEach((srv, i) => {
    const connected = srv.clients.filter(c => c.connection).length;
    if (connected) con++;
    const status = connected ? `🟢 متصل (${connected} حساب)` : '🔴 منقطع';
    let uptime = '';
    if (srv.connectedAt) {
      const m = Math.floor((Date.now() - srv.connectedAt) / 60000);
      uptime = m >= 60 ? ` | ⏱ ${Math.floor(m/60)}س ${m%60}د` : ` | ⏱ ${m}د`;
    }
    txt += `${i+1}. ${srv.ip}:${srv.port}\n   ${status}${uptime}\n`;
    if (srv.serverVersion) txt += `   📦 ${srv.serverVersion} | 👥 ${srv.playerCount} لاعب\n`;
    txt += '\n';
  });
  txt += `📈 متصل: ${con}/${serversList.length}`;
  bot.sendMessage(chatId, txt);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  /help
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 دليل الاستخدام\n${'━'.repeat(25)}\n\n` +
    `🌐 إضافة سيرفر:\nسيرفر ip:port\n\n` +
    `👁️ مراقبة لاعب:\nراقب اسم_اللاعب\n\n` +
    `🚫 إيقاف مراقبة:\nوقف مراقبة الاسم\n\n` +
    `${'━'.repeat(25)}\n` +
    `/start  - القائمة الرئيسية\n` +
    `/status - الحالة السريعة\n` +
    `/help   - هذه الرسالة`
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الأزرار
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data   = query.data;
  try { await bot.answerCallbackQuery(query.id); } catch(e) {}

  // ══════════════════════════════════════
  //  قائمة السيرفرات
  // ══════════════════════════════════════
  if (data === 'menu_servers') {
    if (!serversList.length) {
      bot.sendMessage(chatId,
        `🌐 إضافة سيرفر\n${'━'.repeat(25)}\n\nما في سيرفرات بعد.\nأرسل هكذا:\nسيرفر ip:port`,
        { reply_markup: { inline_keyboard: [[{ text: '➕ إضافة سيرفر', callback_data: 'add_server_prompt' }], [{ text: '🔙 رجوع', callback_data: 'back_main' }]] } }
      );
      return;
    }

    let txt = `🌐 السيرفرات\n${'━'.repeat(25)}\n\n`;
    const kb = [];

    serversList.forEach((srv, i) => {
      const connected = srv.clients.filter(c => c.connection).length;
      const status    = connected > 0 ? `🟢 متصل (${connected})` : '🔴 منقطع';
      let uptime = '';
      if (srv.connectedAt) {
        const m = Math.floor((Date.now() - srv.connectedAt) / 60000);
        uptime  = m >= 60 ? ` | ⏱ ${Math.floor(m/60)}س ${m%60}د` : ` | ⏱ ${m}د`;
      }
      txt += `🔹 [${i+1}] ${srv.ip}:${srv.port}\n`;
      txt += `   ${status}${uptime}`;
      if (srv.serverVersion) txt += ` | 📦 ${srv.serverVersion}`;
      if (connected > 0) txt += ` | 👥 ${srv.playerCount}`;
      txt += '\n\n';

      kb.push([
        { text: `▶️ تشغيل [${i+1}]`,  callback_data: `join_${i}` },
        { text: `⏹️ إيقاف [${i+1}]`,  callback_data: `leave_${i}` },
        { text: `🗑️ حذف [${i+1}]`,    callback_data: `delete_${i}` },
      ]);
      kb.push([
        { text: `💬 شات [${i+1}]`,     callback_data: `log_${i}` },
        { text: `👥 لاعبين [${i+1}]`,  callback_data: `players_${i}` },
        { text: `👁️ مراقبة [${i+1}]`, callback_data: `watched_${i}` },
      ]);
    });

    kb.push([{ text: '➕ إضافة سيرفر', callback_data: 'add_server_prompt' }]);
    kb.push([
      { text: '▶️▶️ تشغيل الكل',  callback_data: 'join_all' },
      { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' },
    ]);
    kb.push([{ text: '🔙 رجوع', callback_data: 'back_main' }]);

    bot.sendMessage(chatId, txt, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // ══════════════════════════════════════
  //  قائمة البوتات
  // ══════════════════════════════════════
  if (data === 'menu_bots') {
    if (!settings.botUsernames.length) {
      bot.sendMessage(chatId,
        `🤖 قائمة البوتات\n${'━'.repeat(25)}\n\nما في بوتات مضافة بعد.\nاضغط ➕ لإضافة بوت جديد.`,
        { reply_markup: { inline_keyboard: [
          [{ text: '➕ إضافة بوت', callback_data: 'add_bot_prompt' }],
          [{ text: '🔙 رجوع',      callback_data: 'back_main' }]
        ] } }
      );
      return;
    }

    let txt = `🤖 قائمة البوتات\n${'━'.repeat(25)}\n\n`;
    const kb = [];

    settings.botUsernames.forEach((b, i) => {
      txt += `${i+1}. 👤 ${b.name} | 📦 ${b.version}\n`;
      kb.push([{ text: `🗑️ حذف "${b.name}"`, callback_data: `del_bot_${i}` }]);
    });

    txt += `\nإجمالي: ${settings.botUsernames.length} بوت`;
    kb.push([{ text: '➕ إضافة بوت', callback_data: 'add_bot_prompt' }]);
    kb.push([{ text: '🔙 رجوع',      callback_data: 'back_main' }]);

    bot.sendMessage(chatId, txt, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // ━━ إضافة بوت: طلب الاسم ━━
  if (data === 'add_bot_prompt') {
    pendingState[chatId] = { action: 'add_bot_name' };
    bot.sendMessage(chatId, `➕ إضافة بوت جديد\n\nأرسل اسم البوت (3-16 حرف):`);
    return;
  }

  // ━━ تعيين الإصدار تلقائي ━━
  if (data === 'set_version_latest') {
    const state = pendingState[chatId];
    if (!state || state.action !== 'add_bot_version') return;
    delete pendingState[chatId];
    const { name } = state.data;
    settings.botUsernames.push({ name, version: 'latest' });
    saveSettings();
    bot.sendMessage(chatId,
      `✅ تم إضافة البوت!\n👤 الاسم: ${name}\n📦 الإصدار: latest\n\n/start للقائمة`
    );
    return;
  }

  // ━━ حذف بوت ━━
  if (data.startsWith('del_bot_')) {
    const i = parseInt(data.split('_')[2]);
    const b = settings.botUsernames[i];
    if (!b) return;
    if (settings.botUsernames.length === 1) {
      bot.sendMessage(chatId, `❌ لازم يبقى بوت واحد على الأقل!`);
      return;
    }
    const name = b.name;
    settings.botUsernames.splice(i, 1);
    saveSettings();
    bot.sendMessage(chatId, `✅ تم حذف "${name}" من قائمة البوتات.`);
    return;
  }

  // ━━ إضافة سيرفر ━━
  if (data === 'add_server_prompt') {
    pendingState[chatId] = { action: 'add_server' };
    bot.sendMessage(chatId, `➕ إضافة سيرفر\n\nأرسل عنوان السيرفر:\nمثال: play.example.com:19132`);
    return;
  }

  // ━━ رجوع للقائمة الرئيسية ━━
  if (data === 'back_main') {
    sendMainMenu(chatId);
    return;
  }

  // ━━ المساعدة ━━
  if (data === 'menu_help') {
    bot.sendMessage(chatId,
      `📖 دليل الاستخدام\n${'━'.repeat(25)}\n\n` +
      `🌐 إضافة سيرفر:\nسيرفر ip:port\n\n` +
      `👁️ مراقبة لاعب:\nراقب اسم_اللاعب\n\n` +
      `🚫 إيقاف مراقبة:\nوقف مراقبة الاسم\n\n` +
      `/start  - القائمة الرئيسية\n` +
      `/status - حالة السيرفرات`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_main' }]] } }
    );
    return;
  }

  // ══════════════════════════════════════
  //  أزرار السيرفرات
  // ══════════════════════════════════════
  if (data.startsWith('join_') && data !== 'join_all') {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    if (!settings.botUsernames.length) {
      bot.sendMessage(chatId, `❌ ما في بوتات مضافة!\nاضغط 🤖 البوتات لإضافة بوت.`);
      return;
    }
    srv.autoReconnect     = true;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    bot.sendMessage(chatId, `⏳ جاري الدخول لـ ${srv.ip} بـ ${settings.botUsernames.length} بوت...`);
    connectAllBots(chatId, srv);
    return;
  }

  if (data.startsWith('leave_') && data !== 'leave_all') {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    srv.autoReconnect     = false;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    disconnectAllBots(srv);
    srv.connectedAt = null;
    bot.sendMessage(chatId, `👋 تم سحب جميع البوتات من ${srv.ip}.`);
    return;
  }

  if (data.startsWith('delete_')) {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    srv.autoReconnect = false;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    disconnectAllBots(srv);
    const ip = srv.ip;
    serversList.splice(i, 1);
    saveServers();
    bot.sendMessage(chatId, `✅ تم حذف ${ip} من القائمة.`);
    return;
  }

  if (data.startsWith('log_')) {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    bot.sendMessage(chatId,
      srv.chatLog.length
        ? `💬 آخر رسائل [${i+1}]:\n${'━'.repeat(25)}\n\n` + srv.chatLog.slice(-20).join('\n')
        : `💬 سجل الشات [${i+1}] فارغ حالياً.`
    );
    return;
  }

  if (data.startsWith('players_')) {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    bot.sendMessage(chatId,
      srv.playerLog.length
        ? `👥 سجل الدخول والخروج [${i+1}]:\n${'━'.repeat(25)}\n\n` + srv.playerLog.slice(-20).join('\n')
        : `👥 سجل اللاعبين [${i+1}] فارغ حالياً.`
    );
    return;
  }

  if (data.startsWith('watched_')) {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    bot.sendMessage(chatId,
      srv.watchedChatLog.length
        ? `👁️ سجل المراقبة [${i+1}]:\n${'━'.repeat(25)}\n\n` + srv.watchedChatLog.slice(-20).join('\n')
        : `👁️ سجل المراقبة [${i+1}] فارغ حالياً.`
    );
    return;
  }

  if (data === 'watch_list') {
    const kb = [[{ text: '🔙 رجوع', callback_data: 'back_main' }]];
    bot.sendMessage(chatId,
      settings.watchedPlayers.length
        ? `👁️ اللاعبون المراقبون:\n${'━'.repeat(25)}\n\n` +
          settings.watchedPlayers.map((p, i) => `${i+1}. ${p}`).join('\n') +
          `\n\nإيقاف المراقبة:\nوقف مراقبة الاسم`
        : `👁️ قائمة المراقبة فارغة.\n\nأضف لاعب:\nراقب اسم_اللاعب`,
      { reply_markup: { inline_keyboard: kb } }
    );
    return;
  }

  if (data === 'join_all') {
    if (!serversList.length) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
    if (!settings.botUsernames.length) { bot.sendMessage(chatId, '❌ ما في بوتات مضافة!'); return; }
    bot.sendMessage(chatId, `⏳ جاري تشغيل ${serversList.length} سيرفر...`);
    serversList.forEach(srv => {
      srv.autoReconnect     = true;
      srv.reconnectAttempts = 0;
      if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
      connectAllBots(chatId, srv);
    });
    return;
  }

  if (data === 'leave_all') {
    if (!serversList.length) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
    serversList.forEach(srv => {
      srv.autoReconnect = false;
      srv.reconnectAttempts = 0;
      if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
      disconnectAllBots(srv);
      srv.connectedAt = null;
    });
    bot.sendMessage(chatId, `⏹️ تم إيقاف جميع السيرفرات.`);
    return;
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  فصل جميع البوتات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function disconnectAllBots(srv) {
  srv.clients.forEach(c => {
    if (c.interval)   { clearInterval(c.interval); c.interval = null; }
    if (c.connection) {
      try { c.connection.removeAllListeners(); c.connection.close(); } catch(e) {}
      c.connection = null;
    }
  });
  srv.clients       = [];
  srv.playerCount   = 0;
  srv.onlinePlayers = [];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  تشغيل جميع البوتات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function connectAllBots(chatId, srv) {
  disconnectAllBots(srv);
  settings.botUsernames.forEach((botObj, i) => {
    setTimeout(() => connectSingleBot(chatId, srv, botObj), i * 2000);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  اتصال بوت واحد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function connectSingleBot(chatId, srv, botObj) {
  const username = botObj.name;
  const version  = botObj.version && botObj.version !== 'latest' ? botObj.version : undefined;

  const clientObj = { username, connection: null, interval: null };
  srv.clients.push(clientObj);
  const isFirst = () => srv.clients[0] === clientObj;

  try {
    const connOpts = { host: srv.ip, port: srv.port, username, offline: true };
    if (version) connOpts.version = version;

    const conn = bedrock.createClient(connOpts);
    clientObj.connection = conn;

    // ━━ إصدار السيرفر ━━
    conn.on('start_game', (packet) => {
      try {
        srv.serverVersion = conn.version || 'Bedrock';
        console.log(`[${srv.ip}] إصدار: ${srv.serverVersion}`);
      } catch(e) {}
    });

    // ━━ عدد اللاعبين ━━
    conn.on('player_list', (packet) => {
      try {
        const rec  = packet.records;
        if (!rec) return;
        const list = Array.isArray(rec) ? rec : (rec.records || []);
        if (!Array.isArray(list)) return;
        const isAdd = !rec.type || rec.type === 'add' || rec.type === 0;
        list.forEach(r => {
          if (!r.username || getBotNames().includes(r.username)) return;
          if (isAdd) {
            if (!srv.onlinePlayers.includes(r.username)) srv.onlinePlayers.push(r.username);
          } else {
            srv.onlinePlayers = srv.onlinePlayers.filter(n => n !== r.username);
          }
        });
        srv.playerCount = srv.onlinePlayers.length;
      } catch(e) {}
    });

    // ━━ عند الاتصال ━━
    conn.on('join', () => {
      srv.reconnectAttempts = 0;
      if (!srv.connectedAt) srv.connectedAt = Date.now();
      if (isFirst()) {
        bot.sendMessage(chatId,
          `✅ دخل البوت للسيرفر!\n${'━'.repeat(25)}\n` +
          `🌐 ${srv.ip}:${srv.port}\n` +
          `📦 الإصدار: ${srv.serverVersion || 'جاري الكشف...'}\n` +
          `👤 البوتات: ${settings.botUsernames.map(b => b.name).join(', ')}`
        );
      }

      // ━━ AFK tick ━━
      let tick = BigInt(0);
      clientObj.interval = setInterval(() => {
        try {
          tick += BigInt(1);
          conn.write('tick_sync', { request_time: tick, response_time: BigInt(0) });
        } catch(e) {}
      }, 5000); // كل 5 ثوانٍ لتجنب الطرد
    });

    // ━━ الشات والرد التلقائي ━━
    conn.on('text', (packet) => {
      if (!isFirst()) return;
      const time  = getTime();
      const pType = packet.type;

      console.log(`[TEXT] type=${JSON.stringify(pType)} | source="${packet.source_name}" | msg="${packet.message}"`);

      const isChat        = [0, 1, 'chat', 'raw', 'whisper', 'say'].includes(pType);
      const isTranslation = [2, 9, 'translation', 'announcement'].includes(pType);

      if (isChat && packet.source_name && !getBotNames().includes(packet.source_name)) {
        const entry = `[${time}] 💬 ${packet.source_name}: ${packet.message}`;
        srv.chatLog.push(entry);
        if (srv.chatLog.length > 100) srv.chatLog.shift();

        // ━━ رد تلقائي ━━ (يرد بدون أن يتسبب بالطرد)
        if (settings.autoReply) {
          const msgLow = (packet.message || '').toLowerCase();
          const sender = packet.source_name;
          let reply = null;

          if (msgLow.includes('مرحبا') || msgLow.includes('مرحبً') || msgLow.includes('هلا') || msgLow.includes('hello') || msgLow.includes('hi ') || msgLow === 'hi') {
            reply = `مرحبا ${sender}!`;
          } else if (msgLow.includes('كيفك') || msgLow.includes('كيف حالك') || msgLow.includes('how are')) {
            reply = `بخير شكراً ${sender}!`;
          } else if (msgLow.includes('وين') || msgLow.includes('اين') || msgLow.includes('where are you')) {
            reply = `أنا هنا 😄`;
          } else if (msgLow.includes('اسمك') || msgLow.includes('your name') || msgLow.includes('who are you')) {
            reply = `اسمي ${username}`;
          }

          // ذكر اسم البوت مباشرة
          const wasMentioned = getBotNames().some(n => msgLow.includes(n.toLowerCase()));
          if (wasMentioned && !reply) {
            reply = `نعم ${sender}؟`;
          }

          if (reply) {
            setTimeout(() => {
              try {
                conn.write('text', {
                  type: 'chat',
                  needs_translation: false,
                  source_name: username,
                  xuid: '',
                  platform_chat_id: '',
                  message: reply,
                  filtered_message: '',
                });
                bot.sendMessage(chatId, `🤖 رد البوت على ${sender}:\n"${reply}"`);
              } catch(e) {}
            }, 1000 + Math.random() * 1000); // تأخير عشوائي طبيعي
          }
        }

        // لاعب مراقب كتب
        const isWatched = settings.watchedPlayers.some(p => p.toLowerCase() === packet.source_name.toLowerCase());
        if (isWatched) {
          srv.watchedChatLog.push(`[${time}] 💬 ${packet.source_name}: ${packet.message}`);
          if (srv.watchedChatLog.length > 100) srv.watchedChatLog.shift();
          bot.sendMessage(chatId, `👁️ رسالة من لاعب مراقب!\n👤 ${packet.source_name}: ${packet.message}`);
        }

        // ذكر البوت
        const mentioned = getBotNames().some(n => packet.message?.toLowerCase().includes(n.toLowerCase()));
        if (mentioned) {
          bot.sendMessage(chatId, `🔔 ذكروا البوت!\n👤 ${packet.source_name}: ${packet.message}`);
        }

        bot.sendMessage(chatId, `💬 [${srv.ip}]\n👤 ${packet.source_name}: ${packet.message}`);
      }

      else if (isTranslation) {
        const msgKey = packet.message || '';
        const params = packet.parameters || packet.params || [];

        if (msgKey.includes('joined')) {
          const player = params[0] || 'لاعب';
          if (!srv.onlinePlayers.includes(player)) {
            srv.onlinePlayers.push(player);
            srv.playerCount = srv.onlinePlayers.length;
          }
          const entry = `[${time}] 🟢 دخل: ${player}`;
          srv.playerLog.push(entry);
          if (srv.playerLog.length > 100) srv.playerLog.shift();
          bot.sendMessage(chatId, `🟢 دخل ${player}\n👥 اللاعبين: ${srv.playerCount}`);

          if (settings.watchedPlayers.some(p => p.toLowerCase() === player.toLowerCase())) {
            srv.watchedChatLog.push(`[${time}] 🟢 دخل: ${player}`);
            bot.sendMessage(chatId, `🚨 تنبيه!\n👤 "${player}" دخل السيرفر!`);
          }
        }

        else if (msgKey.includes('left')) {
          const player = params[0] || 'لاعب';
          srv.onlinePlayers = srv.onlinePlayers.filter(n => n !== player);
          srv.playerCount   = srv.onlinePlayers.length;
          const entry = `[${time}] 🔴 خرج: ${player}`;
          srv.playerLog.push(entry);
          if (srv.playerLog.length > 100) srv.playerLog.shift();
          bot.sendMessage(chatId, `🔴 خرج ${player}\n👥 اللاعبين: ${srv.playerCount}`);

          if (settings.watchedPlayers.some(p => p.toLowerCase() === player.toLowerCase())) {
            srv.watchedChatLog.push(`[${time}] 🔴 خرج: ${player}`);
            bot.sendMessage(chatId, `🚨 تنبيه!\n👤 "${player}" خرج من السيرفر!`);
          }
        }
      }
    });

    // ━━ الطرد ━━
    conn.on('disconnect', (packet) => {
      cleanup();
      if (isFirst()) {
        const reason = packet.message || 'غير معروف';
        bot.sendMessage(chatId, `⚠️ طُرد "${username}" من ${srv.ip}\n📝 السبب: ${reason}`);
        triggerReconnect(chatId, srv);
      }
    });

    function cleanup() {
      if (clientObj.interval) { clearInterval(clientObj.interval); clientObj.interval = null; }
      clientObj.connection = null;
    }

    conn.on('close', () => { cleanup(); if (isFirst()) triggerReconnect(chatId, srv); });
    conn.on('end',   () => { cleanup(); if (isFirst()) triggerReconnect(chatId, srv); });
    conn.on('error', (err) => {
      if (!err.message?.includes('network socket')) console.error(`[${username}]`, err.message);
      cleanup();
      if (isFirst()) triggerReconnect(chatId, srv);
    });

  } catch(e) {
    clientObj.connection = null;
    if (isFirst()) triggerReconnect(chatId, srv);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  إعادة الاتصال
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function triggerReconnect(chatId, srv) {
  if (!srv.autoReconnect || srv.reconnectTimer) return;

  if (srv.reconnectAttempts >= 3) {
    bot.sendMessage(chatId,
      `🛑 توقف الاتصال بـ ${srv.ip}\n` +
      `السيرفر مغلق أو يرفض الدخول.`
    );
    srv.autoReconnect     = false;
    srv.reconnectAttempts = 0;
    srv.connectedAt       = null;
    return;
  }

  srv.reconnectAttempts++;
  bot.sendMessage(chatId,
    `⚠️ انقطع الاتصال بـ ${srv.ip}\n` +
    `محاولة [${srv.reconnectAttempts}/3] بعد 15 ثانية...`
  );

  srv.reconnectTimer = setTimeout(() => {
    srv.reconnectTimer = null;
    if (srv.autoReconnect) connectAllBots(chatId, srv);
  }, 15000);
  }
