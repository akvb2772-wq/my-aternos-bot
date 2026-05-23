const TOKEN = process.env.BOT_TOKEN || '7415233806:AAE-KEZiu5zmQKa4dZnpH41Yld9phDpknqA';
const PORT = process.env.PORT || 7860;
const SERVERS_FILE = 'servers.json';

const TelegramBot = require('node-telegram-bot-api');
const bedrock = require('bedrock-protocol');
const express = require('express');
const fs = require('fs');

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
    currentTick: BigInt(0)
  };
}

function escMd(text) {
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// =============================
// إعداد البوت مع Express Webhook
// =============================
const app = express();
app.use(express.json());

const SPACE_HOST = process.env.SPACE_HOST;
let bot;

if (SPACE_HOST) {
  // Webhook mode للـ Hugging Face
  const WEBHOOK_URL = `https://${SPACE_HOST}/bot${TOKEN}`;
  bot = new TelegramBot(TOKEN, { webHook: false });

  bot.setWebHook(WEBHOOK_URL).then(() => {
    console.log(`✅ Webhook: ${WEBHOOK_URL}`);
  }).catch(err => console.error('⚠️ خطأ Webhook:', err.message));

  app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

} else {
  // Polling mode للتشغيل المحلي
  bot = new TelegramBot(TOKEN, { polling: true });
  console.log('🔄 تشغيل Polling (محلي)');
}

// صفحة رئيسية
app.get('/', (req, res) => {
  res.send('🚀 البوت يعمل!');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server على port ${PORT}`);
});

process.on('uncaughtException', (err) => console.error('⚠️ خطأ:', err.message));
process.on('unhandledRejection', (err) => console.error('⚠️ رفض:', err.message));

const serversList = [];
loadServers();

console.log('✅ البوت جاهز!');

// =============================
// استقبال الرسائل
// =============================
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text = msg.text.trim();
  const chatId = msg.chat.id;

  // 💬 رسالة لسيرفر محدد
  if (text.startsWith('رسالة')) {
    const match = text.match(/رسالة\s*(\d+)\s*:\s*(.+)/);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const msgToSend = match[2].trim();
      const srv = serversList[index];

      if (!srv) {
        bot.sendMessage(chatId, `⚠️ ما في سيرفر برقم [${index + 1}]!`);
        return;
      }

      if (srv.client) {
        try {
          // type: 1 = chat في bedrock-protocol
          srv.client.write('text', {
            type: 1,
            needs_translation: false,
            source_name: srv.client.username || 'BotAFK',
            xuid: '',
            platform_chat_id: '',
            message: msgToSend,
            filtered_message: ''
          });
          bot.sendMessage(chatId, `✅ تم الإرسال للسيرفر [${index + 1}]: "${msgToSend}"`);
        } catch (e) {
          console.error('خطأ إرسال الشات:', e.message);
          bot.sendMessage(chatId, `❌ فشل الإرسال: ` + e.message);
        }
      } else {
        bot.sendMessage(chatId, `⚠️ السيرفر [${index + 1}] غير متصل!`);
      }
    } else {
      bot.sendMessage(chatId, `❌ صيغة خاطئة!\nاكتب هكذا:\nرسالة 1: شلونكم شباب`);
    }
    return;
  }

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
    statusMsg += `🔹 [${index + 1}]: ${srv.ip}:${srv.port} - ${status}${timeText}\n`;

    inline_keyboard.push([
      { text: `▶️ تشغيل [${index + 1}]`, callback_data: `join_${index}` },
      { text: `⏹️ إيقاف [${index + 1}]`, callback_data: `leave_${index}` },
      { text: `🗑️ حذف [${index + 1}]`, callback_data: `delete_${index}` }
    ]);
  });

  inline_keyboard.push([
    { text: '▶️▶️ تشغيل الكل', callback_data: 'join_all' },
    { text: '⏹️⏹️ إيقاف الكل', callback_data: 'leave_all' }
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
    statusMsg += `${index + 1}. ${srv.ip}:${srv.port} - ${status}${timeText}\n`;
  });

  statusMsg += `\n📈 المتصل: ${connected}/${serversList.length}`;
  bot.sendMessage(chatId, statusMsg);
});

// =============================
// /help
// =============================
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 كيفية الاستخدام:\n\n` +
    `➕ إضافة سيرفر:\nسيرفر ip:port\n\n` +
    `💬 إرسال رسالة لسيرفر محدد:\nرسالة 1: شلونكم شباب\n\n` +
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

  const username = `BotAFK_${Math.floor(Math.random() * 8999) + 1000}`;
  srv.lastPosition = { x: 0, y: 64, z: 0 };
  srv.currentTick = BigInt(0);

  try {
    srv.client = bedrock.createClient({
      host: srv.ip,
      port: srv.port,
      username: username,
      offline: true
    });

    srv.client.on('join', () => {
      srv.reconnectAttempts = 0;
      srv.connectedAt = Date.now();
      bot.sendMessage(chatId, `✅ استقر البوت في السيرفر!\n🌐 ${srv.ip}:${srv.port}\n👤 ${username}`);

      srv.afkInterval = setInterval(() => {
        try {
          srv.currentTick += BigInt(1);
          const randomYaw = Math.random() * 360;
          srv.client.write('player_auth_input', {
            pitch: 0,
            yaw: randomYaw,
            position: srv.lastPosition,
            move_vector: { x: 0, z: 0 },
            head_yaw: randomYaw,
            input_data: { signup: false },
            input_mode: 'mouse',
            play_mode: 'normal',
            tick: srv.currentTick
          });
        } catch (e) {}
      }, 15000);
    });

    srv.client.on('move_player', (packet) => {
      if (packet.runtime_id === srv.client.runtime_id || !srv.lastPosition.x) {
        srv.lastPosition = packet.position;
      }
    });

    srv.client.on('text', (packet) => {
      if (!chatId) return;
      if (packet.type === 'chat' && packet.source_name !== username) {
        bot.sendMessage(chatId, `💬 [${srv.ip}]\n👤 ${packet.source_name}: ${packet.message}`);
      } else if (packet.type === 'translation') {
        if (packet.message === 'multiplayer.player.joined') {
          const player = packet.parameters ? packet.parameters[0] : 'لاعب';
          bot.sendMessage(chatId, `🟢 دخل ${player} إلى السيرفر!`);
        } else if (packet.message === 'multiplayer.player.left') {
          const player = packet.parameters ? packet.parameters[0] : 'لاعب';
          bot.sendMessage(chatId, `🔴 خرج ${player} من السيرفر!`);
        }
      }
    });

    const triggerReconnect = () => {
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
      bot.sendMessage(chatId, `⚠️ فصل البوت من ${srv.ip}! محاولة [${srv.reconnectAttempts}/3]...`);

      srv.reconnectTimer = setTimeout(() => {
        srv.reconnectTimer = null;
        if (srv.autoReconnect) connectMinecraftBot(chatId, srv);
      }, 15000);
    };

    srv.client.on('close', () => { srv.connectedAt = null; triggerReconnect(); });
    srv.client.on('end', () => { srv.connectedAt = null; triggerReconnect(); });
    srv.client.on('error', (err) => {
      if (srv.autoReconnect) triggerReconnect();
      else if (!err.message.includes('Client network socket')) {
        bot.sendMessage(chatId, `❌ فشل الدخول لـ ${srv.ip}.`);
      }
    });

  } catch (e) {
    if (srv.autoReconnect) triggerReconnect();
  }
}
