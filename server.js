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

// Thay bằng username TikTok Live của bạn (không có @)
const TIKTOK_USERNAME = 'cain_vol_silford_0';

function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Bảng quy đổi quà tặng TikTok -> cấp mồi / số lượt câu
function mapGiftToBait(giftName, diamondCount, repeatCount) {
  const totalDiamonds = (diamondCount || 1) * (repeatCount || 1);

  if (totalDiamonds >= 100) {
    return { baitTier: 'LEGENDARY', casts: 1, label: 'Mồi Thần Thoại' };
  }
  if (totalDiamonds >= 20) {
    return { baitTier: 'GOLD', casts: Math.min(repeatCount || 1, 3), label: 'Mồi Vàng' };
  }
  return { baitTier: 'NORMAL', casts: Math.min(repeatCount || 1, 5), label: 'Mồi Thường' };
}

async function connectTikTok() {
  const tiktokLive = new WebcastPushConnection(TIKTOK_USERNAME, {
    processInitialData: false,
    enableExtendedGiftInfo: true
  });

  try {
    const state = await tiktokLive.connect();
    console.log(`Đã kết nối phòng live của @${TIKTOK_USERNAME} (Room ID: ${state.roomId})`);
  } catch (err) {
    console.error('Chưa kết nối được TikTok Live (có thể kênh chưa bật live):', err.message);
  }

  // Lắng nghe bình luận: Người xem cmt "vào câu" (hoặc "vao cau") để tham gia câu vĩnh viễn
  tiktokLive.on('chat', (data) => {
    const comment = (data.comment || '').trim().toLowerCase();
    if (comment.includes('vào câu') || comment.includes('vao cau') || comment === 'vào' || comment === 'cau') {
      broadcast({
        type: 'JOIN_COMMENT',
        userId: data.userId,
        nickname: data.nickname || data.uniqueId,
        avatar: data.profilePictureUrl
      });
    }
  });

  // Lắng nghe sự kiện tặng quà
  tiktokLive.on('gift', (data) => {
    // Với quà combo (giftType === 1), chỉ xử lý khi kết thúc chuỗi combo để tránh lặp
    if (data.giftType === 1 && !data.repeatEnd) return;

    const baitInfo = mapGiftToBait(data.giftName, data.diamondCount, data.repeatCount);

    broadcast({
      type: 'GIFT_CAST',
      userId: data.userId,
      nickname: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl,
      giftName: data.giftName,
      repeatCount: data.repeatCount || 1,
      diamonds: (data.diamondCount || 1) * (data.repeatCount || 1),
      baitTier: baitInfo.baitTier,
      casts: baitInfo.casts * 3 // Tặng quà nhận nhiều lượt buff VIP hơn
    });
  });

  // Người xem thả tim đủ 100 tim -> Tăng tốc độ câu!
  const likeCounter = new Map();
  tiktokLive.on('like', (data) => {
    const current = (likeCounter.get(data.userId) || 0) + (data.likeCount || 1);
    if (current >= 100) {
      likeCounter.set(data.userId, current - 100);
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
}

connectTikTok();

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Mở game tại: http://localhost:${PORT}`);
});
