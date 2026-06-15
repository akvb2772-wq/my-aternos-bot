// ╔══════════════════════════════════════╗
// ║      🎮 Minecraft AFK Bot v7.0      ║
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
  botUsernames: [],
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

app.get('/', (_, res) => res.send('🚀 البوت يعمل بشكل ممتاز!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Port: ${PORT}`));

process.on('uncaughtException',  e => console.error('⚠️', e.message));
process.on('unhandledRejection', e => console.error('⚠️', e.message));

loadServers();
loadSettings();
console.log('✅ البوت جاهز تماماً للاستخدام!');

const pendingState = {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  تجاوز حماية السيرفر - إرسال رسالة 
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendMCMessage(conn, message, cb) {
  try {
    // محاكاة حساب إكس بوكس حقيقي لمنع الطرد
    conn.write('text', {
      type: 'chat',
      needs_translation: false,
      source_name: conn.username || '',
      xuid: '2535426523145896', // xuid وهمي مقنع
      platform_chat_id: '',
      message: message,
      filtered_message: message,
      sender_sub_id: 0
    });
    if (cb) cb(true);
  } catch(e) {
    console.error('[sendMC text Error]', e.message);
    if (cb) cb(false);
  }
}

function editOrSend(chatId, msgId, text, opts) {
  if (msgId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts })
      .catch(() => bot.sendMessage(chatId, text, opts));
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  القوائم الرئيسية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendMainMenu(chatId, msgId) {
  const botCount  = settings.botUsernames.length;
  const srvCount  = serversList.length;
  const connected = serversList.reduce((n, s) => n + (s.clients.filter(c => c.connection).length > 0 ? 1 : 0), 0);

  let txt = `🎮 لوحة التحكم\n${'━'.repeat(25)}\n\n🤖 البوتات: ${botCount}\n🌐 السيرفرات: ${srvCount} | متصل: ${connected}\n👁️ مراقبة: ${settings.watchedPlayers.length} لاعب\n`;

  const kb = [
    [{ text: '🌐 السيرفرات', callback_data: 'menu_servers' }, { text: '🤖 البوتات', callback_data: 'menu_bots' }],
    [{ text: '👁️ المراقبة', callback_data: 'watch_list' }, { text: '📖 المساعدة', callback_data: 'menu_help' }],
  ];
  if (srvCount > 0) {
    kb.push([{ text: '▶️▶️ تشغيل الكل', callback_data: 'join_all' }, { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' }]);
  }
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

function sendServersMenu(chatId, msgId) {
  if (!serversList.length) {
    return editOrSend(chatId, msgId, `🌐 السيرفرات\n${'━'.repeat(25)}\n\nلا توجد سيرفرات مضافة.`, {
      reply_markup: { inline_keyboard: [[{ text: '➕ إضافة سيرفر', callback_data: 'add_server_prompt' }], [{ text: '🔙 رجوع', callback_data: 'back_main' }]] }
    });
  }

  let txt = `🌐 السيرفرات\n${'━'.repeat(25)}\n\n`;
  const kb = [];

  serversList.forEach((srv, i) => {
    const connected = srv.clients.filter(c => c.connection).length;
    const status    = connected > 0 ? `🟢 متصل (${connected})` : '🔴 منقطع';
    txt += `🔹 [${i+1}] ${srv.ip}:${srv.port}\n   ${status} | 👥 ${srv.playerCount}\n\n`;

    kb.push([
      { text: `▶️ [${i+1}]`, callback_data: `join_${i}` },
      { text: `⏹️ [${i+1}]`, callback_data: `leave_${i}` },
      { text: `🗑️ [${i+1}]`, callback_data: `delete_${i}` },
    ]);
    kb.push([
      { text: `💬 شات`, callback_data: `log_${i}` },
      { text: `👥 لاعبين`, callback_data: `players_${i}` },
      { text: `📨 إرسال رسالة`, callback_data: `send_msg_${i}` },
    ]);
  });

  kb.push([{ text: '➕ إضافة سيرفر', callback_data: 'add_server_prompt' }]);
  kb.push([{ text: '🔙 رجوع', callback_data: 'back_main' }]);
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

function sendBotsMenu(chatId, msgId) {
  let txt = `🤖 قائمة البوتات\n${'━'.repeat(25)}\n\n`;
  const kb = [];
  if (!settings.botUsernames.length) {
    txt += "لا توجد بوتات.";
  } else {
    settings.botUsernames.forEach((b, i) => {
      txt += `${i+1}. 👤 ${b.name}  📦 ${b.version}\n`;
      kb.push([{ text: `🗑️ حذف "${b.name}"`, callback_data: `del_bot_${i}` }]);
    });
  }
  kb.push([{ text: '➕ إضافة بوت', callback_data: 'add_bot_prompt' }]);
  kb.push([{ text: '🔙 رجوع', callback_data: 'back_main' }]);
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الرسائل النصية والتحكم
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text   = msg.text.trim();
  const chatId = msg.chat.id;

  if (pendingState[chatId]) {
    const state = pendingState[chatId];
    delete pendingState[chatId]; // الحذف الفوري لمنع التداخل

    if (state.action === 'add_bot_name') {
      if (text.startsWith('/')) return;
      settings.botUsernames.push({ name: text, version: 'latest' });
      saveSettings();
      bot.sendMessage(chatId, `✅ تم إضافة البوت: ${text}`);
      return;
    }

    if (state.action === 'add_server') {
      const { ip, port } = parseServer(text);
      if (!ip || !port || isNaN(port)) return bot.sendMessage(chatId, `❌ صيغة خاطئة! أرسل: ip:port`);
      serversList.push(createServerObj(ip, port));
      saveServers();
      bot.sendMessage(chatId, `✅ تم إضافة السيرفر!\n🌐 ${ip}:${port}`);
      return;
    }

    if (state.action === 'send_chat_msg') {
      const srv = serversList[state.data.srvIndex];
      const activeConn = srv?.clients.find(c => c.connection);
      if (!activeConn) return bot.sendMessage(chatId, `❌ البوت مو متصل بالسيرفر حالياً.`);
      sendMCMessage(activeConn.connection, text, (ok) => {
        bot.sendMessage(chatId, ok ? `✅ أُرسلت للسيرفر:\n💬 "${text}"` : `❌ فشل الإرسال (السيرفر يرفض الحزمة).`);
      });
      return;
    }
  }

  // أوامر سريعة
  if (text.startsWith('رسالة ')) {
    const parts = text.slice(7).trim().split(' ');
    const srvNum = parseInt(parts[0]);
    const message = parts.slice(1).join(' ').trim();
    if (!message || isNaN(srvNum)) return bot.sendMessage(chatId, `❌ مثال: رسالة 1 مرحبا`);
    const srv = serversList[srvNum - 1];
    const activeConn = srv?.clients.find(c => c.connection);
    if (!activeConn) return bot.sendMessage(chatId, `❌ البوت غير متصل بالسيرفر رقم ${srvNum}.`);
    sendMCMessage(activeConn.connection, message, (ok) => bot.sendMessage(chatId, ok ? `✅ تم: ${message}` : `❌ فشل.`));
  }

  if (text.startsWith('راقب ')) {
    const name = text.slice(5).trim();
    settings.watchedPlayers.push(name);
    saveSettings();
    bot.sendMessage(chatId, `👁️ تمت إضافة "${name}" للمراقبة!`);
  }

  if (text.startsWith('وقف مراقبة ')) {
    settings.watchedPlayers = settings.watchedPlayers.filter(n => n !== text.slice(12).trim());
    saveSettings();
    bot.sendMessage(chatId, `✅ تم إيقاف مراقبة اللاعب.`);
  }
});

bot.onText(/\/start/, (msg) => sendMainMenu(msg.chat.id, null));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الأزرار (Callbacks)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const data   = query.data;
  try { await bot.answerCallbackQuery(query.id); } catch(e) {}

  if (data === 'menu_servers') return sendServersMenu(chatId, msgId);
  if (data === 'menu_bots') return sendBotsMenu(chatId, msgId);
  if (data === 'back_main') return sendMainMenu(chatId, msgId);

  if (data === 'add_bot_prompt') {
    pendingState[chatId] = { action: 'add_bot_name' };
    return bot.sendMessage(chatId, `➕ أرسل اسم البوت الجديد:`);
  }
  if (data === 'add_server_prompt') {
    pendingState[chatId] = { action: 'add_server' };
    return bot.sendMessage(chatId, `➕ أرسل عنوان السيرفر (مثال: play.server.com:19132):`);
  }

  if (data.startsWith('del_bot_')) {
    settings.botUsernames.splice(parseInt(data.split('_')[2]), 1);
    saveSettings();
    return sendBotsMenu(chatId, msgId);
  }

  if (data.startsWith('delete_')) {
    const i = parseInt(data.split('_')[1]);
    disconnectAllBots(serversList[i]);
    serversList.splice(i, 1);
    saveServers();
    return sendServersMenu(chatId, msgId);
  }

  if (data.startsWith('join_') && data !== 'join_all') {
    const srv = serversList[parseInt(data.split('_')[1])];
    srv.autoReconnect = true;
    bot.sendMessage(chatId, `⏳ جاري الدخول إلى ${srv.ip}...`);
    connectAllBots(chatId, srv);
  }

  if (data.startsWith('leave_') && data !== 'leave_all') {
    const srv = serversList[parseInt(data.split('_')[1])];
    srv.autoReconnect = false;
    disconnectAllBots(srv);
    bot.sendMessage(chatId, `⏹️ تم إيقاف البوت في ${srv.ip}.`);
  }

  if (data.startsWith('send_msg_')) {
    const i = parseInt(data.split('_')[2]);
    pendingState[chatId] = { action: 'send_chat_msg', data: { srvIndex: i } };
    return bot.sendMessage(chatId, `📨 اكتب الرسالة لإرسالها للسيرفر رقم [${i+1}]:`);
  }

  if (data.startsWith('log_')) {
    const srv = serversList[parseInt(data.split('_')[1])];
    editOrSend(chatId, msgId, srv.chatLog.length ? `💬 آخر رسائل:\n\n` + srv.chatLog.slice(-15).join('\n') : "الشات فارغ.", { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } });
  }

  if (data.startsWith('players_')) {
    const srv = serversList[parseInt(data.split('_')[1])];
    editOrSend(chatId, msgId, `👥 المتصلون حالياً (${srv.onlinePlayers.length}):\n${srv.onlinePlayers.join(', ')}`, { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } });
  }

  if (data === 'watch_list') {
    editOrSend(chatId, msgId, `👁️ قائمة المراقبة:\n${settings.watchedPlayers.join('\n') || "فارغة"}`, { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_main' }]] } });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الاتصال بالسيرفر ومعالجة الشات الشاملة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function disconnectAllBots(srv) {
  srv.clients.forEach(c => {
    if (c.interval) clearInterval(c.interval);
    if (c.connection) { try { c.connection.removeAllListeners(); c.connection.close(); } catch(e) {} }
  });
  srv.clients = [];
  srv.playerCount = 0;
  srv.onlinePlayers = [];
}

function connectAllBots(chatId, srv) {
  disconnectAllBots(srv);
  settings.botUsernames.forEach((botObj, i) => {
    setTimeout(() => connectSingleBot(chatId, srv, botObj), i * 2000);
  });
}

function connectSingleBot(chatId, srv, botObj) {
  const username = botObj.name;
  const clientObj = { username, connection: null, interval: null };
  srv.clients.push(clientObj);
  const isFirst = () => srv.clients[0] === clientObj;

  try {
    const conn = bedrock.createClient({ host: srv.ip, port: srv.port, username, offline: true });
    clientObj.connection = conn;

    conn.on('join', () => {
      srv.reconnectAttempts = 0;
      if (isFirst()) bot.sendMessage(chatId, `✅ دخل البوت ${username}\n🌐 السيرفر: ${srv.ip}`);
      let tick = BigInt(0);
      clientObj.interval = setInterval(() => {
        try { tick++; conn.write('tick_sync', { request_time: tick, response_time: BigInt(0) }); } catch(e) {}
      }, 5000);
    });

    // الاستقبال الشامل للرسائل (حل مشكلة اختفاء الشات)
    conn.on('text', (packet) => {
      const type = packet.type;
      const source = packet.source_name || '';
      let msg = packet.message || '';
      const params = packet.parameters || [];
      const time = getTime();

      // تجاهل الرسائل الفارغة ورسائل البوت نفسه
      if (!msg && params.length === 0) return;
      if (getBotNames().includes(source)) return;

      // 1. معالجة الدخول والخروج (Translation Keys)
      if (type === 'translation' || msg.includes('multiplayer.player')) {
        if (msg.includes('joined')) {
          const player = params[0] || source;
          if (!srv.onlinePlayers.includes(player)) srv.onlinePlayers.push(player);
          srv.playerCount = srv.onlinePlayers.length;
          if (isFirst() && settings.watchedPlayers.includes(player)) bot.sendMessage(chatId, `🚨 المراقب ${player} دخل السيرفر!`);
        }
        else if (msg.includes('left')) {
          const player = params[0] || source;
          srv.onlinePlayers = srv.onlinePlayers.filter(n => n !== player);
          srv.playerCount = srv.onlinePlayers.length;
          if (isFirst() && settings.watchedPlayers.includes(player)) bot.sendMessage(chatId, `🚨 المراقب ${player} خرج من السيرفر!`);
        }
        return; // إنهاء هنا حتى لا تنطبع أكواد الترجمة في الشات العادي
      }

      // 2. معالجة الشات العام والإعلانات
      if (['chat', 'raw', 'announce', 'say'].includes(type) || msg) {
        // تنظيف النص من أكواد الألوان في ماينكرافت (مثل §a أو §b)
        let cleanMsg = msg.replace(/§[0-9a-fk-or]/ig, '');
        let displayMsg = source ? `${source}: ${cleanMsg}` : cleanMsg;

        const entry = `[${time}] 💬 ${displayMsg}`;
        srv.chatLog.push(entry);
        if (srv.chatLog.length > 50) srv.chatLog.shift();

        if (isFirst()) {
          // إرسال مباشر للتليجرام
          bot.sendMessage(chatId, `💬 [${srv.ip}]\n${displayMsg}`);

          // الرد التلقائي
          if (settings.autoReply) {
            const msgLow = cleanMsg.toLowerCase();
            let reply = null;
            if (msgLow.includes('مرحبا') || msgLow === 'hi') reply = `مرحبا ${source || 'بك'}!`;
            else if (msgLow.includes('بوتي')) reply = 'نعم؟ أنا هنا.';
            
            if (reply) {
              setTimeout(() => sendMCMessage(conn, reply, null), 3000);
            }
          }
        }
      }
    });

    conn.on('disconnect', (p) => {
      cleanup();
      if (isFirst()) { bot.sendMessage(chatId, `⚠️ طُرد البوت من ${srv.ip}\nالسبب: ${p.message}`); triggerReconnect(chatId, srv); }
    });

    function cleanup() {
      if (clientObj.interval) clearInterval(clientObj.interval);
      clientObj.connection = null;
    }

    conn.on('close', () => { cleanup(); if (isFirst()) triggerReconnect(chatId, srv); });
    conn.on('error', () => { cleanup(); if (isFirst()) triggerReconnect(chatId, srv); });

  } catch(e) {
    clientObj.connection = null;
    if (isFirst()) triggerReconnect(chatId, srv);
  }
}

function triggerReconnect(chatId, srv) {
  if (!srv.autoReconnect || srv.reconnectTimer) return;
  if (srv.reconnectAttempts >= 3) {
    bot.sendMessage(chatId, `🛑 توقف الاتصال بـ ${srv.ip} نهائياً.`);
    srv.autoReconnect = false; return;
  }
  srv.reconnectAttempts++;
  bot.sendMessage(chatId, `⚠️ محاولة إعادة اتصال [${srv.reconnectAttempts}/3] بعد 10 ثوانٍ...`);
  srv.reconnectTimer = setTimeout(() => {
    srv.reconnectTimer = null;
    if (srv.autoReconnect) connectAllBots(chatId, srv);
  }, 10000);
    }
