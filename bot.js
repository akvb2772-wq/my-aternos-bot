// ╔══════════════════════════════════════╗
// ║      🎮 Minecraft AFK Bot v6.0      ║
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
  botUsernames: [],      // [{ name, version }]
  watchedPlayers: [],
  autoReply: true,
};

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch(e) {}
}
function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return;
    const loaded = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    // توافق مع النسخ القديمة (أسماء نصية بدون كائن)
    if (Array.isArray(loaded.botUsernames) && loaded.botUsernames.length > 0 && typeof loaded.botUsernames[0] === 'string') {
      loaded.botUsernames = loaded.botUsernames.map(n => ({ name: n, version: 'latest' }));
    }
    settings = { ...settings, ...loaded };
  } catch(e) {}
}

function getBotNames() {
  return settings.botUsernames.map(b => b.name);
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
    if (!fs.existsSync(SERVERS_FILE)) return;
    JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'))
      .forEach(s => serversList.push(createServerObj(s.ip, s.port)));
    console.log(`📂 تم تحميل ${serversList.length} سيرفر.`);
  } catch(e) { console.error('⚠️ خطأ تحميل:', e.message); }
}

function getTime() {
  return new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
}

function parseServer(text) {
  const clean = text.trim();
  const parts = clean.includes(':') ? clean.split(':') : clean.split(' ');
  const ip    = parts[0]?.trim();
  const port  = parseInt(parts[1]?.trim());
  return { ip, port };
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
//  حالات الانتظار
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const pendingState = {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  إرسال رسالة داخل ماينكرافت
//  الطريقة الأصح: command_request بدل text packet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendMCMessage(conn, message, cb) {
  try {
    conn.write('command_request', {
      command:  `say ${message}`,
      origin:   { type: 'player', uuid: '', request_id: '' },
      internal: false,
      version:  52,
    });
    if (cb) cb(true);
  } catch(e1) {
    // fallback: text packet
    try {
      conn.write('text', {
        type: 'chat',
        needs_translation: false,
        source_name: '',
        xuid: '',
        platform_chat_id: '',
        message,
        filtered_message: '',
      });
      if (cb) cb(true);
    } catch(e2) {
      console.error('[sendMC]', e2.message);
      if (cb) cb(false);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  تعديل رسالة موجودة (بدل إرسال جديدة)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function editOrSend(chatId, msgId, text, opts) {
  if (msgId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts })
      .catch(() => bot.sendMessage(chatId, text, opts));
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  القائمة الرئيسية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getMainMenuContent() {
  const botCount  = settings.botUsernames.length;
  const srvCount  = serversList.length;
  const connected = serversList.reduce((n, s) =>
    n + (s.clients.filter(c => c.connection).length > 0 ? 1 : 0), 0);

  let txt = `🎮 لوحة التحكم\n${'━'.repeat(25)}\n\n`;
  txt += `🤖 البوتات: ${botCount}\n`;
  txt += `🌐 السيرفرات: ${srvCount} | متصل: ${connected}\n`;
  txt += `👁️ مراقبة: ${settings.watchedPlayers.length} لاعب\n`;

  const kb = [
    [
      { text: '🌐 السيرفرات', callback_data: 'menu_servers' },
      { text: '🤖 البوتات',   callback_data: 'menu_bots'    },
    ],
    [
      { text: '👁️ المراقبة', callback_data: 'watch_list' },
      { text: '📖 المساعدة', callback_data: 'menu_help'  },
    ],
  ];
  if (srvCount > 0) {
    kb.push([
      { text: '▶️▶️ تشغيل الكل',  callback_data: 'join_all'  },
      { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' },
    ]);
  }
  return { txt, kb };
}

function sendMainMenu(chatId, msgId) {
  const { txt, kb } = getMainMenuContent();
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  قائمة السيرفرات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getServersMenuContent() {
  if (!serversList.length) {
    return {
      txt: `🌐 السيرفرات\n${'━'.repeat(25)}\n\nما في سيرفرات بعد.\nأرسل: سيرفر ip:port`,
      kb: [
        [{ text: '➕ إضافة سيرفر', callback_data: 'add_server_prompt' }],
        [{ text: '🔙 رجوع', callback_data: 'back_main' }],
      ],
    };
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
    txt += `🔹 [${i+1}] ${srv.ip}:${srv.port}\n   ${status}${uptime}`;
    if (srv.serverVersion) txt += ` | 📦 ${srv.serverVersion}`;
    if (connected > 0)     txt += ` | 👥 ${srv.playerCount}`;
    txt += '\n\n';

    kb.push([
      { text: `▶️ تشغيل [${i+1}]`,     callback_data: `join_${i}`     },
      { text: `⏹️ إيقاف [${i+1}]`,     callback_data: `leave_${i}`    },
      { text: `🗑️ حذف [${i+1}]`,       callback_data: `delete_${i}`   },
    ]);
    kb.push([
      { text: `💬 شات [${i+1}]`,        callback_data: `log_${i}`      },
      { text: `👥 لاعبين [${i+1}]`,     callback_data: `players_${i}`  },
      { text: `👁️ مراقبة [${i+1}]`,    callback_data: `watched_${i}`  },
    ]);
    kb.push([
      { text: `📨 إرسال رسالة [${i+1}]`, callback_data: `send_msg_${i}` },
    ]);
  });

  kb.push([{ text: '➕ إضافة سيرفر', callback_data: 'add_server_prompt' }]);
  kb.push([
    { text: '▶️▶️ تشغيل الكل',  callback_data: 'join_all'  },
    { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' },
  ]);
  kb.push([{ text: '🔙 رجوع', callback_data: 'back_main' }]);
  return { txt, kb };
}

function sendServersMenu(chatId, msgId) {
  const { txt, kb } = getServersMenuContent();
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  قائمة البوتات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getBotsMenuContent() {
  if (!settings.botUsernames.length) {
    return {
      txt: `🤖 قائمة البوتات\n${'━'.repeat(25)}\n\nما في بوتات مضافة بعد.`,
      kb: [
        [{ text: '➕ إضافة بوت', callback_data: 'add_bot_prompt' }],
        [{ text: '🔙 رجوع',      callback_data: 'back_main'      }],
      ],
    };
  }
  let txt = `🤖 قائمة البوتات\n${'━'.repeat(25)}\n\n`;
  const kb = [];
  settings.botUsernames.forEach((b, i) => {
    txt += `${i+1}. 👤 ${b.name}  📦 ${b.version}\n`;
    kb.push([{ text: `🗑️ حذف "${b.name}"`, callback_data: `del_bot_${i}` }]);
  });
  txt += `\nإجمالي: ${settings.botUsernames.length} بوت`;
  kb.push([{ text: '➕ إضافة بوت', callback_data: 'add_bot_prompt' }]);
  kb.push([{ text: '🔙 رجوع',      callback_data: 'back_main'      }]);
  return { txt, kb };
}

function sendBotsMenu(chatId, msgId) {
  const { txt, kb } = getBotsMenuContent();
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

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

    // إضافة بوت: الاسم
    if (state.action === 'add_bot_name') {
      const name = text;
      if (name.startsWith('/')) { delete pendingState[chatId]; }
      else if (name.length < 3 || name.length > 16) {
        bot.sendMessage(chatId, `❌ الاسم لازم يكون بين 3-16 حرف.`);
      } else if (getBotNames().includes(name)) {
        bot.sendMessage(chatId, `⚠️ الاسم "${name}" موجود مسبقاً!`);
      } else {
        pendingState[chatId] = { action: 'add_bot_version', data: { name } };
        bot.sendMessage(chatId,
          `✅ الاسم: ${name}\n\nاكتب إصدار البوت (مثال: 1.21.50)\nأو اضغط الزر:`,
          { reply_markup: { inline_keyboard: [[
            { text: '📦 latest (تلقائي)', callback_data: 'set_version_latest' }
          ]] } }
        );
      }
      return;
    }

    // إضافة بوت: الإصدار
    if (state.action === 'add_bot_version') {
      const version = text.trim();
      const name    = state.data.name;
      settings.botUsernames.push({ name, version });
      saveSettings();
      bot.sendMessage(chatId, `✅ تم إضافة البوت!\n👤 ${name}  📦 ${version}`);
      return;
    }

    // إرسال رسالة لسيرفر
    if (state.action === 'send_chat_msg') {
      const srv        = serversList[state.data.srvIndex];
      const activeConn = srv?.clients.find(c => c.connection);
      if (!srv || !activeConn) {
        bot.sendMessage(chatId, `❌ البوت مو متصل! شغّله أول.`);
        return;
      }
      sendMCMessage(activeConn.connection, text, (ok) => {
        bot.sendMessage(chatId, ok
          ? `✅ أُرسلت!\n💬 "${text}"\n🌐 ${srv.ip}`
          : `❌ فشل الإرسال.`
        );
      });
      return;
    }

    // إضافة سيرفر (من حالة الانتظار)
    if (state.action === 'add_server') {
      const { ip, port } = parseServer(text);
      if (!ip || !port || isNaN(port)) {
        bot.sendMessage(chatId, `❌ صيغة خاطئة! أرسل: ip:port`);
        return;
      }
      if (serversList.find(s => s.ip === ip && s.port === port)) {
        bot.sendMessage(chatId, `⚠️ هذا السيرفر موجود مسبقاً!`);
        return;
      }
      serversList.push(createServerObj(ip, port));
      saveServers();
      bot.sendMessage(chatId, `✅ تم إضافة السيرفر!\n🌐 ${ip}:${port}`);
      return;
    }
  }

  // ━━ رسالة لسيرفر: رسالة 1 مرحبا ━━
  if (text.startsWith('رسالة ')) {
    const parts   = text.slice(7).trim().split(' ');
    const srvNum  = parseInt(parts[0]);
    const message = parts.slice(1).join(' ').trim();

    if (isNaN(srvNum) || srvNum < 1 || srvNum > serversList.length) {
      bot.sendMessage(chatId, `❌ رقم السيرفر غلط!\nمثال: رسالة 1 مرحبا`);
      return;
    }
    if (!message) {
      bot.sendMessage(chatId, `❌ اكتب النص!\nمثال: رسالة 1 مرحبا`);
      return;
    }
    const srv        = serversList[srvNum - 1];
    const activeConn = srv.clients.find(c => c.connection);
    if (!activeConn) {
      bot.sendMessage(chatId, `❌ البوت مو متصل بالسيرفر [${srvNum}]!\nشغّله أول.`);
      return;
    }
    sendMCMessage(activeConn.connection, message, (ok) => {
      bot.sendMessage(chatId, ok
        ? `✅ أُرسلت للسيرفر [${srvNum}]:\n💬 "${message}"`
        : `❌ فشل الإرسال.`
      );
    });
    return;
  }

  // ━━ إضافة سيرفر: سيرفر ip:port ━━
  if (text.startsWith('سيرفر ')) {
    const { ip, port } = parseServer(text.slice(7));
    if (!ip || !port || isNaN(port)) {
      bot.sendMessage(chatId, `❌ صيغة خاطئة!\nأرسل: سيرفر ip:port`);
      return;
    }
    if (serversList.find(s => s.ip === ip && s.port === port)) {
      bot.sendMessage(chatId, `⚠️ هذا السيرفر موجود مسبقاً!`);
      return;
    }
    serversList.push(createServerObj(ip, port));
    saveServers();
    bot.sendMessage(chatId, `✅ تم إضافة السيرفر!\n🌐 ${ip}:${port}`);
    return;
  }

  // ━━ مراقبة ━━
  if (text.startsWith('راقب ')) {
    const name = text.slice(5).trim();
    if (settings.watchedPlayers.includes(name)) {
      bot.sendMessage(chatId, `⚠️ "${name}" موجود مسبقاً.`);
      return;
    }
    settings.watchedPlayers.push(name);
    saveSettings();
    bot.sendMessage(chatId, `👁️ تمت إضافة "${name}" للمراقبة!`);
    return;
  }

  if (text.startsWith('وقف مراقبة ')) {
    const name = text.slice(12).trim();
    const idx  = settings.watchedPlayers.indexOf(name);
    if (idx === -1) { bot.sendMessage(chatId, `⚠️ "${name}" مو موجود.`); return; }
    settings.watchedPlayers.splice(idx, 1);
    saveSettings();
    bot.sendMessage(chatId, `✅ تم إيقاف مراقبة "${name}".`);
    return;
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  /start  /status  /help
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/start/, (msg) => sendMainMenu(msg.chat.id, null));

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  if (!serversList.length) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
  let txt = `📊 الحالة\n${'━'.repeat(25)}\n\n`;
  let con = 0;
  serversList.forEach((srv, i) => {
    const c = srv.clients.filter(x => x.connection).length;
    if (c) con++;
    const st = c ? `🟢 متصل (${c})` : '🔴 منقطع';
    let up = '';
    if (srv.connectedAt) {
      const m = Math.floor((Date.now() - srv.connectedAt) / 60000);
      up = m >= 60 ? ` ${Math.floor(m/60)}س ${m%60}د` : ` ${m}د`;
    }
    txt += `${i+1}. ${srv.ip}:${srv.port} — ${st}${up ? ' ⏱' + up : ''}\n`;
    if (srv.serverVersion) txt += `   📦 ${srv.serverVersion} | 👥 ${srv.playerCount}\n`;
  });
  txt += `\n📈 متصل: ${con}/${serversList.length}`;
  bot.sendMessage(chatId, txt);
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 المساعدة\n${'━'.repeat(25)}\n\n` +
    `إضافة سيرفر:\nسيرفر ip:port\n\n` +
    `إرسال رسالة للسيرفر:\nرسالة 1 النص\n\n` +
    `مراقبة لاعب:\nراقب الاسم\n\n` +
    `إيقاف مراقبة:\nوقف مراقبة الاسم\n\n` +
    `/start /status /help`
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الأزرار (callback_query)
//  كل زر يعدّل نفس الرسالة بدل إرسال جديدة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const data   = query.data;
  try { await bot.answerCallbackQuery(query.id); } catch(e) {}

  // ── قائمة السيرفرات ──
  if (data === 'menu_servers') {
    sendServersMenu(chatId, msgId);
    return;
  }

  // ── قائمة البوتات ──
  if (data === 'menu_bots') {
    sendBotsMenu(chatId, msgId);
    return;
  }

  // ── رجوع للقائمة الرئيسية ──
  if (data === 'back_main') {
    sendMainMenu(chatId, msgId);
    return;
  }

  // ── المساعدة ──
  if (data === 'menu_help') {
    editOrSend(chatId, msgId,
      `📖 المساعدة\n${'━'.repeat(25)}\n\n` +
      `إضافة سيرفر: سيرفر ip:port\n` +
      `إرسال رسالة: رسالة 1 النص\n` +
      `مراقبة: راقب الاسم\n` +
      `إيقاف: وقف مراقبة الاسم`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_main' }]] } }
    );
    return;
  }

  // ── إضافة بوت ──
  if (data === 'add_bot_prompt') {
    pendingState[chatId] = { action: 'add_bot_name' };
    bot.sendMessage(chatId, `➕ أرسل اسم البوت (3-16 حرف):`);
    return;
  }

  if (data === 'set_version_latest') {
    const state = pendingState[chatId];
    if (!state || state.action !== 'add_bot_version') return;
    delete pendingState[chatId];
    settings.botUsernames.push({ name: state.data.name, version: 'latest' });
    saveSettings();
    bot.sendMessage(chatId, `✅ تم إضافة "${state.data.name}"  📦 latest`);
    return;
  }

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
    // حدّث نفس الرسالة
    sendBotsMenu(chatId, msgId);
    bot.sendMessage(chatId, `✅ تم حذف "${name}".`);
    return;
  }

  // ── إضافة سيرفر ──
  if (data === 'add_server_prompt') {
    pendingState[chatId] = { action: 'add_server' };
    bot.sendMessage(chatId, `➕ أرسل عنوان السيرفر:\nمثال: play.example.com:19132`);
    return;
  }

  // ── إرسال رسالة للسيرفر ──
  if (data.startsWith('send_msg_')) {
    const i          = parseInt(data.split('_')[2]);
    const srv        = serversList[i];
    const activeConn = srv?.clients.find(c => c.connection);
    if (!activeConn) {
      bot.sendMessage(chatId, `❌ البوت مو متصل بـ ${srv?.ip}!\nشغّله أول.`,
        { reply_markup: { inline_keyboard: [[{ text: '▶️ تشغيل', callback_data: `join_${i}` }]] } }
      );
      return;
    }
    pendingState[chatId] = { action: 'send_chat_msg', data: { srvIndex: i } };
    bot.sendMessage(chatId,
      `📨 إرسال رسالة\n🌐 ${srv.ip}:${srv.port}\n👤 من: ${activeConn.username}\n\nاكتب الرسالة:`
    );
    return;
  }

  // ── تشغيل سيرفر ──
  if (data.startsWith('join_') && data !== 'join_all') {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    if (!settings.botUsernames.length) {
      bot.sendMessage(chatId, `❌ ما في بوتات! أضف بوت أول من 🤖 البوتات.`);
      return;
    }
    srv.autoReconnect     = true;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    bot.sendMessage(chatId, `⏳ جاري الدخول لـ ${srv.ip}...`);
    connectAllBots(chatId, srv);
    return;
  }

  // ── إيقاف سيرفر ──
  if (data.startsWith('leave_') && data !== 'leave_all') {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    srv.autoReconnect = false;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    disconnectAllBots(srv);
    srv.connectedAt = null;
    bot.sendMessage(chatId, `⏹️ تم إيقاف ${srv.ip}.`);
    return;
  }

  // ── حذف سيرفر ──
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
    sendServersMenu(chatId, msgId);
    bot.sendMessage(chatId, `✅ تم حذف ${ip}.`);
    return;
  }

  // ── سجل الشات ──
  if (data.startsWith('log_')) {
    const srv = serversList[parseInt(data.split('_')[1])];
    if (!srv) return;
    editOrSend(chatId, msgId,
      srv.chatLog.length
        ? `💬 آخر رسائل:\n${'━'.repeat(25)}\n\n` + srv.chatLog.slice(-20).join('\n')
        : `💬 سجل الشات فارغ.`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } }
    );
    return;
  }

  // ── سجل اللاعبين ──
  if (data.startsWith('players_')) {
    const srv = serversList[parseInt(data.split('_')[1])];
    if (!srv) return;
    editOrSend(chatId, msgId,
      srv.playerLog.length
        ? `👥 سجل الدخول والخروج:\n${'━'.repeat(25)}\n\n` + srv.playerLog.slice(-20).join('\n')
        : `👥 سجل اللاعبين فارغ.`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } }
    );
    return;
  }

  // ── سجل المراقبة ──
  if (data.startsWith('watched_')) {
    const srv = serversList[parseInt(data.split('_')[1])];
    if (!srv) return;
    editOrSend(chatId, msgId,
      srv.watchedChatLog.length
        ? `👁️ سجل المراقبة:\n${'━'.repeat(25)}\n\n` + srv.watchedChatLog.slice(-20).join('\n')
        : `👁️ سجل المراقبة فارغ.`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } }
    );
    return;
  }

  // ── قائمة المراقبة ──
  if (data === 'watch_list') {
    editOrSend(chatId, msgId,
      settings.watchedPlayers.length
        ? `👁️ اللاعبون المراقبون:\n${'━'.repeat(25)}\n\n` +
          settings.watchedPlayers.map((p, i) => `${i+1}. ${p}`).join('\n') +
          `\n\nإيقاف: وقف مراقبة الاسم`
        : `👁️ قائمة المراقبة فارغة.\n\nإضافة: راقب اسم_اللاعب`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_main' }]] } }
    );
    return;
  }

  // ── تشغيل الكل ──
  if (data === 'join_all') {
    if (!serversList.length) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
    if (!settings.botUsernames.length) { bot.sendMessage(chatId, '❌ ما في بوتات!'); return; }
    bot.sendMessage(chatId, `⏳ جاري تشغيل ${serversList.length} سيرفر...`);
    serversList.forEach(srv => {
      srv.autoReconnect = true;
      srv.reconnectAttempts = 0;
      if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
      connectAllBots(chatId, srv);
    });
    return;
  }

  // ── إيقاف الكل ──
  if (data === 'leave_all') {
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
//  فصل البوتات
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
//  تشغيل البوتات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function connectAllBots(chatId, srv) {
  disconnectAllBots(srv);
  settings.botUsernames.forEach((botObj, i) => {
    setTimeout(() => connectSingleBot(chatId, srv, botObj), i * 2500);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  اتصال بوت واحد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function connectSingleBot(chatId, srv, botObj) {
  const username = botObj.name;
  const version  = (botObj.version && botObj.version !== 'latest') ? botObj.version : undefined;

  const clientObj = { username, connection: null, interval: null };
  srv.clients.push(clientObj);
  const isFirst = () => srv.clients[0] === clientObj;

  try {
    const connOpts = { host: srv.ip, port: srv.port, username, offline: true };
    if (version) connOpts.version = version;

    const conn = bedrock.createClient(connOpts);
    clientObj.connection = conn;

    // إصدار السيرفر
    conn.on('start_game', () => {
      try { srv.serverVersion = conn.version || 'Bedrock'; } catch(e) {}
    });

    // قائمة اللاعبين
    conn.on('player_list', (packet) => {
      try {
        const rec  = packet.records;
        if (!rec) return;
        const list  = Array.isArray(rec) ? rec : (rec.records || []);
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

    // عند الدخول
    conn.on('join', () => {
      srv.reconnectAttempts = 0;
      if (!srv.connectedAt) srv.connectedAt = Date.now();
      if (isFirst()) {
        bot.sendMessage(chatId,
          `✅ دخل البوت!\n🌐 ${srv.ip}:${srv.port}\n📦 ${srv.serverVersion || '...'}\n` +
          `👤 ${settings.botUsernames.map(b => b.name).join(', ')}`
        );
      }
      // AFK tick كل 5 ثوانٍ
      let tick = BigInt(0);
      clientObj.interval = setInterval(() => {
        try {
          tick += BigInt(1);
          conn.write('tick_sync', { request_time: tick, response_time: BigInt(0) });
        } catch(e) {}
      }, 5000);
    });

    // ━━ الشات ━━
    conn.on('text', (packet) => {
      // كل البوتات تستقبل، بس بس الأول يعالج الإشعارات
      const time  = getTime();
      const pType = packet.type;

      // DEBUG في الكونسول
      console.log(`[TEXT] type=${JSON.stringify(pType)} src="${packet.source_name}" msg="${packet.message}"`);

      // رسائل الشات - نقبل أي type مو فارغ المصدر
      const isChat = (
        [0, 1, 'chat', 'raw', 'whisper', 'say'].includes(pType) &&
        packet.source_name &&
        packet.source_name.trim() !== '' &&
        !getBotNames().includes(packet.source_name)
      );

      // رسائل الترجمة (دخول/خروج)
      const isTranslation = [2, 9, 'translation', 'announcement'].includes(pType);

      if (isChat) {
        const entry = `[${time}] 💬 ${packet.source_name}: ${packet.message}`;
        srv.chatLog.push(entry);
        if (srv.chatLog.length > 100) srv.chatLog.shift();

        // إرسال لتيليغرام (من أول بوت فقط لتجنب تكرار)
        if (isFirst()) {
          // لاعب مراقب
          const isWatched = settings.watchedPlayers.some(
            p => p.toLowerCase() === packet.source_name.toLowerCase()
          );
          if (isWatched) {
            srv.watchedChatLog.push(entry);
            if (srv.watchedChatLog.length > 100) srv.watchedChatLog.shift();
            bot.sendMessage(chatId, `👁️ مراقب!\n${entry}`);
          }

          // ذكر البوت
          const mentioned = getBotNames().some(
            n => packet.message?.toLowerCase().includes(n.toLowerCase())
          );
          if (mentioned) {
            bot.sendMessage(chatId, `🔔 ذكروا البوت!\n👤 ${packet.source_name}: ${packet.message}`);
          }

          // كل الرسائل
          bot.sendMessage(chatId, `💬 ${srv.ip}\n${packet.source_name}: ${packet.message}`);
        }

        // رد تلقائي (من أول بوت فقط)
        if (isFirst() && settings.autoReply) {
          const msgLow = (packet.message || '').toLowerCase();
          const sender = packet.source_name;
          let reply = null;

          if (msgLow.includes('مرحبا') || msgLow.includes('هلا') || msgLow === 'hi' || msgLow.includes('hello')) {
            reply = `مرحبا ${sender}!`;
          } else if (msgLow.includes('كيفك') || msgLow.includes('كيف حالك')) {
            reply = `بخير شكراً ${sender}!`;
          } else if (msgLow.includes('وين انت') || msgLow.includes('وينك')) {
            reply = `أنا هنا 😄`;
          } else if (msgLow.includes('اسمك') || msgLow.includes('منو انت')) {
            reply = `اسمي ${username}`;
          } else {
            const wasMentioned = getBotNames().some(n => msgLow.includes(n.toLowerCase()));
            if (wasMentioned) reply = `نعم ${sender}؟`;
          }

          if (reply) {
            // تأخير عشوائي بين 2-4 ثوانٍ لإخفاء أنه بوت
            setTimeout(() => {
              sendMCMessage(conn, reply, (ok) => {
                if (ok) bot.sendMessage(chatId, `🤖 رد على ${sender}: "${reply}"`);
              });
            }, 2000 + Math.random() * 2000);
          }
        }
      }

      else if (isTranslation && isFirst()) {
        const msgKey = packet.message || '';
        const params = packet.parameters || packet.params || [];

        if (msgKey.includes('joined')) {
          const player = params[0] || 'لاعب';
          if (!srv.onlinePlayers.includes(player)) {
            srv.onlinePlayers.push(player);
            srv.playerCount = srv.onlinePlayers.length;
          }
          const entry = `[${time}] 🟢 ${player}`;
          srv.playerLog.push(entry);
          if (srv.playerLog.length > 100) srv.playerLog.shift();
          bot.sendMessage(chatId, `🟢 دخل ${player} | 👥 ${srv.playerCount}`);
          if (settings.watchedPlayers.some(p => p.toLowerCase() === player.toLowerCase())) {
            srv.watchedChatLog.push(entry);
            bot.sendMessage(chatId, `🚨 "${player}" دخل السيرفر!`);
          }
        }
        else if (msgKey.includes('left')) {
          const player = params[0] || 'لاعب';
          srv.onlinePlayers = srv.onlinePlayers.filter(n => n !== player);
          srv.playerCount   = srv.onlinePlayers.length;
          const entry = `[${time}] 🔴 ${player}`;
          srv.playerLog.push(entry);
          if (srv.playerLog.length > 100) srv.playerLog.shift();
          bot.sendMessage(chatId, `🔴 خرج ${player} | 👥 ${srv.playerCount}`);
          if (settings.watchedPlayers.some(p => p.toLowerCase() === player.toLowerCase())) {
            srv.watchedChatLog.push(entry);
            bot.sendMessage(chatId, `🚨 "${player}" خرج!`);
          }
        }
      }
    });

    // طرد / انقطاع
    conn.on('disconnect', (packet) => {
      cleanup();
      if (isFirst()) {
        bot.sendMessage(chatId, `⚠️ طُرد "${username}" من ${srv.ip}\n📝 ${packet.message || 'غير معروف'}`);
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
    bot.sendMessage(chatId, `🛑 توقف الاتصال بـ ${srv.ip} — السيرفر مغلق أو يرفض الدخول.`);
    srv.autoReconnect = false;
    srv.reconnectAttempts = 0;
    srv.connectedAt = null;
    return;
  }
  srv.reconnectAttempts++;
  bot.sendMessage(chatId, `⚠️ انقطع عن ${srv.ip} | محاولة [${srv.reconnectAttempts}/3] بعد 15 ثانية...`);
  srv.reconnectTimer = setTimeout(() => {
    srv.reconnectTimer = null;
    if (srv.autoReconnect) connectAllBots(chatId, srv);
  }, 15000);
}
