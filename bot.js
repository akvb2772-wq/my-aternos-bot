const TOKEN = process.env.BOT_TOKEN || '7415233806:AAE-KEZiu5zmQKa4dZnpH41Yld9phDpknqA';
const PORT = process.env.PORT || 7860;
const SERVERS_FILE = 'servers.json';
const SETTINGS_FILE = 'settings.json';

const TelegramBot = require('node-telegram-bot-api');
const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

// =============================
// إعدادات قابلة للتغيير
// =============================
let settings = {
  botUsername: 'AFK_Bot',
  watchedPlayers: [], // لاعبين نراقبهم
};

function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    }
  } catch (e) {}
}

// =============================
// حفظ وتحميل السيرفرات
// =============================
function saveServers() {
  const data = serversList.map(s => ({ ip: s.ip, port: s.port }));
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(data, null, 2));
}

function loadServers() {
  try {
    if (fs.existsSync(SERVERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
      data.forEach(s => serversList.push(createServerObj(s.ip, s.port)));
      console.log(`📂 تم تحميل ${serversList.length} سيرفر.`);
    }
  } catch (e) {
    console.error('⚠️ خطأ تحميل السيرفرات:', e.message);
  }
}

function createServerObj(ip, port) {
  return {
    ip, port,
    client: null,
    afkInterval: null,
    autoReconnect: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    connectedAt: null,
    lastPosition: { x: 0, y: 64, z: 0 },
    currentTick: BigInt(0),
    serverVersion: null,
    playerCount: 0,
    chatLog: [],       // سجل الشات
    playerLog: [],     // سجل الدخول والخروج
  };
}

// =============================
// Express + Bot Setup
// =============================
const app = express();
app.use(express.json());

const SPACE_HOST = process.env.SPACE_HOST;
let bot;

if (SPACE_HOST) {
  const WEBHOOK_URL = `https://${SPACE_HOST}/bot${TOKEN}`;
  bot = new TelegramBot(TOKEN, { webHook: false });
  bot.setWebHook(WEBHOOK_URL)
    .then(() => console.log(`✅ Webhook: ${WEBHOOK_URL}`))
    .catch(err => console.error('⚠️ خطأ Webhook:', err.message));
  app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
} else {
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log('🔄 Polling mode');
}

app.get('/', (req, res) => res.send('🚀 البوت يعمل!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Server على port ${PORT}`));

process.on('uncaughtException', (err) => console.error('⚠️ خطأ:', err.message));
process.on('unhandledRejection', (err) => console.error('⚠️ رفض:', err.message));

const serversList = [];
loadServers();
loadSettings();
console.log('✅ البوت جاهز!');

// =============================
// استقبال الرسائل
// =============================
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text = msg.text.trim();
  const chatId = msg.chat.id;

  // ➕ إضافة سيرفر
  if (text.startsWith('سيرفر')) {
    let cleanText = text.replace('سيرفر', '').trim();
    let ip = '', port = 0;
    if (cleanText.includes(':')) {
      let parts = cleanText.split(':');
      ip = parts[0].trim();
      port = parseInt(parts[1].trim());
    } else {
      let parts = cleanText.split(' ');
      ip = parts[0].trim();
      port = parseInt(parts[1] ? parts[1].trim() : 0);
    }
    if (ip && port && !isNaN(port)) {
      const exists = serversList.find(s => s.ip === ip && s.port === port);
      if (!exists) {
        serversList.push(createServerObj(ip, port));
        saveServers();
        bot.sendMessage(chatId, `✅ تم إضافة السيرفر!\n🌐 ${ip}:${port}\n\nاكتب /start لعرض القائمة.`);
      } else {
        bot.sendMessage(chatId, `⚠️ هذا السيرفر موجود مسبقاً!`);
      }
    } else {
      bot.sendMessage(chatId, `❌ صيغة خاطئة!\nأرسل هكذا:\nسيرفر ip:port`);
    }
    return;
  }

  // 👁️ مراقبة لاعب - إضافة
  if (text.startsWith('راقب ')) {
    const playerName = text.replace('راقب ', '').trim();
    if (!playerName) return;
    if (!settings.watchedPlayers.includes(playerName)) {
      settings.watchedPlayers.push(playerName);
      saveSettings();
      bot.sendMessage(chatId, `👁️ تمت إضافة "${playerName}" لقائمة المراقبة!\nسأنبهك لما يدخل أو يخرج.`);
    } else {
      bot.sendMessage(chatId, `⚠️ "${playerName}" موجود مسبقاً بالمراقبة.`);
    }
    return;
  }

  // 👁️ إيقاف مراقبة لاعب
  if (text.startsWith('وقف مراقبة ')) {
    const playerName = text.replace('وقف مراقبة ', '').trim();
    const idx = settings.watchedPlayers.indexOf(playerName);
    if (idx !== -1) {
      settings.watchedPlayers.splice(idx, 1);
      saveSettings();
      bot.sendMessage(chatId, `✅ تم إيقاف مراقبة "${playerName}".`);
    } else {
      bot.sendMessage(chatId, `⚠️ "${playerName}" مو موجود بالمراقبة.`);
    }
    return;
  }

  // ✏️ تغيير اسم البوت
  if (text.startsWith('اسم البوت ')) {
    const newName = text.replace('اسم البوت ', '').trim();
    if (newName.length < 3 || newName.length > 16) {
      bot.sendMessage(chatId, `❌ الاسم لازم يكون بين 3-16 حرف.`);
      return;
    }
    settings.botUsername = newName;
    saveSettings();
    // تحديث الاسم بكل السيرفرات الموجودة
    serversList.forEach(s => { s.fixedUsername = newName; });
    bot.sendMessage(chatId, `✅ تم تغيير اسم البوت إلى "${newName}".\nسيُطبق عند إعادة الاتصال.`);
    return;
  }
});

// =============================
// /start - لوحة التحكم
// =============================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (serversList.length === 0) {
    bot.sendMessage(chatId, `🎮 مرحباً بك!\n\nما في سيرفرات مضافة بعد.\nأضف سيرفرك هكذا:\n\nسيرفر ip:port`);
    return;
  }

  let statusMsg = `🎮 لوحة التحكم | سيرفراتك:\n\n`;
  let inline_keyboard = [];

  serversList.forEach((srv, index) => {
    const status = srv.client ? '🟢 متصل' : '🔴 منقطع';
    let timeText = '';
    if (srv.client && srv.connectedAt) {
      const mins = Math.floor((Date.now() - srv.connectedAt) / 60000);
      timeText = ` | ⏱ ${mins} دقيقة`;
    }
    const version = srv.serverVersion ? ` | 📦 ${srv.serverVersion}` : '';
    const players = srv.client ? ` | 👥 ${srv.playerCount}` : '';
    statusMsg += `🔹 [${index + 1}]: ${srv.ip}:${srv.port}\n    ${status}${timeText}${version}${players}\n\n`;

    inline_keyboard.push([
      { text: `▶️ تشغيل [${index + 1}]`, callback_data: `join_${index}` },
      { text: `⏹️ إيقاف [${index + 1}]`, callback_data: `leave_${index}` },
      { text: `🗑️ حذف [${index + 1}]`, callback_data: `delete_${index}` }
    ]);
    inline_keyboard.push([
      { text: `📋 سجل [${index + 1}]`, callback_data: `log_${index}` },
      { text: `👥 لاعبين [${index + 1}]`, callback_data: `players_${index}` }
    ]);
  });

  inline_keyboard.push([
    { text: '▶️▶️ تشغيل الكل', callback_data: 'join_all' },
    { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' }
  ]);

  inline_keyboard.push([
    { text: '👁️ قائمة المراقبة', callback_data: 'watch_list' },
    { text: '⚙️ الإعدادات', callback_data: 'settings_menu' }
  ]);

  bot.sendMessage(chatId, statusMsg, { reply_markup: { inline_keyboard } });
});

