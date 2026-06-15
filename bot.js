// ╔══════════════════════════════════════╗
// ║  🎮 Minecraft AFK Bot v14.0 (Final) ║
// ╚══════════════════════════════════════╝

const TOKEN         = process.env.BOT_TOKEN;
const PORT          = process.env.PORT || 7860;
const SERVERS_FILE  = 'servers.json';
const SETTINGS_FILE = 'settings.json';

const TelegramBot = require('node-telegram-bot-api');
const bedrock     = require('bedrock-protocol');
const express     = require('express');
const fs          = require('fs');

if (!TOKEN) {
  console.error("❌ لم يتم العثور على التوكن! تأكد من إضافته في Variables باسم BOT_TOKEN");
}

let settings = { botUsernames: [{ name: 'MC_AFK_Player', version: 'latest' }], watchedPlayers: [] };
const serversList = [];

function saveSettings() { try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch(e) {} }
function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) { saveSettings(); return; }
    const loaded = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (!loaded.botUsernames || loaded.botUsernames.length === 0) loaded.botUsernames = [{ name: 'MC_AFK_Player', version: 'latest' }];
    settings = { ...settings, ...loaded };
  } catch(e) {}
}

function createServerObj(ip, port) {
  return { ip, port, clients: [], autoReconnect: false, reconnectAttempts: 0, connectedAt: null, playerCount: 0, onlinePlayers: [], chatLog: [], playerLog: [] };
}

function saveServers() { try { fs.writeFileSync(SERVERS_FILE, JSON.stringify(serversList.map(s => ({ ip: s.ip, port: s.port })), null, 2)); } catch(e) {} }
function loadServers() {
  try {
    if (!fs.existsSync(SERVERS_FILE)) return;
    JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8')).forEach(s => serversList.push(createServerObj(s.ip, s.port)));
  } catch(e) {}
}

function getTime() { return new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

const app = express();
app.use(express.json());
let bot = null;

if (TOKEN) {
  if (process.env.SPACE_HOST) {
    bot = new TelegramBot(TOKEN, { webHook: false });
    bot.setWebHook(`https://${process.env.SPACE_HOST}/bot${TOKEN}`).catch(e => console.error('Webhook Error:', e.message));
    app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
  } else {
    bot = new TelegramBot(TOKEN, { polling: true });
  }
}

app.get('/', (_, res) => res.send('🚀 البوت v14 يعمل الآن باستقرار ونظام الشات نظيف تماماً!'));
app.listen(PORT, '0.0.0.0');

loadSettings(); loadServers();
const pendingState = {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// حل مشكلة الطرد عند إرسال رسالة 
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendMCMessage(clientObj, message, cb) {
  if (!clientObj || !clientObj.connection) return cb ? cb(false) : null;
  try {
    // التمييز بين إرسال أمر أو إرسال نص لتجنب طرد أثيرنوس
    if (message.startsWith('/')) {
      clientObj.connection.write('command_request', {
        command: message,
        origin: { type: 0, uuid: '', request_id: '' },
        internal: false,
        version: 52
      });
    } else {
      clientObj.connection.write('text', {
        type: 'chat',
        needs_translation: false,
        source_name: clientObj.username,
        xuid: '',
        platform_chat_id: '',
        message: message
      });
    }
    if (cb) cb(true);
  } catch(e) {
    if (cb) cb(false);
  }
}

function editOrSend(chatId, msgId, text, opts) {
  if (!bot) return;
  if (msgId) bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts }).catch(() => bot.sendMessage(chatId, text, opts));
  else bot.sendMessage(chatId, text, opts);
}

