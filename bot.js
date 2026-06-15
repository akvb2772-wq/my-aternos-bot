// ╔══════════════════════════════════════╗
// ║     🎮 Minecraft AFK Bot v12.0      ║
// ╚══════════════════════════════════════╝

// قراءة التوكن بأمان من متغيرات النظام في Railway
const TOKEN         = process.env.BOT_TOKEN;
const PORT          = process.env.PORT || 7860;
const SERVERS_FILE  = 'servers.json';
const SETTINGS_FILE = 'settings.json';

const TelegramBot = require('node-telegram-bot-api');
const bedrock     = require('bedrock-protocol');
const express     = require('express');
const fs          = require('fs');

if (!TOKEN) {
  console.error("❌ خطأ فادح: لم يتم العثور على التوكن! تأكد من إضافته في تبويب Variables باسم BOT_TOKEN");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  الإعدادات والبيانات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let settings = {
  botUsernames: [{ name: 'MC_AFK_Player', version: 'latest' }],
  watchedPlayers: [],
  autoReply: false,
};

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch(e) {}
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) { saveSettings(); return; }
    const loaded = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (Array.isArray(loaded.botUsernames) && loaded.botUsernames.length === 0) {
      loaded.botUsernames = [{ name: 'MC_AFK_Player', version: 'latest' }];
    }
    settings = { ...settings, ...loaded };
  } catch(e) {}
}

