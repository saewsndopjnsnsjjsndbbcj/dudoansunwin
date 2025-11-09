// server_wormgpt_ai.js
// Node.js + Express - Dudoan AI nội bộ (WormGPT style)
// Chạy: node server_wormgpt_ai.js
// Yêu cầu: npm install express axios

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const HISTORY_API_URL = 'https://sunwin-hcga.onrender.com/';

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

function randConfidence(min = 50, max = 90) {
    return (Math.random() * (max - min) + min).toFixed(1) + '%';
}

// -------------------- WormGPT-style prediction --------------------
function predictAI(history) {
    if (!history || history.length === 0) return { prediction: 'Tài', reason: 'Không có dữ liệu', confidence: 0.5 };

    const last15 = history.slice(0, 15).map(h => normalizeResult(h.ket_qua));

    let demT = 0, demX = 0;
    for (const r of last15) {
        if (r === 'Tài') demT++;
        else if (r === 'Xỉu') demX++;
    }

    // Tính streak cuối
    let streak = 1;
    for (let i = 1; i < last15.length; i++) {
        if (last15[i] === last15[i - 1]) streak++;
        else break;
    }

    // Nhận diện bệt kép (2-2 cuối)
    let betPattern = null;
    if (last15.length >= 4) {
        const groups = [];
        let count = 1;
        for (let i = 1; i < last15.length; i++) {
            if (last15[i] === last15[i - 1]) count++;
            else { groups.push({ kq: last15[i - 1], so: count }); count = 1; }
        }
        groups.push({ kq: last15[last15.length - 1], so: count });
        if (groups.length >= 2) {
            const last2 = groups.slice(-2);
            if (last2[0].so >= 2 && last2[1].so >= 2 && last2[0].kq !== last2[1].kq) {
                betPattern = last2[0].kq;
            }
        }
    }

    let prediction = '';
    let reason = '';
    let confidence = 0.6;

    if (streak >= 6) {
        prediction = last15[0] === 'Tài' ? 'Xỉu' : 'Tài';
        reason = `Chuỗi liên tiếp ${streak} ${last15[0]} -> đảo chiều`;
    } else if (streak >= 3 && streak <= 5) {
        prediction = last15[0];
        reason = `Chuỗi liên tiếp ${streak} ${last15[0]} -> theo cầu`;
    } else if (betPattern) {
        prediction = betPattern;
        reason = `Bệt kép phát hiện -> theo cầu`;
    } else if (demT > demX && (demT / (demT + demX)) >= 0.65) {
        prediction = 'Tài';
        reason = `Xu hướng Tài mạnh ${demT}T/${demX}X`;
    } else if (demX > demT && (demX / (demT + demX)) >= 0.65) {
        prediction = 'Xỉu';
        reason = `Xu hướng Xỉu mạnh ${demX}X/${demT}T`;
    } else if (last15[0] === last15[1] && last15[0] !== last15[2]) {
        prediction = last15[0] === 'Tài' ? 'Xỉu' : 'Tài';
        reason = `Mẫu lặp phát hiện -> đảo chiều`;
    } else {
        // fallback theo tỷ lệ
        prediction = demT >= demX ? 'Tài' : 'Xỉu';
        reason = `Fallback theo tỷ lệ Tài/Xỉu ${demT}/${demX}`;
    }

    // độ tin cậy theo tỷ lệ + ngẫu nhiên chút
    confidence = Math.min(95, Math.max(50, Math.round(Math.max(demT, demX) / (demT + demX) * 100)));

    return { prediction, reason, confidence: confidence / 100 };
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

        const aiResult = predictAI(data);

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
    res.send('👑 AI Predictor WormGPT Nội Bộ - Endpoint: /api/lookup_predict');
});

app.listen(PORT, () => {
    console.log(`🚀 Server chạy cổng ${PORT} - Time VN: ${getTimeVN()}`);
});
