// ╔══════════════════════════════════════╗
// ║      🎮 Minecraft AFK Bot v4.0      ║
// ╚══════════════════════════════════════╝

const TOKEN = process.env.BOT_TOKEN;
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
  botUsernames: ['AFK_Bot'],
  watchedPlayers: [],
};

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch(e) {}
}
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE))
      settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
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
    onlinePlayers: [],      // مصفوفة بدل Set لتجنب مشكلة التحميل
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
//  الرسائل النصية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text   = msg.text.trim();
  const chatId = msg.chat.id;

  // ━━ إضافة سيرفر ━━
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
    bot.sendMessage(chatId, `✅ تم إضافة السيرفر!\n🌐 ${ip}:${port}\n\nاكتب /start لعرض القائمة.`);
    return;
  }

  // ━━ إضافة اسم حساب ━━
  if (text.startsWith('اسم البوت ')) {
    const name = text.replace('اسم البوت ', '').trim();
    if (name.length < 3 || name.length > 16) {
      bot.sendMessage(chatId, `❌ الاسم لازم يكون بين 3-16 حرف.`);
      return;
    }
    if (settings.botUsernames.includes(name)) {
      bot.sendMessage(chatId, `⚠️ الاسم "${name}" موجود مسبقاً!`);
      return;
    }
    settings.botUsernames.push(name);
    saveSettings();
    bot.sendMessage(chatId,
      `✅ تم إضافة "${name}" لقائمة الحسابات!\n` +
      `👥 إجمالي الأسماء: ${settings.botUsernames.length}`
    );
    return;
  }

  // ━━ حذف اسم حساب ━━
  if (text.startsWith('احذف اسم ')) {
    const name = text.replace('احذف اسم ', '').trim();
    const idx  = settings.botUsernames.indexOf(name);
    if (idx === -1) {
      bot.sendMessage(chatId, `⚠️ الاسم "${name}" غير موجود!`);
      return;
    }
    if (settings.botUsernames.length === 1) {
      bot.sendMessage(chatId, `❌ لازم يبقى اسم واحد على الأقل!`);
      return;
    }
    settings.botUsernames.splice(idx, 1);
    saveSettings();
    bot.sendMessage(chatId, `✅ تم حذف "${name}" من القائمة.`);
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
//  /start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!serversList.length) {
    bot.sendMessage(chatId,
      `🎮 مرحباً بك في نظام AFK!\n\n` +
      `ما في سيرفرات مضافة بعد.\n` +
      `أضف سيرفرك هكذا:\n\nسيرفر ip:port`
    );
    return;
  }

  let txt = `🎮 لوحة التحكم\n${'━'.repeat(25)}\n\n`;
  const kb = [];

  serversList.forEach((srv, i) => {
    const connected = srv.clients.filter(c => c.connection).length;
    const status    = connected > 0 ? `🟢 متصل (${connected} حساب)` : '🔴 منقطع';
    let uptime = '';
    if (srv.connectedAt) {
      const m = Math.floor((Date.now() - srv.connectedAt) / 60000);
      uptime  = m >= 60 ? ` | ⏱ ${Math.floor(m/60)}س ${m%60}د` : ` | ⏱ ${m}د`;
    }
    const ver     = srv.serverVersion ? ` | 📦 ${srv.serverVersion}` : '';
    const players = connected > 0 ? ` | 👥 ${srv.playerCount}` : '';

    txt += `🔹 السيرفر [${i+1}]\n`;
    txt += `   🌐 ${srv.ip}:${srv.port}\n`;
    txt += `   ${status}${uptime}${ver}${players}\n\n`;

    kb.push([
      { text: `▶️ تشغيل [${i+1}]`, callback_data: `join_${i}` },
      { text: `⏹️ إيقاف [${i+1}]`, callback_data: `leave_${i}` },
      { text: `🗑️ حذف [${i+1}]`,   callback_data: `delete_${i}` },
    ]);
    kb.push([
      { text: `💬 شات [${i+1}]`,    callback_data: `log_${i}` },
      { text: `👥 لاعبين [${i+1}]`, callback_data: `players_${i}` },
      { text: `👁️ مراقبة [${i+1}]`,callback_data: `watched_${i}` },
    ]);
  });

  kb.push([
    { text: '▶️▶️ تشغيل الكل',  callback_data: 'join_all' },
    { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' },
  ]);
  kb.push([
    { text: '⚙️ الإعدادات',       callback_data: 'settings_menu' },
    { text: '👁️ قائمة المراقبة', callback_data: 'watch_list' },
  ]);

  bot.sendMessage(chatId, txt, { reply_markup: { inline_keyboard: kb } });
});

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
    `👤 إضافة حساب:\nاسم البوت الاسم\n\n` +
    `🗑️ حذف حساب:\nاحذف اسم الاسم\n\n` +
    `👁️ مراقبة لاعب:\nراقب اسم_اللاعب\n\n` +
    `🚫 إيقاف مراقبة:\nوقف مراقبة الاسم\n\n` +
    `${'━'.repeat(25)}\n` +
    `/start  - لوحة التحكم\n` +
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

  if (data.startsWith('join_') && data !== 'join_all') {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    srv.autoReconnect     = true;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    bot.sendMessage(chatId, `⏳ جاري الدخول لـ ${srv.ip} بـ ${settings.botUsernames.length} حساب...`);
    connectAllBots(chatId, srv);
  }

  else if (data.startsWith('leave_') && data !== 'leave_all') {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    srv.autoReconnect     = false;
    srv.reconnectAttempts = 0;
    if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
    disconnectAllBots(srv);
    srv.connectedAt = null;
    bot.sendMessage(chatId, `👋 تم سحب جميع الحسابات من ${srv.ip}.`);
  }

  else if (data.startsWith('delete_')) {
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
  }

  else if (data.startsWith('log_')) {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    bot.sendMessage(chatId,
      srv.chatLog.length
        ? `💬 آخر رسائل [${i+1}]:\n${'━'.repeat(25)}\n\n` + srv.chatLog.slice(-20).join('\n')
        : `💬 سجل الشات [${i+1}] فارغ حالياً.`
    );
  }

  else if (data.startsWith('players_')) {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    bot.sendMessage(chatId,
      srv.playerLog.length
        ? `👥 سجل الدخول والخروج [${i+1}]:\n${'━'.repeat(25)}\n\n` + srv.playerLog.slice(-20).join('\n')
        : `👥 سجل اللاعبين [${i+1}] فارغ حالياً.`
    );
  }

  else if (data.startsWith('watched_')) {
    const i   = parseInt(data.split('_')[1]);
    const srv = serversList[i];
    if (!srv) return;
    bot.sendMessage(chatId,
      srv.watchedChatLog.length
        ? `👁️ سجل المراقبة [${i+1}]:\n${'━'.repeat(25)}\n\n` + srv.watchedChatLog.slice(-20).join('\n')
        : `👁️ سجل المراقبة [${i+1}] فارغ حالياً.`
    );
  }

  else if (data === 'watch_list') {
    bot.sendMessage(chatId,
      settings.watchedPlayers.length
        ? `👁️ اللاعبون المراقبون:\n${'━'.repeat(25)}\n\n` +
          settings.watchedPlayers.map((p, i) => `${i+1}. ${p}`).join('\n') +
          `\n\nإيقاف المراقبة:\nوقف مراقبة الاسم`
        : `👁️ قائمة المراقبة فارغة.\n\nأضف لاعب:\nراقب اسم_اللاعب`
    );
  }

  else if (data === 'settings_menu') {
    bot.sendMessage(chatId,
      `⚙️ الإعدادات\n${'━'.repeat(25)}\n\n` +
      `👤 الحسابات (${settings.botUsernames.length}):\n` +
      settings.botUsernames.map((n, i) => `   ${i+1}. ${n}`).join('\n') + '\n\n' +
      `👁️ لاعبون مراقبون: ${settings.watchedPlayers.length}\n\n` +
      `${'━'.repeat(25)}\n` +
      `إضافة حساب: اسم البوت الاسم\n` +
      `حذف حساب: احذف اسم الاسم`
    );
  }

  else if (data === 'join_all') {
    if (!serversList.length) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
    bot.sendMessage(chatId, `⏳ جاري تشغيل ${serversList.length} سيرفر...`);
    serversList.forEach(srv => {
      srv.autoReconnect     = true;
      srv.reconnectAttempts = 0;
      if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
      connectAllBots(chatId, srv);
    });
  }

  else if (data === 'leave_all') {
    if (!serversList.length) { bot.sendMessage(chatId, '📭 ما في سيرفرات.'); return; }
    serversList.forEach(srv => {
      srv.autoReconnect = false;
      srv.reconnectAttempts = 0;
      if (srv.reconnectTimer) { clearTimeout(srv.reconnectTimer); srv.reconnectTimer = null; }
      disconnectAllBots(srv);
      srv.connectedAt = null;
    });
    bot.sendMessage(chatId, `⏹️ تم إيقاف جميع السيرفرات.`);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  فصل جميع الحسابات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function disconnectAllBots(srv) {
  srv.clients.forEach(c => {
    if (c.interval)   { clearInterval(c.interval); c.interval = null; }
    if (c.connection) { try { c.connection.removeAllListeners(); c.connection.close(); } catch(e) {} c.connection = null; }
  });
  srv.clients      = [];
  srv.playerCount  = 0;
  srv.onlinePlayers = [];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  تشغيل جميع الحسابات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function connectAllBots(chatId, srv) {
  disconnectAllBots(srv);
  settings.botUsernames.forEach((username, i) => {
    setTimeout(() => connectSingleBot(chatId, srv, username), i * 2000);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  اتصال حساب واحد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function connectSingleBot(chatId, srv, username) {
  const clientObj = { username, connection: null, interval: null };
  srv.clients.push(clientObj);
  const isFirst = () => srv.clients[0] === clientObj;

  try {
    const conn = bedrock.createClient({ host: srv.ip, port: srv.port, username, offline: true });
    clientObj.connection = conn;

    // ━━ إصدار السيرفر (من start_game وهو الأدق) ━━
    conn.on('start_game', (packet) => {
      try {
        srv.serverVersion = conn.version || packet.level_name || 'Bedrock';
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
          if (!r.username || settings.botUsernames.includes(r.username)) return;
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
          `👥 الحسابات: ${settings.botUsernames.join(', ')}`
        );
      }

      // ━━ AFK - نبعث packet الـ tick بدون حركة ━━
      let tick = BigInt(0);
      clientObj.interval = setInterval(() => {
        try {
          tick += BigInt(1);
          conn.write('tick_sync', { request_time: tick, response_time: BigInt(0) });
        } catch(e) {}
      }, 20000);
    });

    // ━━ الشات + الدخول والخروج ━━
    conn.on('text', (packet) => {
      if (!isFirst()) return; // فقط الحساب الأول يعالج الإشعارات
      const time  = getTime();
      const pType = packet.type;

      // DEBUG: يطلع نوع الباقة بالكونسول حتى نعرف القيمة الحقيقية
      console.log(`[TEXT] type=${JSON.stringify(pType)} | source="${packet.source_name}" | msg="${packet.message}"`);

      // شات عادي - نقبل كل الأنواع الممكنة
      const isChat = [0, 1, 'chat', 'raw', 'whisper', 'say'].includes(pType);
      // دخول وخروج
      const isTranslation = [2, 9, 'translation', 'announcement'].includes(pType);

      if (isChat && packet.source_name && !settings.botUsernames.includes(packet.source_name)) {
        const entry = `[${time}] 💬 ${packet.source_name}: ${packet.message}`;
        srv.chatLog.push(entry);
        if (srv.chatLog.length > 100) srv.chatLog.shift();

        // لاعب مراقب كتب بالشات
        const isWatched = settings.watchedPlayers.some(p =>
          p.toLowerCase() === packet.source_name.toLowerCase()
        );
        if (isWatched) {
          srv.watchedChatLog.push(`[${time}] 💬 ${packet.source_name}: ${packet.message}`);
          if (srv.watchedChatLog.length > 100) srv.watchedChatLog.shift();
          bot.sendMessage(chatId, `👁️ رسالة من لاعب مراقب!\n👤 ${packet.source_name}: ${packet.message}`);
        }

        // ذكر البوت بالشات
        const mentioned = settings.botUsernames.some(n =>
          packet.message?.toLowerCase().includes(n.toLowerCase())
        );
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