// =============================
// /status
// =============================
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  if (serversList.length === 0) {
    bot.sendMessage(chatId, '📭 ما في سيرفرات مضافة.');
    return;
  }

  let statusMsg = '📊 حالة السيرفرات:\n\n';
  let connected = 0;

  serversList.forEach((srv, index) => {
    const status = srv.client ? '🟢 متصل' : '🔴 منقطع';
    if (srv.client) connected++;
    let timeText = '';
    if (srv.client && srv.connectedAt) {
      const mins = Math.floor((Date.now() - srv.connectedAt) / 60000);
      timeText = ` | ⏱ ${mins} دقيقة`;
    }
    const version = srv.serverVersion ? ` | 📦 ${srv.serverVersion}` : '';
    const players = srv.client ? ` | 👥 ${srv.playerCount} لاعب` : '';
    statusMsg += `${index + 1}. ${srv.ip}:${srv.port}\n   ${status}${timeText}${version}${players}\n\n`;
  });

  statusMsg += `📈 المتصل: ${connected}/${serversList.length}`;
  bot.sendMessage(chatId, statusMsg);
});

// =============================
// /help
// =============================
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 كيفية الاستخدام:\n\n` +
    `➕ إضافة سيرفر:\nسيرفر ip:port\n\n` +
    `👁️ مراقبة لاعب:\nراقب اسم_اللاعب\n\n` +
    `🚫 إيقاف مراقبة:\nوقف مراقبة اسم_اللاعب\n\n` +
    `✏️ تغيير اسم البوت:\nاسم البوت الاسم_الجديد\n\n` +
    `📋 الأوامر:\n` +
    `/start - لوحة التحكم\n` +
    `/status - حالة سريعة\n` +
    `/help - هذه الرسالة`
  );
});

// =============================
// الأزرار
// =============================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  try { await bot.answerCallbackQuery(query.id); } catch (e) {}

  if (data.startsWith('join_') && data !== 'join_all') {
    const index = parseInt(data.split('_')[1]);
    const srv = serversList[index];
    if (!srv) return;
    srv.autoReconnect = true;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    bot.sendMessage(chatId, `⏳ جاري الدخول لـ ${srv.ip}...`);
    connectMinecraftBot(chatId, srv);
  }

  else if (data.startsWith('leave_') && data !== 'leave_all') {
    const index = parseInt(data.split('_')[1]);
    const srv = serversList[index];
    if (!srv) return;
    srv.autoReconnect = false;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    if (srv.afkInterval) { clearInterval(srv.afkInterval); srv.afkInterval = null; }
    if (srv.client) {
      try { srv.client.removeAllListeners(); srv.client.close(); } catch (e) {}
      srv.client = null; srv.connectedAt = null;
      bot.sendMessage(chatId, `👋 تم سحب البوت من ${srv.ip}.`);
    } else {
      bot.sendMessage(chatId, `ℹ️ البوت غير متصل أصلاً بـ ${srv.ip}.`);
    }
  }

  else if (data.startsWith('delete_')) {
    const index = parseInt(data.split('_')[1]);
    const srv = serversList[index];
    if (!srv) return;
    srv.autoReconnect = false;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    if (srv.afkInterval) { clearInterval(srv.afkInterval); srv.afkInterval = null; }
    if (srv.client) { try { srv.client.removeAllListeners(); srv.client.close(); } catch (e) {} srv.client = null; }
    const deletedIp = srv.ip;
    serversList.splice(index, 1);
    saveServers();
    bot.sendMessage(chatId, `✅ تم حذف ${deletedIp} من القائمة.`);
  }

  // 📋 سجل الشات
  else if (data.startsWith('log_')) {
    const index = parseInt(data.split('_')[1]);
    const srv = serversList[index];
    if (!srv) return;
    if (srv.chatLog.length === 0) {
      bot.sendMessage(chatId, `📋 سجل الشات للسيرفر [${index + 1}] فارغ.`);
    } else {
      const last20 = srv.chatLog.slice(-20).join('\n');
      bot.sendMessage(chatId, `📋 آخر رسائل السيرفر [${index + 1}]:\n\n${last20}`);
    }
  }

  // 👥 سجل الدخول والخروج
  else if (data.startsWith('players_')) {
    const index = parseInt(data.split('_')[1]);
    const srv = serversList[index];
    if (!srv) return;
    if (srv.playerLog.length === 0) {
      bot.sendMessage(chatId, `👥 ما في سجل دخول/خروج للسيرفر [${index + 1}] بعد.`);
    } else {
      const last20 = srv.playerLog.slice(-20).join('\n');
      bot.sendMessage(chatId, `👥 سجل اللاعبين [${index + 1}]:\n\n${last20}`);
    }
  }

  // 👁️ قائمة المراقبة
  else if (data === 'watch_list') {
    if (settings.watchedPlayers.length === 0) {
      bot.sendMessage(chatId, `👁️ قائمة المراقبة فارغة.\n\nأضف لاعب هكذا:\nراقب اسم_اللاعب`);
    } else {
      bot.sendMessage(chatId, `👁️ اللاعبين المراقبين:\n\n${settings.watchedPlayers.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nإيقاف المراقبة:\nوقف مراقبة الاسم`);
    }
  }

  // ⚙️ الإعدادات
  else if (data === 'settings_menu') {
    bot.sendMessage(chatId,
      `⚙️ الإعدادات الحالية:\n\n` +
      `👤 اسم البوت: ${settings.botUsername}\n` +
      `👁️ لاعبين مراقبين: ${settings.watchedPlayers.length}\n\n` +
      `لتغيير الاسم:\nاسم البوت الاسم_الجديد`
    );
  }

  else if (data === 'join_all') {
    if (serversList.length === 0) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
    bot.sendMessage(chatId, `⏳ جاري تشغيل جميع السيرفرات (${serversList.length})...`);
    serversList.forEach(srv => {
      srv.autoReconnect = true;
      srv.reconnectAttempts = 0;
      if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
      connectMinecraftBot(chatId, srv);
    });
  }

  else if (data === 'leave_all') {
    if (serversList.length === 0) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
    serversList.forEach(srv => {
      srv.autoReconnect = false;
      srv.reconnectAttempts = 0;
      if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
      if (srv.afkInterval) { clearInterval(srv.afkInterval); srv.afkInterval = null; }
      if (srv.client) { try { srv.client.removeAllListeners(); srv.client.close(); } catch (e) {} srv.client = null; srv.connectedAt = null; }
    });
    bot.sendMessage(chatId, `⏹️ تم إيقاف جميع السيرفرات (${serversList.length}).`);
  }
});

// =============================
// دالة الاتصال بالماينكرافت
// =============================
function connectMinecraftBot(chatId, srv) {
  if (srv.client) {
    try { srv.client.removeAllListeners(); srv.client.close(); } catch (e) {}
    srv.client = null;
  }
  if (srv.afkInterval) { clearInterval(srv.afkInterval); srv.afkInterval = null; }

  const username = settings.botUsername || 'AFK_Bot';
  srv.lastPosition = { x: 0, y: 64, z: 0 };
  srv.currentTick = BigInt(0);
  srv.playerCount = 0;

  try {
    srv.client = bedrock.createClient({
      host: srv.ip,
      port: srv.port,
      username: username,
      offline: true
    });

    // جلب معلومات السيرفر (إصدار + عدد لاعبين)
    srv.client.on('start_game', (packet) => {
      try {
        srv.serverVersion = packet.player_game_type !== undefined
          ? (srv.client.version || packet.game_version || 'Bedrock')
          : 'Bedrock';
        console.log('[VERSION]', srv.serverVersion, '| start_game keys:', Object.keys(packet).join(', '));
      } catch(e) {}
    });

    srv.client.on('player_list', (packet) => {
      try {
        // بنية الباقة تختلف حسب الإصدار
        const records = packet.records;
        if (!records) return;
        
        // شكل 1: { type, records: [...] }
        if (records.records && Array.isArray(records.records)) {
          const count = records.records.filter(r => r.username !== username).length;
          if (records.type === 'add' || records.type === 0) {
            srv.playerCount += count;
          } else {
            srv.playerCount = Math.max(0, srv.playerCount - count);
          }
        }
        // شكل 2: مصفوفة مباشرة
        else if (Array.isArray(records)) {
          srv.playerCount = records.filter(r => r.username !== username).length;
        }
      } catch(e) {}
    });

    srv.client.on('join', () => {
      srv.reconnectAttempts = 0;
      srv.connectedAt = Date.now();
      // جلب الإصدار من كل الأماكن الممكنة
      srv.serverVersion = srv.client.version
        || srv.client.options?.version
        || srv.client.game_version
        || 'Bedrock';
      bot.sendMessage(chatId,
        `✅ استقر البوت في السيرفر!\n` +
        `🌐 ${srv.ip}:${srv.port}\n` +
        `👤 ${username}\n` +
        `📦 الإصدار: ${srv.serverVersion}`
      );

      // AFK خفيف بدون باقات تحرك
      srv.afkInterval = setInterval(() => {
        try {
          srv.client.write('interact', {
            action_id: 'mouseover',
            target_block_position: { x: 0, y: 0, z: 0 }
          });
        } catch (e) {}
      }, 30000);
    });

    srv.client.on('move_player', (packet) => {
      try {
        if (packet.runtime_id === srv.client.runtime_id) {
          srv.lastPosition = packet.position;
        }
      } catch(e) {}
    });

    // 💬 الشات + سجل + مراقبة لاعبين
    srv.client.on('text', (packet) => {
      if (!chatId) return;

      const time = new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
      const pType = packet.type;

      // debug مؤقت - يطلع نوع الباقة بالكونسول
      console.log(`[TEXT PACKET] type=${JSON.stringify(pType)} source=${packet.source_name} msg=${packet.message}`);

      // نقبل أي نوع شات
      const isChat = pType === 1 || pType === 'chat' || pType === 0 || pType === 'raw';
      // translation
      const isTranslation = pType === 2 || pType === 'translation' || pType === 8 || pType === 'announcement';

      if (isChat && packet.source_name && packet.source_name !== username) {
        const logEntry = `[${time}] ${packet.source_name}: ${packet.message}`;
        srv.chatLog.push(logEntry);
        if (srv.chatLog.length > 100) srv.chatLog.shift();

        if (packet.message && packet.message.includes(username)) {
          bot.sendMessage(chatId, `🔔 ذكروا البوت بالشات!\n👤 ${packet.source_name}: ${packet.message}`);
        }

        bot.sendMessage(chatId, `💬 [${srv.ip}]\n👤 ${packet.source_name}: ${packet.message}`);
      }

      else if (isTranslation) {
        const msgKey = packet.message || '';
        const params = packet.parameters || packet.params || [];
        
        if (msgKey.includes('joined') || msgKey === 'multiplayer.player.joined') {
          const player = params[0] || 'لاعب';
          srv.playerCount++;
          const logEntry = `[${time}] 🟢 دخل: ${player}`;
          srv.playerLog.push(logEntry);
          if (srv.playerLog.length > 100) srv.playerLog.shift();
          bot.sendMessage(chatId, `🟢 دخل ${player} إلى السيرفر!\n👥 اللاعبين: ${srv.playerCount}`);
          if (settings.watchedPlayers.some(p => p.toLowerCase() === player.toLowerCase())) {
            bot.sendMessage(chatId, `🚨 تنبيه مراقبة!\n👤 "${player}" دخل السيرفر!`);
          }
        }

        else if (msgKey.includes('left') || msgKey === 'multiplayer.player.left') {
          const player = params[0] || 'لاعب';
          srv.playerCount = Math.max(0, srv.playerCount - 1);
          const logEntry = `[${time}] 🔴 خرج: ${player}`;
          srv.playerLog.push(logEntry);
          if (srv.playerLog.length > 100) srv.playerLog.shift();
          bot.sendMessage(chatId, `🔴 خرج ${player} من السيرفر!\n👥 اللاعبين: ${srv.playerCount}`);
          if (settings.watchedPlayers.some(p => p.toLowerCase() === player.toLowerCase())) {
            bot.sendMessage(chatId, `🚨 تنبيه مراقبة!\n👤 "${player}" خرج من السيرفر!`);
          }
        }
      }
    });

    const triggerReconnect = (reason) => {
      if (!srv.autoReconnect) return;
      if (srv.reconnectTimer) return;

      if (srv.reconnectAttempts >= 3) {
        bot.sendMessage(chatId, `🛑 توقفت الفزعة على ${srv.ip}!\nالسيرفر مغلق أو يرفض الدخول.`);
        srv.autoReconnect = false;
        srv.reconnectAttempts = 0;
        srv.connectedAt = null;
        return;
      }

      srv.reconnectAttempts++;
      const reasonText = reason === 'kicked' ? '⚠️ انطرد البوت' : '⚠️ فصل البوت';
      bot.sendMessage(chatId, `${reasonText} من ${srv.ip}! محاولة [${srv.reconnectAttempts}/3]...`);

      srv.reconnectTimer = setTimeout(() => {
        srv.reconnectTimer = null;
        if (srv.autoReconnect) connectMinecraftBot(chatId, srv);
      }, 15000);
    };

    srv.client.on('disconnect', (packet) => {
      srv.connectedAt = null;
      const reason = packet.message || 'غير معروف';
      bot.sendMessage(chatId, `⚠️ طُرد البوت من ${srv.ip}!\n📝 السبب: ${reason}`);
      triggerReconnect('kicked');
    });

    srv.client.on('close', () => { srv.connectedAt = null; triggerReconnect('close'); });
    srv.client.on('end', () => { srv.connectedAt = null; triggerReconnect('end'); });
    srv.client.on('error', (err) => {
      if (srv.autoReconnect) triggerReconnect('error');
      else if (!err.message.includes('Client network socket')) {
        bot.sendMessage(chatId, `❌ فشل الدخول لـ ${srv.ip}.`);
      }
    });

  } catch (e) {
    if (srv.autoReconnect) triggerReconnect('crash');
  }
      }