function sendMainMenu(chatId, msgId) {
  let txt = `🎮 لوحة التحكم v14.0\n${'━'.repeat(25)}\n\n🤖 البوتات: ${settings.botUsernames.length}\n🌐 السيرفرات: ${serversList.length}`;
  const kb = [
    [{ text: '🌐 السيرفرات', callback_data: 'menu_servers' }, { text: '🤖 البوتات', callback_data: 'menu_bots' }],
    serversList.length > 0 ? [{ text: '▶️ تشغيل الكل', callback_data: 'join_all' }, { text: '⏹️ إيقاف الكل', callback_data: 'leave_all' }] : []
  ];
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

function sendServersMenu(chatId, msgId) {
  if (!serversList.length) return editOrSend(chatId, msgId, `🌐 السيرفرات فارغة.`, { reply_markup: { inline_keyboard: [[{ text: '➕ إضافة', callback_data: 'add_server_prompt' }], [{ text: '🔙 رجوع', callback_data: 'back_main' }]] } });
  let txt = `🌐 قائمة السيرفرات\n${'━'.repeat(25)}\n\n`;
  const kb = [];
  serversList.forEach((srv, i) => {
    const connected = srv.clients.filter(c => c.connection).length > 0;
    txt += `🔹 [${i+1}] ${srv.ip}:${srv.port}\n   الوضع: ${connected ? '🟢 متصل' : (srv.autoReconnect ? '⏳ يعيد الاتصال' : '🔴 متوقف')}\n\n`;
    kb.push([{ text: `▶️ دخول [${i+1}]`, callback_data: `join_${i}` }, { text: `⏹️ خروج [${i+1}]`, callback_data: `leave_${i}` }, { text: `🗑️ حذف [${i+1}]`, callback_data: `delete_${i}` }]);
    kb.push([{ text: `💬 الشات`, callback_data: `log_${i}` }, { text: `📨 إرسال نص`, callback_data: `send_msg_${i}` }]);
  });
  kb.push([{ text: '➕ إضافة سيرفر', callback_data: 'add_server_prompt' }, { text: '🔙 رجوع', callback_data: 'back_main' }]);
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

function sendBotsMenu(chatId, msgId) {
  let txt = `🤖 قائمة البوتات\n${'━'.repeat(25)}\n\n`;
  const kb = [];
  settings.botUsernames.forEach((b, i) => {
    txt += `${i+1}. ${b.name}\n`;
    kb.push([{ text: `🗑️ إزالة "${b.name}"`, callback_data: `del_bot_${i}` }]);
  });
  kb.push([{ text: '➕ إضافة بوت', callback_data: 'add_bot_prompt' }, { text: '🔙 رجوع', callback_data: 'back_main' }]);
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

if (bot) {
  bot.on('message', (msg) => {
    if (!msg.text) return;
    const text = msg.text.trim();
    const chatId = msg.chat.id;

    if (pendingState[chatId]) {
      const state = pendingState[chatId];
      delete pendingState[chatId]; 

      if (state.action === 'add_bot_name') {
        settings.botUsernames.push({ name: text, version: 'latest' }); saveSettings();
        return bot.sendMessage(chatId, `✅ تمت إضافة البوت: ${text}`);
      }
      if (state.action === 'add_server') {
        const parts = text.includes(':') ? text.split(':') : text.split(' ');
        if (!parts[0] || !parts[1]) return bot.sendMessage(chatId, `❌ خطأ! الإدخال الصحيح: IP:PORT`);
        serversList.push(createServerObj(parts[0].trim(), parseInt(parts[1].trim()))); saveServers();
        return bot.sendMessage(chatId, `✅ تمت الإضافة.`);
      }
      if (state.action === 'send_chat_msg') {
        const srv = serversList[state.data.srvIndex];
        const activeConn = srv?.clients.find(c => c.connection);
        if (!activeConn) return bot.sendMessage(chatId, `❌ البوت غير متصل حالياً.`);
        sendMCMessage(activeConn, text, (ok) => bot.sendMessage(chatId, ok ? `✅ أُرسلت الرسالة بنجاح.` : `❌ فشل الإرسال.`));
        return;
      }
    }
  });

  bot.onText(/\/start/, (msg) => sendMainMenu(msg.chat.id, null));

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId  = query.message.message_id;
    const data   = query.data;
    try { await bot.answerCallbackQuery(query.id); } catch(e) {}

    if (data === 'menu_servers') return sendServersMenu(chatId, msgId);
    if (data === 'menu_bots') return sendBotsMenu(chatId, msgId);
    if (data === 'back_main') return sendMainMenu(chatId, msgId);

    if (data === 'add_bot_prompt') { pendingState[chatId] = { action: 'add_bot_name' }; return bot.sendMessage(chatId, `➕ أرسل اسم البوت:`); }
    if (data === 'add_server_prompt') { pendingState[chatId] = { action: 'add_server' }; return bot.sendMessage(chatId, `➕ أرسل IP:PORT :`); }

    if (data.startsWith('del_bot_')) { settings.botUsernames.splice(parseInt(data.split('_')[2]), 1); saveSettings(); return sendBotsMenu(chatId, msgId); }
    if (data.startsWith('delete_')) { const i = parseInt(data.split('_')[1]); disconnectAllBots(serversList[i]); serversList.splice(i, 1); saveServers(); return sendServersMenu(chatId, msgId); }

    if (data.startsWith('join_') && data !== 'join_all') {
      const srv = serversList[parseInt(data.split('_')[1])]; srv.autoReconnect = true;
      bot.sendMessage(chatId, `⏳ جاري الدخول...`); connectAllBots(chatId, srv);
    }
    if (data.startsWith('leave_') && data !== 'leave_all') {
      const srv = serversList[parseInt(data.split('_')[1])]; srv.autoReconnect = false; disconnectAllBots(srv);
      bot.sendMessage(chatId, `⏹️ تم إيقاف الدخول التلقائي وسحب البوتات.`);
    }

    if (data.startsWith('send_msg_')) {
      const i = parseInt(data.split('_')[2]); pendingState[chatId] = { action: 'send_chat_msg', data: { srvIndex: i } };
      return bot.sendMessage(chatId, `📨 اكتب الرسالة (أو الأمر مبدوء بـ /) التي تريد إرسالها:`);
    }

    if (data.startsWith('log_')) {
      const srv = serversList[parseInt(data.split('_')[1])];
      editOrSend(chatId, msgId, srv.chatLog.length ? `💬 الشات المباشر:\n\n` + srv.chatLog.slice(-20).join('\n') : "فارغ.", { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } });
    }
  });
}

