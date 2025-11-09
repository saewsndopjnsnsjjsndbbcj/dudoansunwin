// server_ai_simple.js
// Node.js + Express - AI Predictor Simple Form
// Chạy: node server_ai_simple.js
// Yêu cầu: node >=14, npm install express axios dotenv

const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HISTORY_API_URL = 'https://sunwin-hcga.onrender.com/';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://api.openrouter.ai/v1/chat/completions';

// -------------------- Helpers --------------------
function getTimeVN() {
    return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function normalizeResult(val) {
    if (val === undefined || val === null) return '';
    const s = String(val).trim().toLowerCase();
    if (s.includes('t')) return 'Tài';
    if (s.includes('x')) return 'Xỉu';
    const n = Number(s);
    if (!isNaN(n)) return n >= 11 ? 'Tài' : 'Xỉu';
    return '';
}

// -------------------- AI Prediction --------------------
async function aiPredict(sessionDetails) {
    if (!OPENROUTER_API_KEY) {
        return { prediction: 'Tài', confidence: 0.5, reason: '[AI] Chưa cấu hình API key' };
    }
    if (!sessionDetails || sessionDetails.length === 0) {
        return { prediction: 'Tài', confidence: 0.5, reason: '[AI] Thiếu dữ liệu lịch sử' };
    }

    try {
        const historyData = sessionDetails.slice(0, 15)
            .map((s, i) => `#${s.Phien}: ${normalizeResult(s.ket_qua)} (Tổng: ${s.Xuc_xac_1 + s.Xuc_xac_2 + s.Xuc_xac_3})`)
            .join(' | ');

        const prompt = `
PHÂN TÍCH TÀI XỈU - TRẢ LỜI THEO ĐỊNH DẠNG: [DỰ ĐOÁN] [XÁC SUẤT%] [LÝ DO NGẮN]
Lịch sử gần đây: ${historyData}
Phân tích xu hướng và đưa ra dự đoán tiếp theo.
Tổng điểm: 3-10=Xỉu, 11-17=cân bằng, 18=Tài.
Định dạng bắt buộc: [Tài/Xỉu] [Xác suất 0-100%] [Lý do ngắn gọn]
        `;

        const response = await axios.post(OPENROUTER_URL, {
            model: 'google/gemma-7b-it:free',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 80,
            temperature: 0.3,
            top_p: 0.9
        }, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 10000
        });

        const aiText = response.data.choices[0].message.content.trim();
        let prediction = 'Tài';
        let confidence = 0.5;
        let reason = aiText;

        const taiMatch = aiText.match(/Tài.*?(\d+)%/i);
        const xiuMatch = aiText.match(/Xỉu.*?(\d+)%/i);
        if (taiMatch && xiuMatch) {
            const taiProb = parseInt(taiMatch[1]);
            const xiuProb = parseInt(xiuMatch[1]);
            prediction = taiProb >= xiuProb ? 'Tài' : 'Xỉu';
            confidence = Math.max(taiProb, xiuProb) / 100;
        } else if (aiText.toLowerCase().includes('tài')) {
            prediction = 'Tài';
            confidence = 0.65;
        } else if (aiText.toLowerCase().includes('xỉu')) {
            prediction = 'Xỉu';
            confidence = 0.65;
        }

        return { prediction, confidence, reason };

    } catch (e) {
        return { prediction: 'Tài', confidence: 0.5, reason: `[AI] Lỗi: ${e.message}` };
    }
}

// -------------------- Endpoint --------------------
app.get('/api/lookup_predict', async (req, res) => {
    try {
        const response = await axios.get(HISTORY_API_URL, { timeout: 7000 });
        const data = Array.isArray(response.data) ? response.data : [response.data];
        if (!data || data.length === 0) {
            return res.json({ id: 'AI_001', error: 'Không có dữ liệu lịch sử', time_vn: getTimeVN() });
        }

        const phienTruoc = data[0].Phien;
        const xucXac = [data[0].Xuc_xac_1, data[0].Xuc_xac_2, data[0].Xuc_xac_3];
        const tongXucXac = xucXac.reduce((a, b) => a + b, 0);
        const ketQua = normalizeResult(data[0].ket_qua);
        const phienSau = String(Number(phienTruoc) + 1);

        const aiResult = await aiPredict(data);

        return res.json({
            id: 'AI_001',
            phien_truoc: phienTruoc,
            xucxac: xucXac,
            tongxucxac: tongXucXac,
            ketqua: ketQua,
            phiensau: phienSau,
            dudoan: aiResult.prediction,
            giai_thich: aiResult.reason,
            do_tin_cay: (aiResult.confidence * 100).toFixed(1) + '%',
            time_vn: getTimeVN()
        });

    } catch (err) {
        console.error('Lỗi khi lấy lịch sử:', err.message || err);
        return res.status(500).json({ id: 'AI_ERR', error: 'Không lấy được dữ liệu lịch sử', time_vn: getTimeVN() });
    }
});

app.get('/', (req, res) => {
    res.send('👑 AI Predictor Simple - Endpoint: /api/lookup_predict');
});

app.listen(PORT, () => {
    console.log(`🚀 Server AI Simple chạy cổng ${PORT} - Time VN: ${getTimeVN()}`);
});
