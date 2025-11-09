// server_ai_only.js
// Node.js + Express - AI Prediction Only (Deepseek V3 via OpenRouter)
// Chạy: node server_ai_only.js
// Yêu cầu: npm install express axios dotenv

const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Link API lịch sử của bạn
const HISTORY_API_URL = process.env.HISTORY_API_URL || 'http://139.59.120.117:3001';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ========== AI PREDICT FUNCTION ==========
async function aiPredict(history) {
  if (!OPENROUTER_API_KEY) {
    return { prediction: 'Tài', reason: '[AI] Chưa cấu hình API key' };
  }

  if (!Array.isArray(history) || history.length === 0) {
    return { prediction: 'Tài', reason: '[AI] Thiếu dữ liệu lịch sử' };
  }

  // Lấy 15 phiên gần nhất
  const recent = history.slice(0, 15);
  const historyText = recent
    .map((s, i) => `#${s.Phien}: ${s.Xuc_xac_1}-${s.Xuc_xac_2}-${s.Xuc_xac_3} (Tổng: ${s.Xuc_xac_1 + s.Xuc_xac_2 + s.Xuc_xac_3}) = ${s.Ket_qua}`)
    .join(' | ');

  const prompt = `
  PHÂN TÍCH TÀI XỈU - HÃY TRẢ LỜI DẠNG: [Tài/Xỉu] [Lý do ngắn]
  Lịch sử gần đây: ${historyText}
  Dự đoán kết quả tiếp theo dựa theo xu hướng, streak, và pattern.
  Chỉ trả lời đúng định dạng yêu cầu, ví dụ:
  "Tài - do chuỗi Xỉu quá dài, khả năng đảo chiều"
  `;

  try {
    const response = await axios.post(
      OPENROUTER_URL,
      {
        model: 'google/gemma-7b-it:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.4,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://taixiu.ai',
          'X-Title': 'TaiXiu AI Predictor',
        },
        timeout: 15000,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim() || '';
    const lower = content.toLowerCase();
    let prediction = 'Tài';
    if (lower.includes('xỉu')) prediction = 'Xỉu';
    else if (lower.includes('tài')) prediction = 'Tài';

    return { prediction, reason: `[AI] ${content}` };
  } catch (err) {
    console.error('❌ Lỗi khi gọi AI:', err.message);
    return { prediction: 'Tài', reason: `[AI] Lỗi: ${err.message}` };
  }
}

// ========== ENDPOINT ==========
app.get('/api/lookup_predict', async (req, res) => {
  try {
    const resp = await axios.get(HISTORY_API_URL, { timeout: 7000 });
    const data = Array.isArray(resp.data) ? resp.data : [resp.data];
    if (!data || data.length === 0) return res.json({ id: 'AI_ONLY_ERR', error: 'Không có dữ liệu lịch sử' });

    const last = data[0];
    const phientruoc = last.Phien;
    const phiensau = phientruoc + 1;
    const xucxac = [last.Xuc_xac_1, last.Xuc_xac_2, last.Xuc_xac_3];
    const tongxucxac = xucxac.reduce((a, b) => a + b, 0);
    const ketqua = last.Ket_qua || (tongxucxac >= 11 ? 'Tài' : 'Xỉu');

    // Gọi AI dự đoán
    const ai = await aiPredict(data);

    return res.json({
      id: '@Cskhtool0100000',
      phientruoc,
      xucxac,
      tongxucxac,
      ketqua,
      phiensau,
      dudoan: ai.prediction
    });
  } catch (e) {
    console.error('❌ Lỗi lấy API lịch sử:', e.message);
    res.status(500).json({ id: 'AI_ONLY_ERR', error: 'Không lấy được dữ liệu lịch sử' });
  }
});

app.get('/', (req, res) => {
  res.send('🤖 AI ONLY PREDICTOR (Deepseek V3) - Endpoint: /api/lookup_predict');
});

app.listen(PORT, () => {
  console.log(`🚀 Server AI Only chạy cổng ${PORT}`);
});
