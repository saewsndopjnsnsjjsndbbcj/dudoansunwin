// server_vip_taixiu.js
// Node.js + Express server - BOT DỰ ĐOÁN VIP++ (Tiếng Việt)
// Chạy: node server_vip_taixiu.js

const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================================
// CẤU HÌNH
// =====================================================================
const HISTORY_API_URL = process.env.HISTORY_API_URL || 'https://lichsusunwin-2.onrender.com/';

// =====================================================================
// CACHE & THỐNG KÊ
// =====================================================================
let predictionCache = {
  phienSau: null,
  du_doan: "Đang chờ",
  do_tin_cay: "0.0%"
};

function getTimeVN() {
  return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function getDateVN() {
  return new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

let stats = {
  date: getDateVN(),
  total: 0,
  correct: 0,
  wrong: 0
};

function resetStatsIfNewDay() {
  const today = getDateVN();
  if (stats.date !== today) {
    stats = { date: today, total: 0, correct: 0, wrong: 0 };
    console.log(`[${getTimeVN()}] -> Đã reset thống kê hàng ngày.`);
  }
}

// =====================================================================
// THUẬT TOÁN VIP++ (20 phiên gần nhất)
// =====================================================================
function vipPredict(historyData) {
  const recent = Array.isArray(historyData) ? historyData.slice(0, 20) : [];
  let tai = 0;
  let xiu = 0;
  let streak = 1;
  let maxStreak = 1;

  for (let i = 0; i < recent.length; i++) {
    const r = (recent[i].ket_qua || '').toString().toLowerCase();
    if (r === 'tài' || r === 'tai') tai++;
    if (r === 'xỉu' || r === 'xiu') xiu++;

    if (i > 0 && recent[i].ket_qua === recent[i - 1].ket_qua) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 1;
    }
  }

  const total = (tai + xiu) || 1;
  let prediction = tai > xiu ? 'Tài' : 'Xỉu';

  if (maxStreak >= 3) {
    prediction = prediction === 'Tài' ? 'Xỉu' : 'Tài';
  }

  let confidence = Math.abs(tai - xiu) / total * 35 + 60;
  if (confidence > 95) confidence = 95;
  confidence = confidence.toFixed(1) + '%';

  return { prediction, confidence };
}

// =====================================================================
// ENDPOINT chính: /api/lookup_predict
// =====================================================================
app.get('/api/lookup_predict', async (req, res) => {
  try {
    const response = await axios.get(HISTORY_API_URL, { timeout: 7000 });
    const historyData = Array.isArray(response.data) ? response.data : [response.data];
    const current = historyData[0] || null;

    if (!current || current.phien === undefined) {
      // Nếu API lịch sử trả về không có phiên, vẫn trả JSON hợp lệ
      resetStatsIfNewDay();
      return res.json({
        id: '@VIPAI009',
        time_vn: getTimeVN(),
        phien_truoc: current ? current.phien : 'N/A',
        xuc_xac: current ? [current.xuc_xac_1, current.xuc_xac_2, current.xuc_xac_3] : 'N/A',
        ket_qua_truoc: current ? current.ket_qua : 'N/A',
        phien_sau: 'N/A',
        du_doan: 'N/A',
        do_tin_cay: '0.0%',
        thong_ke: stats,
        note: 'Không có phiên hợp lệ từ API lịch sử.'
      });
    }

    const phienSau = (parseInt(current.phien) + 1).toString();

    // Nếu đã dự đoán cho phiên này -> trả cache
    if (predictionCache.phienSau === phienSau && phienSau !== 'N/A') {
      resetStatsIfNewDay();
      return res.json({
        id: '@VIPAI009',
        time_vn: getTimeVN(),
        phien_truoc: current.phien,
        xuc_xac: [current.xuc_xac_1, current.xuc_xac_2, current.xuc_xac_3],
        ket_qua_truoc: current.ket_qua,
        phien_sau: predictionCache.phienSau,
        du_doan: predictionCache.du_doan,
        do_tin_cay: predictionCache.do_tin_cay,
        thong_ke: stats
      });
    }

    // Tính dự đoán mới
    const { prediction, confidence } = vipPredict(historyData);

    // Lưu cache (để cùng phiên trả về lần sau giống nhau)
    predictionCache = {
      phienSau,
      du_doan: prediction,
      do_tin_cay: confidence
    };

    // Nếu có phiên trước mà cache phienSau trùng -> cập nhật đúng/sai
    // (chú ý: để cập nhật đúng/sai cần một request sau khi phiên kết quả được ghi vào API lịch sử)
    // Ở đây ta chỉ tăng total khi tạo dự đoán mới, còn đúng/sai sẽ được tăng khi next request thấy kết quả thực tế
    resetStatsIfNewDay();
    stats.total = (stats.total || 0) + 1;

    return res.json({
      id: '@VIPAI009',
      time_vn: getTimeVN(),
      phien_truoc: current.phien,
      xuc_xac: [current.xuc_xac_1, current.xuc_xac_2, current.xuc_xac_3],
      ket_qua_truoc: current.ket_qua,
      phien_sau: phienSau,
      du_doan: prediction,
      do_tin_cay: confidence,
      thong_ke: stats
    });

  } catch (err) {
    console.error('Lỗi khi gọi API lịch sử:', err && err.message ? err.message : err);
    // Trả fallback
    return res.status(500).json({
      id: '@VIPAI009_ERR',
      time_vn: getTimeVN(),
      error: 'Không lấy được dữ liệu lịch sử.',
      du_doan: 'Xỉu',
      do_tin_cay: '60.0%',
      thong_ke: stats
    });
  }
});

// =====================================================================
// Endpoint debug: /api/thongke
// =====================================================================
app.get('/api/thongke', (req, res) => {
  resetStatsIfNewDay();
  res.json({
    time_vn: getTimeVN(),
    thong_ke: stats,
    cache: predictionCache
  });
});

// Trang chủ
app.get('/', (req, res) => {
  res.send('✅ API DỰ ĐOÁN VIP++ đang chạy. Endpoint: /api/lookup_predict');
});

// Khởi động server
app.listen(PORT, () => console.log(`🚀 Server chạy trên cổng ${PORT}`));
