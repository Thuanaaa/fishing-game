const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// API Google TTS Tiếng Việt chuẩn giọng "Chị Google"
app.get('/api/tts', (req, res) => {
  const text = (req.query.text || '').slice(0, 150);
  if (!text) return res.status(400).send('Missing text');
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&client=tw-ob`;
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (ttsRes) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    ttsRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).send('TTS error: ' + err.message);
  });
});

// Username có thể đặt qua TIKTOK_USER trong môi trường chạy.
const TIKTOK_USERNAME = (process.env.TIKTOK_USER || 'cain_von_silford_0')
  .trim()
  .replace(/^@/, '');

let isTikTokConnected = false;
let tiktokRoomId = null;
let currentTikTokConnection = null;

function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Khi client mở web, gửi ngay trạng thái kết nối TikTok
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'TIKTOK_STATUS',
    connected: isTikTokConnected,
    username: TIKTOK_USERNAME,
    roomId: tiktokRoomId
  }));
});

// Quà 1 xu nạp mồi; quà 5/10/50 xu cấp buff cho các lượt câu kế tiếp.
function mapGiftToBait(giftName, diamondCount, repeatCount) {
  const unitDiamonds = Math.max(1, Math.floor(Number(diamondCount) || 1));
  const giftCount = Math.max(1, Math.floor(Number(repeatCount) || 1));
  const totalDiamonds = unitDiamonds * giftCount;

  if (unitDiamonds === 1) {
    const baitCount = giftCount * 5;
    return { effect: 'BAIT', baitCount, giftCount, totalDiamonds, label: `+${baitCount} mồi câu` };
  }
  if (unitDiamonds >= 50) {
    return { effect: 'BEST_FISH', baitTier: '50XU', baitCount: 0, giftCount, totalDiamonds, label: 'Tăng cơ hội dính cá lớn nhất' };
  }
  if (unitDiamonds >= 10) {
    return { effect: 'BIG_FISH', baitTier: '10XU', baitCount: 0, giftCount, totalDiamonds, label: 'Tăng xác suất dính cá lớn' };
  }
  if (unitDiamonds >= 5) {
    return { effect: 'SPEED', baitTier: '5XU', baitCount: 0, giftCount, totalDiamonds, label: 'Tăng tốc độ câu' };
  }
  return { effect: 'NONE', baitCount: 0, giftCount, totalDiamonds, label: 'Quà chưa nằm trong mốc 1, 5, 10 hoặc 50 xu' };
}

// Kết nối TikTok Live với cơ chế tự động thử lại (Auto Reconnect)
let isConnecting = false;
async function tryConnectTikTok() {
  if (isTikTokConnected || isConnecting) return;
  isConnecting = true;

  try {
    console.log(`[TikTok] Đang kiểm tra phòng Live của @${TIKTOK_USERNAME}...`);
    const tiktokLive = new WebcastPushConnection(TIKTOK_USERNAME, {
      processInitialData: false,
      enableExtendedGiftInfo: true
    });

    const state = await tiktokLive.connect();
    isTikTokConnected = true;
    isConnecting = false;
    tiktokRoomId = state.roomId;
    currentTikTokConnection = tiktokLive;

    console.log(`\n==================================================`);
    console.log(`[TikTok] ✅ ĐÃ KẾT NỐI PHÒNG LIVE CỦA @${TIKTOK_USERNAME}!`);
    console.log(`[TikTok] Room ID: ${state.roomId}`);
    console.log(`[TikTok] Đang lắng nghe comment "Vào câu", quà tặng và lượt tim...`);
    console.log(`==================================================\n`);

    broadcast({
      type: 'TIKTOK_STATUS',
      connected: true,
      username: TIKTOK_USERNAME,
      roomId: state.roomId
    });

    // Lắng nghe bình luận
    tiktokLive.on('chat', (data) => {
      const comment = (data.comment || '').trim();
      const lower = comment.toLowerCase();
      console.log(`[Bình luận] ${data.nickname}: "${comment}"`);

      const command = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
      if (command === 'vi tri' || command === 'keo' || command.startsWith('keo ')) {
        broadcast({
          type: 'PLAYER_COMMAND',
          command: command === 'vi tri' ? 'POSITION' : 'PULL',
          userId: data.userId,
          nickname: data.nickname || data.uniqueId,
          uniqueId: data.uniqueId || ''
        });
        return;
      }

      // Bắt các kiểu cmt vào câu
      if (lower.includes('vào câu') || lower.includes('vao cau') || lower === 'vào' || lower === 'cau' || lower === 'v') {
        broadcast({
          type: 'JOIN_COMMENT',
          userId: data.userId,
          nickname: data.nickname || data.uniqueId,
          uniqueId: data.uniqueId || '',
          avatar: data.profilePictureUrl
        });
      }
    });

    // Lắng nghe quà tặng
    tiktokLive.on('gift', (data) => {
      if (data.giftType === 1 && !data.repeatEnd) return; // Chỉ lấy khi hết chuỗi combo

      const baitInfo = mapGiftToBait(data.giftName, data.diamondCount, data.repeatCount);
      const totalDiamonds = baitInfo.totalDiamonds;
      console.log(`[Quà tặng] ${data.nickname} tặng ${data.giftName} x${data.repeatCount} (${totalDiamonds} xu) -> ${baitInfo.label}`);

      if (baitInfo.effect === 'NONE') {
        broadcast({
          type: 'BAIT_NOTICE',
          userId: data.userId,
          nickname: data.nickname || data.uniqueId,
          message: 'Quà chưa áp dụng; mốc hiện tại là 1, 5, 10 hoặc 50 xu.'
        });
        return;
      }

      broadcast({
        type: 'GIFT_CAST',
        userId: data.userId,
        nickname: data.nickname || data.uniqueId,
        avatar: data.profilePictureUrl,
        giftName: data.giftName,
        repeatCount: data.repeatCount || 1,
        diamonds: totalDiamonds,
        baitTier: baitInfo.baitTier,
        baitCount: baitInfo.baitCount,
        giftCount: baitInfo.giftCount,
        giftEffect: baitInfo.effect
      });
    });

    // Lắng nghe thả tim (100 tim tăng tốc độ câu)
    const likeCounter = new Map();
    tiktokLive.on('like', (data) => {
      const current = (likeCounter.get(data.userId) || 0) + (data.likeCount || 1);
      if (current >= 100) {
        likeCounter.set(data.userId, current - 100);
        console.log(`[Thả tim] ${data.nickname} đã thả đủ 100 tim -> Tăng tốc câu!`);
        broadcast({
          type: 'LIKE_BOOST',
          userId: data.userId,
          nickname: data.nickname || data.uniqueId,
          avatar: data.profilePictureUrl,
          likeCount: 100
        });
      } else {
        likeCounter.set(data.userId, current);
      }
    });

    // Xử lý khi live kết thúc hoặc ngắt kết nối
    tiktokLive.on('streamEnd', () => {
      console.log(`[TikTok] Buổi live của @${TIKTOK_USERNAME} đã kết thúc.`);
      isTikTokConnected = false;
      tiktokRoomId = null;
      currentTikTokConnection = null;
      broadcast({ type: 'TIKTOK_STATUS', connected: false, username: TIKTOK_USERNAME });
    });

    tiktokLive.on('disconnected', () => {
      console.log(`[TikTok] Mất kết nối live. Đang chuẩn bị kết nối lại...`);
      isTikTokConnected = false;
      tiktokRoomId = null;
      currentTikTokConnection = null;
      broadcast({ type: 'TIKTOK_STATUS', connected: false, username: TIKTOK_USERNAME });
    });

  } catch (err) {
    isConnecting = false;
    isTikTokConnected = false;
    // Lỗi thường gặp: LIVE has ended (kênh chưa bật Live)
    if (err.message && err.message.includes('LIVE has ended')) {
      console.log(`[TikTok] @${TIKTOK_USERNAME} chưa bật Live trên TikTok. (Server sẽ tự động kết nối lại khi bạn Live...)`);
    } else {
      console.log(`[TikTok] Chưa kết nối được: ${err.message}. Đang thử lại sau...`);
    }
    broadcast({
      type: 'TIKTOK_STATUS',
      connected: false,
      username: TIKTOK_USERNAME,
      error: err.message
    });
  }
}

// Chạy vòng lặp tự động kết nối mỗi 7 giây (nếu chưa kết nối)
setInterval(() => {
  if (!isTikTokConnected) {
    tryConnectTikTok();
  }
}, 7000);

tryConnectTikTok();

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🎮 Game đang mở tại: http://localhost:${PORT}`);
  console.log(`Kênh TikTok Live: @${TIKTOK_USERNAME}`);
  console.log(`==================================================\n`);
});
