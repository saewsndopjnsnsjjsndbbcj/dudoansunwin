const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================================
// I. CẤU HÌNH NGUỒN DỮ LIỆU
// =====================================================================
const HISTORY_API_URL = 'https://bajh.onrender.com/';

// =====================================================================
// II. CACHE DỰ ĐOÁN (ĐỂ CỐ ĐỊNH KẾT QUẢ CHO TỪNG PHIÊN)
// =====================================================================
let predictionCache = {
  phienSau: null,
  du_doan: "Đang chờ",
  do_tin_cay: "0.0%",
  predictionKey: "N/A"
};

// =====================================================================
// III. HÀM DỰ ĐOÁN THEO TỔNG 3 XÚC XẮC (CHUẨN)
// =====================================================================
function predictFromTotal(total) {
  if (typeof total !== 'number' || total < 3 || total > 18) {
    return "Lỗi tổng xúc xắc";
  }
  // Tổng chẵn => Tài | Tổng lẻ => Xỉu
  return total % 2 === 0 ? "Tài" : "Xỉu";
}

// =====================================================================
// IV. HÀM ĐỘ TIN CẬY NGẪU NHIÊN (50–90%)
// =====================================================================
function getRandomConfidence() {
  const min = 50;
  const max = 90;
  const randomValue = Math.random() * (max - min) + min;
  return randomValue.toFixed(1) + "%";
}

// =====================================================================
// V. ENDPOINT CHÍNH – DỰ ĐOÁN TỪ PHIÊN GẦN NHẤT
// =====================================================================
app.get('/api/lookup_predict', async (req, res) => {
  let prediction = "Không thể dự đoán";
  let confidence = getRandomConfidence();
  let predictionKey = "N/A";
  let currentData = null;
  let phienSau = "N/A";
  let tongXucXac = "N/A";

  try {
    // Gọi API gốc
    const response = await axios.get(HISTORY_API_URL);
    const historyData = Array.isArray(response.data) ? response.data : [response.data];
    currentData = historyData[0] || null;

    if (currentData) {
      phienSau = (parseInt(currentData.phien) + 1).toString();

      // Tính tổng 3 xúc xắc
      const x1 = parseInt(currentData.xuc_xac_1);
      const x2 = parseInt(currentData.xuc_xac_2);
      const x3 = parseInt(currentData.xuc_xac_3);
      tongXucXac = currentData.tong || (x1 + x2 + x3);
    }

    // --- Kiểm tra cache ---
    if (predictionCache.phienSau === phienSau && phienSau !== "N/A") {
      return res.json({
        id: "@SHSUTS1",
        phien_truoc: currentData ? currentData.phien : "N/A",
        xuc_xac: currentData ? [currentData.xuc_xac_1, currentData.xuc_xac_2, currentData.xuc_xac_3] : "N/A",
        tong_xuc_xac: tongXucXac,
        ket_qua_truoc: currentData ? currentData.ket_qua : "N/A",
        lich_su_tra_cuu: predictionCache.predictionKey,
        phien_sau: predictionCache.phienSau,
        du_doan: predictionCache.du_doan,
        do_tin_cay: predictionCache.do_tin_cay,
        giai_thich: "cache"
      });
    }

    // --- Tính toán dự đoán mới ---
    if (currentData && tongXucXac !== "N/A") {
      prediction = predictFromTotal(tongXucXac);
      predictionKey = `Tổng: ${tongXucXac} (${tongXucXac % 2 === 0 ? "Chẵn" : "Lẻ"})`;
      confidence = getRandomConfidence();
    } else {
      prediction = "Không có dữ liệu tổng";
      confidence = "0.0%";
      predictionKey = "Thiếu dữ liệu phiên trước";
    }

    // --- Lưu cache ---
    if (phienSau !== "N/A" && prediction !== "Không có dữ liệu tổng") {
      predictionCache = {
        phienSau,
        du_doan: prediction,
        do_tin_cay: confidence,
        predictionKey
      };
    }

    // --- Trả về phản hồi ---
    res.json({
      id: "@STPSVI",
      phien_truoc: currentData ? currentData.phien : "N/A",
      xuc_xac: currentData ? [currentData.xuc_xac_1, currentData.xuc_xac_2, currentData.xuc_xac_3] : "N/A",
      tong_xuc_xac: tongXucXac,
      ket_qua_truoc: currentData ? currentData.ket_qua : "N/A",
      lich_su_tra_cuu: predictionKey,
      phien_sau: phienSau,
      du_doan: prediction,
      do_tin_cay: confidence,
      giai_thich: "bucu"
    });

  } catch (err) {
    console.error("Lỗi API:", err.message);
    res.status(500).json({
      id: "@cskhtoollxk_new_total_error",
      error: "Không lấy được dữ liệu lịch sử.",
      du_doan: "Xỉu",
      do_tin_cay: getRandomConfidence(),
      giai_thich: "API lỗi, trả về dự đoán mặc định."
    });
  }
});

// =====================================================================
// VI. TRANG CHỦ
// =====================================================================
app.get('/', (req, res) => {
  res.send("✅ API dự đoán Tài Xỉu đang hoạt động! → /api/lookup_predict");
});

// =====================================================================
// VII. KHỞI ĐỘNG SERVER
// =====================================================================
app.listen(PORT, () => console.log(`🚀 Server chạy trên cổng ${PORT}`));
