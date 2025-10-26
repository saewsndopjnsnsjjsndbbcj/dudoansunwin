// server_vip_taixiu.js // Node.js + Express server - BOT DỰ ĐOÁN VIP++ (Tiếng Việt) // Chạy: node server_vip_taixiu.js

const express = require('express'); const axios = require('axios'); const app = express(); const PORT = process.env.PORT || 3000;

// ===================================================================== // I. CẤU HÌNH // ===================================================================== const HISTORY_API_URL = 'https://lichsusunwin-2.onrender.com/'; // <-- đổi nếu cần

// ===================================================================== // II. CACHE & THỐNG KÊ // ===================================================================== let predictionCache = { phienSau: null,      // phiên mà bot đã dự đoán du_doan: "Đang chờ", do_tin_cay: "0.0%" };

let dailyStats = { date: getVNDateString(), // ngày theo định dạng vi-VN total: 0, correct: 0, wrong: 0 };

// ===================================================================== // III. HỖ TRỢ NGÀY GIỜ THEO VN // ===================================================================== function getVNNow() { // Trả về đối tượng Date tương ứng thời gian hiện tại ở timezone Asia/Ho_Chi_Minh const now = new Date(); const vnString = now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }); return new Date(vnString); }

function getVNDateString() { return getVNNow().toLocaleDateString('vi-VN'); }

function getVNTimestamp() { return getVNNow().toLocaleString('vi-VN'); }

// ===================================================================== // IV. HÀM RESET THỐNG KÊ MỖI 00:00 VN // ===================================================================== function resetDailyStats() { dailyStats = { date: getVNDateString(), total: 0, correct: 0, wrong: 0 }; console.log([${getVNTimestamp()}] -> Đã reset thống kê hàng ngày.); }

function scheduleDailyResetAtMidnightVN() { const vnNow = getVNNow(); const nextMidnight = new Date(vnNow); nextMidnight.setHours(24, 0, 0, 0); // lúc 00:00 ngày kế tiếp (VN) const msUntilMidnight = nextMidnight - vnNow;

setTimeout(() => { resetDailyStats(); // Sau lần đầu, đặt interval 24h setInterval(resetDailyStats, 24 * 60 * 60 * 1000); }, msUntilMidnight); }

// Lên lịch khi server khởi động scheduleDailyResetAtMidnightVN();

// ===================================================================== // V. THUẬT TOÁN VIP++ (DỰA TRÊN 20 PHIÊN GẦN NHẤT) // ===================================================================== function vipPredict(historyData) { const recent = Array.isArray(historyData) ? historyData.slice(0, 20) : []; let tai = 0; let xiu = 0; let streak = 1; let maxStreak = 1;

// Đếm Tài/Xỉu & nhận dạng chuỗi lặp for (let i = 0; i < recent.length; i++) { const r = (recent[i].ket_qua || '').toString().toLowerCase(); if (r === 'tài' || r === 'tai') tai++; if (r === 'xỉu' || r === 'xiu' || r === 'xi u') xiu++;

if (i > 0 && recent[i].ket_qua === recent[i - 1].ket_qua) {
  streak++;
  if (streak > maxStreak) maxStreak = streak;
} else {
  streak = 1;
}

}

const total = tai + xiu || 1; // tránh chia cho 0 let prediction = tai > xiu ? 'Tài' : 'Xỉu';

// Nếu cầu kéo dài quá 3 -> phá cầu để tránh lặp if (maxStreak >= 3) { prediction = prediction === 'Tài' ? 'Xỉu' : 'Tài'; }

// Độ tin cậy theo lệch thống kê (60% - 95%) let confidence = Math.abs(tai - xiu) / total * 35 + 60; if (confidence > 95) confidence = 95; confidence = confidence.toFixed(1) + '%';

return { prediction, confidence }; }

// ===================================================================== // VI. ENDPOINT: /api/lookup_predict // - Gọi API lịch sử // - Dự đoán cho phiên kế tiếp // - Trả về JSON tiếng Việt // ===================================================================== app.get('/api/lookup_predict', async (req, res) => { try { // Lấy dữ liệu lịch sử từ API gốc const response = await axios.get(HISTORY_API_URL, { timeout: 5000 }); const historyData = Array.isArray(response.data) ? response.data : [response.data]; const currentData = historyData[0] || null; // phiên gần nhất

// Xác định phien sau (dự đoán cho phiên next)
let phienSau = 'N/A';
if (currentData && currentData.phien !== undefined) {
  phienSau = (parseInt(currentData.phien) + 1).toString();
}

// Kiểm tra cache (nếu đã dự đoán cùng phiên -> trả cache)
if (predictionCache.phienSau === phienSau && phienSau !== 'N/A') {
  return res.json({
    id: '@VIPAI009',
    time_vn: getVNTimestamp(),
    phien_truoc: currentData ? currentData.phien : 'N/A',
    xuc_xac: currentData ? [currentData.xuc_xac_1, currentData.xuc_xac_2, currentData.xuc_xac_3] : 'N/A',
    ket_qua_truoc: currentData ? currentData.ket_qua : 'N/A',
    phien_sau: predictionCache.phienSau,
    du_doan: predictionCache.du_doan,
    do_tin_cay: predictionCache.do_tin_cay,
    thong_ke: dailyStats
  });
}

// Reset thống kê hàng ngày nếu cần (check per request)
if (dailyStats.date !== getVNDateString()) {
  resetDailyStats();
}

// Tính dự đoán mới
const { prediction, confidence } = vipPredict(historyData);

// Lưu cache
if (phienSau !== 'N/A') {
  predictionCache = {
    phienSau,
    du_doan: prediction,
    do_tin_cay: confidence
  };
}

// Nếu có dữ liệu phiên trước và cache của bot trùng phiên trước -> Cập nhật đúng/sai
// (tức khi người gọi endpoint lần sau, currentData đã cập nhật kết quả thực tế của phiên bot dự đoán trước đó)
// Lưu ý: Nếu lịch sử API trả về luôn phiên mới nhất là phiên vừa kết thúc, thì đoạn này sẽ hoạt động.
if (currentData && predictionCache.phienSau && String(currentData.phien) === String(predictionCache.phienSau)) {
  // Cập nhật thống kê: phiên đã được so sánh
  dailyStats.total = (dailyStats.total || 0) + 1;
  if (predictionCache.du_doan === currentData.ket_qua) {
    dailyStats.correct = (dailyStats.correct || 0) + 1;
  } else {
    dailyStats.wrong = (dailyStats.wrong || 0) + 1;
  }
  // Sau khi dùng để so sánh, tránh đếm trùng lần nữa -> xoá cache phienSau để chỉ so sánh 1 lần
  predictionCache.phienSau = null;
}

// Trả về kết quả bằng tiếng Việt
return res.json({
  id: '@VIPAI009',
  time_vn: getVNTimestamp(),
  phien_truoc: currentData ? currentData.phien : 'N/A',
  xuc_xac: currentData ? [currentData.xuc_xac_1, currentData.xuc_xac_2, currentData.xuc_xac_3] : 'N/A',
  ket_qua_truoc: currentData ? currentData.ket_qua : 'N/A',
  phien_sau: phienSau,
  du_doan: prediction,
  do_tin_cay: confidence,
  thong_ke: dailyStats
});

} catch (err) { console.error('Lỗi khi gọi API lịch sử:', err.message || err); // Trả về dự đoán mặc định an toàn nếu API lỗi const fallback = { prediction: 'Xỉu', confidence: '60.0%' }; if (predictionCache.phienSau) { // nếu đã có cache cũ thì trả cache return res.json({ id: '@VIPAI009', time_vn: getVNTimestamp(), phien_truoc: 'N/A', xuc_xac: 'N/A', ket_qua_truoc: 'N/A', phien_sau: predictionCache.phienSau || 'N/A', du_doan: predictionCache.du_doan || fallback.prediction, do_tin_cay: predictionCache.do_tin_cay || fallback.confidence, thong_ke: dailyStats, note: 'Lỗi API lịch sử, trả về dự đoán cache hoặc mặc định.' }); }

return res.status(500).json({
  id: '@VIPAI009_ERR',
  error: 'Không lấy được dữ liệu lịch sử.',
  du_doan: fallback.prediction,
  do_tin_cay: fallback.confidence,
  thong_ke: dailyStats
});

} });

// ===================================================================== // VII. Endpoint: xem thống kê (có thể dùng để debug) // ===================================================================== app.get('/api/thongke', (req, res) => { res.json({ time_vn: getVNTimestamp(), thong_ke: dailyStats, cache: predictionCache }); });

// ===================================================================== // VIII. Trang chủ // ===================================================================== app.get('/', (req, res) => { res.send('✅ API DỰ ĐOÁN VIP++ đang chạy. Endpoint: /api/lookup_predict'); });

// ===================================================================== // IX. Khởi động server // ===================================================================== app.listen(PORT, () => console.log(🚀 Server chạy trên cổng ${PORT}));

// ===================================================================== // GHI CHÚ: // - Nếu muốn lưu lịch sử dự đoán hoặc thống kê lâu dài, nên gắn DB (file/SQLite/Mongo) // - Kiểm tra đúng timezone khi deploy (hosting có thể thay đổi timezone server) // - API lịch sử cần trả về phiên gần nhất có trường phien và ket_qua // =====================================================================