function disconnectAllBots(srv) {
  srv.clients.forEach(c => {
    if (c.interval) clearInterval(c.interval);
    if (c.connection) { try { c.connection.removeAllListeners(); c.connection.close(); } catch(e) {} }
  });
  srv.clients = []; srv.connectedAt = null;
}

function connectAllBots(chatId, srv) {
  disconnectAllBots(srv);
  settings.botUsernames.forEach((botObj, i) => setTimeout(() => connectSingleBot(chatId, srv, botObj), i * 2000));
}

function connectSingleBot(chatId, srv, botObj) {
  const username = botObj.name;
  const clientObj = { username, connection: null, interval: null, runtimeEntityId: null };
  srv.clients.push(clientObj);

  function cleanup() { if (clientObj.interval) clearInterval(clientObj.interval); clientObj.connection = null; }

  try {
    const conn = bedrock.createClient({ host: srv.ip, port: srv.port, username, offline: true });
    clientObj.connection = conn;

    conn.on('start_game', (packet) => { if (packet.runtime_entity_id) clientObj.runtimeEntityId = packet.runtime_entity_id; });

    conn.on('spawn', () => {
      srv.reconnectAttempts = 0; if (!srv.connectedAt) srv.connectedAt = Date.now();
      if (bot) bot.sendMessage(chatId, `✅ دخل البوت [${username}] للسيرفر بنجاح.`);
      
      clientObj.interval = setInterval(() => {
        try {
          if (clientObj.runtimeEntityId) {
            conn.write('animate', { action_id: 1, runtime_entity_id: clientObj.runtimeEntityId });
          }
        } catch(e) {}
      }, 15000); 
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // حل مشكلة طلاسم الشات (rawtext JSON)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    conn.on('text', (packet) => {
      let rawMsg = packet.message || '';
      
      // تفكيك تشفير rawtext للحصول على النص الصافي
      try {
        const parsed = JSON.parse(rawMsg);
        if (parsed.rawtext) {
          rawMsg = parsed.rawtext.map(rt => rt.text || '').join('');
        }
      } catch (e) {
        // إذا لم يكن بصيغة JSON، اتركه كما هو
      }

      const cleanMsg = rawMsg.replace(/§[0-9a-fk-or]/ig, '').trim();
      const cleanSource = (packet.source_name || '').replace(/§[0-9a-fk-or]/ig, '').trim();
      const cleanParams = (packet.parameters || []).map(p => p.replace(/§[0-9a-fk-or]/ig, '').trim());

      let displayMsg = '';
      if (packet.type === 'translation') {
        if (cleanMsg === 'chat.type.text' || cleanMsg === 'chat.type.announcement') {
          displayMsg = `${cleanParams[0]}: ${cleanParams.slice(1).join(' ')}`;
        } else if (cleanMsg.includes('joined') || cleanMsg.includes('left')) {
          return; // منع ظهور رسائل الدخول والخروج المتكررة
        } else {
          displayMsg = cleanParams.join(' ');
        }
      } else {
        displayMsg = cleanSource ? `${cleanSource}: ${cleanMsg}` : cleanMsg;
      }

      if (displayMsg && displayMsg.trim() !== '') {
        const time = getTime();
        srv.chatLog.push(`[${time}] 💬 ${displayMsg}`);
        if (srv.chatLog.length > 50) srv.chatLog.shift();
        if (bot && srv.clients[0] === clientObj) bot.sendMessage(chatId, `💬 ${displayMsg}`);
      }
    });

    conn.on('disconnect', (p) => { cleanup(); if (bot) bot.sendMessage(chatId, `⚠️ انفصل البوت: ${p.message || 'إنهاء السيرفر للاتصال'}`); triggerReconnect(chatId, srv); });
    conn.on('close', () => { cleanup(); triggerReconnect(chatId, srv); });
    conn.on('error', () => { cleanup(); triggerReconnect(chatId, srv); });

  } catch(e) { cleanup(); triggerReconnect(chatId, srv); }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// حل مشكلة الدخول التلقائي (محاولات لا نهائية)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function triggerReconnect(chatId, srv) {
  if (!srv.autoReconnect) return;
  srv.reconnectAttempts++;
  if (bot) bot.sendMessage(chatId, `⏳ السيرفر مغلق أو انطرد البوت. جاري إعادة الدخول التلقائي... (المحاولة ${srv.reconnectAttempts})`);
  setTimeout(() => { if (srv.autoReconnect) connectAllBots(chatId, srv); }, 15000); // المحاولة كل 15 ثانية للأبد
            }
