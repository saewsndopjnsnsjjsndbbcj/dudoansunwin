const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================================
// I. DỮ LIỆU DỰ ĐOÁN (LOOKUP MAP)
// =====================================================================
// CHÚ Ý: ĐỂ ĐẠT ĐỘ CHUẨN XÁC TỪ THUẬT TOÁN TRA CỨU, VUI LÒNG DÁN 
// TOÀN BỘ CÁC "CẦU" CỦA BẠN VÀO PREDICTION_MAP DƯỚI ĐÂY.
const PREDICTION_MAP = {
    "XTXTTXTTXXTXX": "Xỉu",
    "XTXTTXTTXXXTT": "Tài",
    "XTXTTXTTXXXTX": "Tài",
    "XTXTTXTTXXXXT": "Xỉu",
    "XTXTTXTTXXXXX": "Xỉu",
    "XTXTTXTXTTTTT": "Tài",
    "XTXTTXTXTTTTX": "Tài",
    "XTXTTXTXTTTXT": "Xỉu",
    "XTXTTXTXTTTXX": "Xỉu",
    "XTXTTXTXTTXTT": "Tài",
    // ... Dữ liệu Map của bạn phải được dán vào đây ...
    "XTXXTTTXXTXXX": "Tài",
    "XTXXTTTXXXTTT": "Xỉu",
    "XTXXTTTXXXTTX": "Xỉu",
};

// --- CẤU HÌNH ---
const HISTORY_API_URL = 'https://lich-uhnh.onrender.com/api/taixiu';
const HISTORY_LENGTH = 13; // Độ dài chuỗi tra cứu bắt buộc

// =====================================================================
// II. HÀM CHỨC NĂNG
// =====================================================================

/**
 * Tạo một giá trị độ tin cậy ngẫu nhiên (RANDOM).
 *
 * @param {boolean} highRange - True: 65.0% - 95.0% (Dự đoán thành công/Tra cứu được). False: 50.0% - 60.0% (Dự đoán ngẫu nhiên do thiếu data).
 * @returns {string} - Giá trị độ tin cậy dưới dạng chuỗi có ký hiệu %.
 */
function getRandomConfidence(highRange = true) {
  let min, max;
  if (highRange) {
      min = 65.0;
      max = 95.0;
  } else {
      // Phạm vi thấp, dùng cho dự đoán ngẫu nhiên (không có cơ sở Map)
      min = 50.0; 
      max = 60.0;
  }
  const confidence = Math.random() * (max - min) + min;
  return confidence.toFixed(1) + "%";
}

/**
 * Thuật toán dự đoán dựa trên tra cứu Map 13 ký tự (Không ngẫu nhiên).
 *
 * @param {string} history - Chuỗi 13 kết quả gần nhất ("T" hoặc "X").
 * @returns {string} - Kết quả dự đoán ("Tài" hoặc "Xỉu") hoặc "Không xác định".
 */
function predictFromHistory(history) {
    if (history.length !== HISTORY_LENGTH) {
        return "Lỗi nội bộ độ dài lịch sử"; // Không nên xảy ra
    }
    return PREDICTION_MAP[history] || "Không xác định";
}


// =====================================================================
// III. ENDPOINT DỰ ĐOÁN CHÍNH (KHÔNG BAO GIỜ TRẢ LỖI)
// =====================================================================
app.get('/api/lookup_predict', async (req, res) => {
    let prediction = "Không thể dự đoán";
    let confidence = "0.0%";
    let predictionKey = "N/A";
    let currentData = null;
    let phienSau = "N/A";
    let tongXucXac = "N/A";
    let historyData = [];

    try {
        const response = await axios.get(HISTORY_API_URL);
        historyData = Array.isArray(response.data) ? response.data : [response.data];
        
        currentData = historyData.length > 0 ? historyData[0] : null;

        // Tính toán thông tin phiên và tổng xúc xắc
        if (currentData) {
            phienSau = parseInt(currentData.Phien) + 1;
            // TÍNH TỔNG 3 XÚC XẮC NHƯ YÊU CẦU
            tongXucXac = currentData.Tong || (parseInt(currentData.Xuc_xac_1) + parseInt(currentData.Xuc_xac_2) + parseInt(currentData.Xuc_xac_3));
        }

        // --- LOGIC DỰ ĐOÁN ƯU TIÊN (LOOKUP) ---
        if (historyData.length >= HISTORY_LENGTH) {
            // 1. ĐỦ DỮ LIỆU -> CỐ GẮNG DỰ ĐOÁN BẰNG THUẬT TOÁN
            const recentHistory = historyData
              .slice(0, HISTORY_LENGTH)
              .map(item => item.Ket_qua === 'Tài' ? 'T' : 'X')
              .join('');
            
            predictionKey = recentHistory.split('').reverse().join('');
            
            prediction = predictFromHistory(predictionKey);

            if (prediction === "Không xác định") {
                // 1b. Không tìm thấy cầu trong Map -> DỰ ĐOÁN LẤP ĐẦY
                prediction = Math.random() < 0.5 ? "Tài" : "Xỉu";
                confidence = getRandomConfidence(false); // Độ tin cậy Random LOW
                
            } else {
                // 1a. Dự đoán thành công từ Map -> ĐỘ TIN CẬY RANDOM CAO
                confidence = getRandomConfidence(true);
            }

        } else {
            // 2. KHÔNG ĐỦ DỮ LIỆU (< 13 phiên) -> DỰ ĐOÁN LẤP ĐẦY NGẪU NHIÊN
            prediction = Math.random() < 0.5 ? "Tài" : "Xỉu";
            confidence = getRandomConfidence(false); // Độ tin cậy Random LOW
            predictionKey = "Chỉ có " + historyData.length + " phiên";
        }
        
        // --- TRẢ VỀ PHẢN HỒI LUÔN CÓ DỰ ĐOÁN VÀ ĐỘ TIN CẬY ---
        res.json({
            id: "@cskhtoollxk_final_standard",
            phien_truoc: currentData ? currentData.Phien : "N/A",
            xuc_xac: currentData ? [currentData.Xuc_xac_1, currentData.Xuc_xac_2, currentData.Xuc_xac_3] : "N/A",
            tong_xuc_xac: tongXucXac, // KẾT QUẢ TÍNH TỔNG XÚC XẮC
            ket_qua_truoc: currentData ? currentData.Ket_qua : "N/A",
            lich_su_tra_cuu: predictionKey,
            phien_sau: phienSau,
            du_doan: prediction, 
            do_tin_cay: confidence, // GIÁ TRỊ NGẪU NHIÊN (RANDOM)
            giai_thich: `bucutdi`
        });

    } catch (err) {
        console.error("Lỗi API bên ngoài:", err.message);
        // Trả về dự đoán Ngẫu nhiên nếu API nguồn bị lỗi
        res.status(500).json({
            id: "@cskhtoollxk_final_standard",
            error: "Lỗi kết nối API lịch sử. Đã trả về dự đoán ngẫu nhiên.",
            du_doan: Math.random() < 0.5 ? "Tài" : "Xỉu",
            do_tin_cay: getRandomConfidence(false),
            giai_thich: "Lỗi nghiêm trọng khi gọi API lịch sử bên ngoài."
        });
    }
});

app.get('/', (req, res) => {
    res.send("API dự đoán Tài Xỉu (Fixed Standard) đã hoạt động. Truy cập /api/lookup_predict.");
});

app.listen(PORT, () => console.log(`Server đang chạy trên cổng ${PORT}`));
        