function getBotNames() {
  return settings.botUsernames.map(b => b.name);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  إدارة السيرفرات والإحصائيات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const serversList = [];

function createServerObj(ip, port) {
  return {
    ip, port, clients: [], autoReconnect: false, reconnectTimer: null, reconnectAttempts: 0,
    connectedAt: null, serverVersion: null, playerCount: 0, onlinePlayers: [], chatLog: [], playerLog: [], watchedChatLog: []
  };
}

function saveServers() {
  try { fs.writeFileSync(SERVERS_FILE, JSON.stringify(serversList.map(s => ({ ip: s.ip, port: s.port })), null, 2)); } catch(e) {}
}

function loadServers() {
  try {
    if (!fs.existsSync(SERVERS_FILE)) return;
    JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8')).forEach(s => serversList.push(createServerObj(s.ip, s.port)));
    console.log(`📂 تم تحميل ${serversList.length} سيرفر.`);
  } catch(e) { console.error('⚠️ خطأ تحميل:', e.message); }
}

function getTime() {
  return new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getUptimeString(timestamp) {
  if (!timestamp) return 'غير متصل حالياً';
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000) % 60;
  const mins = Math.floor(diff / 60000) % 60;
  const hours = Math.floor(diff / 3600000);
  return `${hours} ساعة، ${mins} دقيقة، ${secs} ثانية`;
}

function parseServer(text) {
  const clean = text.trim();
  const parts = clean.includes(':') ? clean.split(':') : clean.split(' ');
  return { ip: parts[0]?.trim(), port: parseInt(parts[1]?.trim()) };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  البوت والويب هوك
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const app = express();
app.use(express.json());
let bot;
const SPACE_HOST = process.env.SPACE_HOST;

if (TOKEN) {
  if (SPACE_HOST) {
    bot = new TelegramBot(TOKEN, { webHook: false });
    bot.setWebHook(`https://${SPACE_HOST}/bot${TOKEN}`).catch(e => console.error('⚠️ Webhook:', e.message));
    app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
  } else {
    bot = new TelegramBot(TOKEN, { polling: true });
  }
}

app.get('/', (_, res) => res.send('🚀 نظام البوتات v12.0 المستقر يعمل بأمان كامل!'));
app.listen(PORT, '0.0.0.0');

loadSettings();
loadServers();

const pendingState = {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  إرسال الرسائل الطبيعي المطور
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendMCMessage(conn, message, cb) {
  if (!conn) return cb ? cb(false) : null;
  try {
    setTimeout(() => {
      conn.write('text', {
        type: 'chat',
        needs_translation: false,
        source_name: conn.username,
        xuid: '', 
        platform_chat_id: '',
        message: message
      });
      if (cb) cb(true);
    }, 400); 
  } catch(e) {
    if (cb) cb(false);
  }
}

function editOrSend(chatId, msgId, text, opts) {
  if (!bot) return;
  if (msgId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts }).catch(() => bot.sendMessage(chatId, text, opts));
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  واجهات لوحات التحكم
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendMainMenu(chatId, msgId) {
  const botCount  = settings.botUsernames.length;
  const srvCount  = serversList.length;
  const connected = serversList.reduce((n, s) => n + (s.clients.filter(c => c.connection).length > 0 ? 1 : 0), 0);

  let txt = `🎮 لوحة التحكم الإستراتيجية v12.0\n${'━'.repeat(25)}\n\n🤖 البوتات المسجلة: ${botCount}\n🌐 السيرفرات النشطة: ${srvCount} | متصل الآن: ${connected}\n👁️ قيد المراقبة المستمرة: ${settings.watchedPlayers.length} لاعب\n`;
  const kb = [
    [{ text: '🌐 السيرفرات', callback_data: 'menu_servers' }, { text: '🤖 البوتات', callback_data: 'menu_bots' }],
    [{ text: '👁️ المراقبة', callback_data: 'watch_list' }],
  ];
  if (srvCount > 0) {
    kb.push([{ text: '▶️ تشغيل الكل', callback_data: 'join_all' }, { text: '⏹️ إيقاف الكل', callback_data: 'leave_all' }]);
  }
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

function sendServersMenu(chatId, msgId) {
  if (!serversList.length) {
    return editOrSend(chatId, msgId, `🌐 السيرفرات\n${'━'.repeat(25)}\n\nلا توجد أي سيرفرات مسجلة حالياً.`, {
      reply_markup: { inline_keyboard: [[{ text: '➕ إضافة سيرفر جديد', callback_data: 'add_server_prompt' }], [{ text: '🔙 رجوع للرئيسية', callback_data: 'back_main' }]] }
    });
  }

  let txt = `🌐 قائمة السيرفرات وتتبع الاستقرار\n${'━'.repeat(25)}\n\n`;
  const kb = [];

  serversList.forEach((srv, i) => {
    const connected = srv.clients.filter(c => c.connection).length;
    const status    = connected > 0 ? `🟢 متصل` : '🔴 منقطع';
    const uptime    = connected > 0 ? `⏱️ مدة البقاء: ${getUptimeString(srv.connectedAt)}` : '⏱️ البوت خارج السيرفر';
    
    txt += `🔹 [${i+1}] ${srv.ip}:${srv.port}\n   الوضع: ${status}\n   ${uptime}\n   👥 المتواجدين بالسيرفر: ${srv.playerCount} لاعب\n\n`;

    kb.push([
      { text: `▶️ دخول [${i+1}]`, callback_data: `join_${i}` },
      { text: `⏹️ خروج [${i+1}]`, callback_data: `leave_${i}` },
      { text: `🗑️ حذف [${i+1}]`, callback_data: `delete_${i}` },
    ]);
    kb.push([
      { text: `💬 الشات`, callback_data: `log_${i}` },
      { text: `👥 المتواجدين`, callback_data: `players_${i}` },
      { text: `📨 إرسال نص`, callback_data: `send_msg_${i}` },
    ]);
  });

  kb.push([{ text: '➕ إضافة سيرفر جديد', callback_data: 'add_server_prompt' }]);
  kb.push([{ text: '🔙 رجوع للرئيسية', callback_data: 'back_main' }]);
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

function sendBotsMenu(chatId, msgId) {
  let txt = `🤖 إدارة وإعداد البوتات\n${'━'.repeat(25)}\n\n`;
  const kb = [];
  settings.botUsernames.forEach((b, i) => {
    txt += `${i+1}. 👤 الاسم: ${b.name}\n`;
    kb.push([{ text: `🗑️ إزالة البوت "${b.name}"`, callback_data: `del_bot_${i}` }]);
  });
  kb.push([{ text: '➕ إضافة بوت جديد', callback_data: 'add_bot_prompt' }]);
  kb.push([{ text: '🔙 رجوع للرئيسية', callback_data: 'back_main' }]);
  editOrSend(chatId, msgId, txt, { reply_markup: { inline_keyboard: kb } });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  معالجة الرسائل والتحكم النصي
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if (bot) {
  bot.on('message', (msg) => {
    if (!msg.text) return;
    const text   = msg.text.trim();
    const chatId = msg.chat.id;

    if (pendingState[chatId]) {
      const state = pendingState[chatId];
      delete pendingState[chatId]; 

      if (state.action === 'add_bot_name') {
        if (text.startsWith('/')) return;
        settings.botUsernames.push({ name: text, version: 'latest' });
        saveSettings();
        return bot.sendMessage(chatId, `✅ تم تسجيل البوت بنجاح: ${text}`);
      }

      if (state.action === 'add_server') {
        const { ip, port } = parseServer(text);
        if (!ip || !port || isNaN(port)) return bot.sendMessage(chatId, `❌ خطأ في الصيغة! يرجى الإرسال هكذا -> IP:PORT`);
        serversList.push(createServerObj(ip, port));
        saveServers();
        return bot.sendMessage(chatId, `✅ تم إضافة السيرفر لقائمة التحكم:\n🌐 ${ip}:${port}`);
      }

      if (state.action === 'send_chat_msg') {
        const srv = serversList[state.data.srvIndex];
        const activeConn = srv?.clients.find(c => c.connection);
        if (!activeConn) return bot.sendMessage(chatId, `❌ البوت غير متصل بهذا السيرفر حالياً.`);
        sendMCMessage(activeConn.connection, text, (ok) => {
          bot.sendMessage(chatId, ok ? `✅ تم إرسال الرسالة بنجاح للسيرفر:\n💬 "${text}"` : `❌ فشل الإرسال.`);
        });
        return;
      }
    }

    if (text.startsWith('رسالة ')) {
      const parts = text.slice(7).trim().split(' ');
      const srvNum = parseInt(parts[0]);
      const message = parts.slice(1).join(' ').trim();
      if (!message || isNaN(srvNum)) return bot.sendMessage(chatId, `❌ الصيغة الصحيحة: رسالة 1 أهلاً بالجميع`);
      const srv = serversList[srvNum - 1];
      const activeConn = srv?.clients.find(c => c.connection);
      if (!activeConn) return bot.sendMessage(chatId, `❌ البوت متوقف في السيرفر رقم ${srvNum}.`);
      sendMCMessage(activeConn.connection, message, (ok) => bot.sendMessage(chatId, ok ? `✅ أُرسلت: ${message}` : `❌ فشل الإرسال.`));
    }

    if (text.startsWith('راقب ')) {
      const name = text.slice(5).trim();
      if (!settings.watchedPlayers.includes(name)) { settings.watchedPlayers.push(name); saveSettings(); }
      bot.sendMessage(chatId, `👁️ بدأ تتبع وتحليل حركات اللاعب: "${name}"`);
    }

    if (text.startsWith('وقف مراقبة ')) {
      settings.watchedPlayers = settings.watchedPlayers.filter(n => n !== text.slice(12).trim());
      saveSettings();
      bot.sendMessage(chatId, `✅ تم إلغاء مراقبة اللاعب.`);
    }
  });

  bot.onText(/\/start/, (msg) => sendMainMenu(msg.chat.id, null));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  معالجة ضغطات الأزرار
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if (bot) {
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
      return bot.sendMessage(chatId, `➕ أرسل اسم البوت الجديد الآن:`);
    }
    if (data === 'add_server_prompt') {
      pendingState[chatId] = { action: 'add_server' };
      return bot.sendMessage(chatId, `➕ أرسل عنوان السيرفر والمنفذ (مثال: play.net:19132):`);
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
      bot.sendMessage(chatId, `⏳ جاري الاتصال ونشر البوت الذكي بالسيرفر...`);
      connectAllBots(chatId, srv);
    }

    if (data.startsWith('leave_') && data !== 'leave_all') {
      const srv = serversList[parseInt(data.split('_')[1])];
      srv.autoReconnect = false;
      disconnectAllBots(srv);
      bot.sendMessage(chatId, `⏹️ تم سحب البوتات من السيرفر وإيقاف الاستجابة تلقائياً.`);
    }

    if (data.startsWith('send_msg_')) {
      const i = parseInt(data.split('_')[2]);
      pendingState[chatId] = { action: 'send_chat_msg', data: { srvIndex: i } };
      return bot.sendMessage(chatId, `📨 اكتب الرسالة التي تريد إرسالها الآن للموقع [${i+1}]:`);
    }

    if (data.startsWith('log_')) {
      const srv = serversList[parseInt(data.split('_')[1])];
      editOrSend(chatId, msgId, srv.chatLog.length ? `💬 سجل الرسائل المباشرة الكاملة:\n\n` + srv.chatLog.slice(-20).join('\n') : "لا توجد رسائل مسجلة حتى الآن.", { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } });
    }

    if (data.startsWith('players_')) {
      const srv = serversList[parseInt(data.split('_')[1])];
      let listTxt = `👥 اللاعبون المتواجدون حالياً (${srv.onlinePlayers.length}):\n${srv.onlinePlayers.join(', ') || 'لا يوجد أحد'}\n\n`;
      listTxt += `⏱️ مدة تشغيل البوت الحالية:\n${getUptimeString(srv.connectedAt)}\n\n`;
      listTxt += `📜 سجل الحركة والدخول:\n${srv.playerLog.slice(-10).join('\n') || 'لا توجد سجلات بعد'}`;
      editOrSend(chatId, msgId, listTxt, { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'menu_servers' }]] } });
    }

    if (data === 'watch_list') {
      editOrSend(chatId, msgId, `👁️ الأسماء تحت المراقبة:\n\n${settings.watchedPlayers.join('\n') || "فارغة."}`, { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_main' }]] } });
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ربط الاتصال ومعالجة الشات والتحركات الذكية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function disconnectAllBots(srv) {
  srv.clients.forEach(c => {
    if (c.interval) clearInterval(c.interval);
    if (c.timeout) clearTimeout(c.timeout);
    if (c.connection) { try { c.connection.removeAllListeners(); c.connection.close(); } catch(e) {} }
  });
  srv.clients = []; srv.playerCount = 0; srv.onlinePlayers = []; srv.connectedAt = null;
}

function connectAllBots(chatId, srv) {
  disconnectAllBots(srv);
  settings.botUsernames.forEach((botObj, i) => setTimeout(() => connectSingleBot(chatId, srv, botObj), i * 2500));
}

function connectSingleBot(chatId, srv, botObj) {
  const username = botObj.name;
  const clientObj = { username, connection: null, interval: null, timeout: null, pos: { x: 0, y: 0, z: 0 }, runtimeEntityId: null };
  srv.clients.push(clientObj);
  const isFirst = () => srv.clients[0] === clientObj;

  function cleanup() {
    if (clientObj.interval) clearInterval(clientObj.interval);
    if (clientObj.timeout) clearTimeout(clientObj.timeout);
    clientObj.connection = null;
  }

  try {
    const conn = bedrock.createClient({ host: srv.ip, port: srv.port, username, offline: true });
    clientObj.connection = conn;

    clientObj.timeout = setTimeout(() => {
      if (!srv.connectedAt && isFirst() && bot) {
        bot.sendMessage(chatId, `⚠️ السيرفر [${srv.ip}] لم يستجب للاتصال، جاري إعادة المحاولة...`);
        cleanup(); triggerReconnect(chatId, srv);
      }
    }, 15000);

    // 1. التقاط إحداثيات رسوب اللاعب الحقيقية لمنع طرد الـ Anti-Cheat
    conn.on('start_game', (packet) => {
      if (packet.player_position) {
        clientObj.pos = packet.player_position;
      }
      if (packet.runtime_entity_id) {
        clientObj.runtimeEntityId = packet.runtime_entity_id;
      }
    });

    // 2. تحديث الإحداثيات إذا قام السيرفر بنقل البوت أو تغيير مكانه تلقائياً
    conn.on('move_player', (packet) => {
      if (clientObj.runtimeEntityId && packet.runtime_id === clientObj.runtimeEntityId && packet.position) {
        clientObj.pos = packet.position;
      }
    });

    conn.on('spawn', () => {
      clearTimeout(clientObj.timeout);
      srv.reconnectAttempts = 0;
      if (!srv.connectedAt) srv.connectedAt = Date.now();
      
      if (isFirst() && bot) bot.sendMessage(chatId, `✅ نجح الدخول الآمن! البوت [${username}] متواجد الآن ويتحرك بذكاء.\n🌐 السيرفر: ${srv.ip}`);
      
      let tick = BigInt(0);
      let currentYaw = 0;

      clientObj.interval = setInterval(() => {
        try { 
          tick++; 
          currentYaw = (currentYaw + 20) % 360; 
          
          // إرسال الحزم بالإحداثيات الحقيقية لعدم إثارة جدار الحماية
          conn.write('player_auth_input', {
            pitch: 0, yaw: currentYaw,
            position: clientObj.pos, // الإحداثيات المستلمة من السيرفر بدقة
            moveVecX: 0, moveVecZ: 0,
            inputFlags: BigInt(0), inputMode: 1, playMode: 0, interactionMode: 0,
            tick: tick
          });

          // تمويه إضافي: أرجحة يد اللاعب (Swing Arm) كل 10 ثوانٍ ليوحي بأنه يلعب حقيقةً
          if (tick % BigInt(10) === BigInt(0) && clientObj.runtimeEntityId) {
            conn.write('animate', {
              action_id: 1, // حركات تفاعل اليد القياسية
              runtime_entity_id: clientObj.runtimeEntityId
            });
          }
        } catch(e) {}
      }, 1000); 
    });

    // نظام الشات المطور والموحد لمنع التقطيع
    conn.on('text', (packet) => {
      const type = packet.type;
      const source = packet.source_name || '';
      let msg = packet.message || '';
      const params = packet.parameters || [];
      const time = getTime();

      if (getBotNames().includes(source) || getBotNames().includes(params[0])) return;

      let displayMsg = '';

      if (type === 'translation') {
        if (msg === 'chat.type.text' || msg === 'chat.type.announcement') {
          displayMsg = `${params[0]}: ${params[1]}`;
        } else if (msg.includes('joined')) {
          const player = params[0] || source;
          if (!srv.onlinePlayers.includes(player)) srv.onlinePlayers.push(player);
          srv.playerCount = srv.onlinePlayers.length;
          srv.playerLog.push(`[${time}] 🟢 دخل: ${player}`);
          if (isFirst() && settings.watchedPlayers.includes(player) && bot) bot.sendMessage(chatId, `🚨 المراقب [ ${player} ] دخل السيرفر الآن!`);
          return;
        } else if (msg.includes('left')) {
          const player = params[0] || source;
          srv.onlinePlayers = srv.onlinePlayers.filter(n => n !== player);
          srv.playerCount = srv.onlinePlayers.length;
          srv.playerLog.push(`[${time}] 🔴 خرج: ${player}`);
          if (isFirst() && settings.watchedPlayers.includes(player) && bot) bot.sendMessage(chatId, `🚨 المراقب [ ${player} ] خرج من اللعبة.`);
          return;
        } else {
          displayMsg = params.join(' ');
        }
      } else {
        if (!msg) return;
        displayMsg = source ? `${source}: ${msg}` : msg;
      }

      if (displayMsg) {
        displayMsg = displayMsg.replace(/§[0-9a-fk-or]/ig, '').trim();
        srv.chatLog.push(`[${time}] 💬 ${displayMsg}`);
        if (srv.chatLog.length > 50) srv.chatLog.shift();

        if (isFirst() && bot) bot.sendMessage(chatId, `💬 [${srv.ip}]\n${displayMsg}`);
      }
    });

    conn.on('disconnect', (p) => { 
      cleanup(); 
      if (isFirst() && bot) { 
        bot.sendMessage(chatId, `⚠️ انفصل البوت تلقائياً!\nالسبب المتوفر: ${p.message || 'إنهاء آمن للاتصال عبر السيرفر'}`); 
        triggerReconnect(chatId, srv); 
      } 
    });

    conn.on('close', () => { cleanup(); if (isFirst()) triggerReconnect(chatId, srv); });
    conn.on('error', () => { cleanup(); if (isFirst()) triggerReconnect(chatId, srv); });

  } catch(e) { cleanup(); if (isFirst()) triggerReconnect(chatId, srv); }
}

// نظام إعادة الاتصال الذكي بمهلة مرنة لمنع الحظر
function triggerReconnect(chatId, srv) {
  if (!srv.autoReconnect || srv.reconnectTimer) return;
  if (srv.reconnectAttempts >= 5) {
    if (bot) bot.sendMessage(chatId, `🛑 تم تعليق محاولات الاتصال بالسيرفر ${srv.ip} بعد 5 محاولات لمنع حظر الآي بي.`);
    srv.autoReconnect = false; srv.connectedAt = null; return;
  }
  srv.reconnectAttempts++;
  const delay = 5000 + (srv.reconnectAttempts * 5000); // زيادة الوقت تدريجياً لضمان النجاح
  if (bot) bot.sendMessage(chatId, `⏳ إعادة محاولة الاتصال [${srv.reconnectAttempts}/5] خلال ${delay/1000} ثوانٍ...`);
  srv.reconnectTimer = setTimeout(() => { srv.reconnectTimer = null; if (srv.autoReconnect) connectAllBots(chatId, srv); }, delay);
    }
