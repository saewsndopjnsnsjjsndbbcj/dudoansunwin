const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================================
// I. DỮ LIỆU DỰ ĐOÁN (LOOKUP MAP)
// =====================================================================
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
// II. CACHE DỰ ĐOÁN (ĐỂ CỐ ĐỊNH KẾT QUẢ CHO TỪNG PHIÊN)
// =====================================================================
/**
 * Lưu trữ kết quả dự đoán của phiên N+1 sau khi phiên N kết thúc.
 * {phienSau: "12345", du_doan: "Tài", do_tin_cay: "85.0%", predictionKey: "..."}
 */
let predictionCache = {
    phienSau: null,
    du_doan: "Đang chờ",
    do_tin_cay: "0.0%",
    predictionKey: "N/A"
};

// =====================================================================
// III. HÀM CHỨC NĂNG
// =====================================================================

/**
 * Thuật toán dự đoán dựa trên tra cứu Map 13 ký tự.
 *
 * @param {string} history - Chuỗi 13 kết quả gần nhất ("T" hoặc "X").
 * @returns {string} - Kết quả dự đoán ("Tài" hoặc "Xỉu") hoặc "Không xác định".
 */
function predictFromHistory(history) {
    if (history.length !== HISTORY_LENGTH) {
        return "Lỗi nội bộ độ dài lịch sử";
    }
    return PREDICTION_MAP[history] || "Không xác định";
}

/**
 * Tạo một giá trị độ tin cậy ngẫu nhiên (RANDOM) và CỐ ĐỊNH cho phiên này.
 * Phạm vi: 40.0% đến 90.0%
 * * @returns {string} - Giá trị độ tin cậy dưới dạng chuỗi có ký hiệu %.
 */
function generateRandomConfidence() {
    const min = 40.0; 
    const max = 90.0;
    const confidence = Math.random() * (max - min) + min;
    return confidence.toFixed(1) + "%";
}


// =====================================================================
// IV. ENDPOINT DỰ ĐOÁN CHÍNH (SỬ DỤNG CACHE)
// =====================================================================
app.get('/api/lookup_predict', async (req, res) => {
    let prediction = "Không thể dự đoán";
    let confidence = "0.0%"; // Sẽ được gán giá trị từ generateRandomConfidence()
    let predictionKey = "N/A";
    let currentData = null;
    let phienSau = "N/A";
    let tongXucXac = "N/A";
    let historyData = [];

    try {
        const response = await axios.get(HISTORY_API_URL);
        historyData = Array.isArray(response.data) ? response.data : [response.data];
        
        currentData = historyData.length > 0 ? historyData[0] : null;

        if (currentData) {
            phienSau = (parseInt(currentData.Phien) + 1).toString();
            // TÍNH TỔNG 3 XÚC XẮC NHƯ YÊU CẦU
            tongXucXac = currentData.Tong || (parseInt(currentData.Xuc_xac_1) + parseInt(currentData.Xuc_xac_2) + parseInt(currentData.Xuc_xac_3));
        }

        // 1. KIỂM TRA CACHE: Nếu phiên tiếp theo đã được dự đoán, trả về ngay kết quả cache
        if (predictionCache.phienSau === phienSau && phienSau !== "N/A") {
             // Trả về kết quả ĐÃ LƯU TRỮ (cố định)
             return res.json({
                id: "@SHSUTS1",
                phien_truoc: currentData ? currentData.Phien : "N/A",
                xuc_xac: currentData ? [currentData.Xuc_xac_1, currentData.Xuc_xac_2, currentData.Xuc_xac_3] : "N/A",
                tong_xuc_xac: tongXucXac, 
                ket_qua_truoc: currentData ? currentData.Ket_qua : "N/A",
                lich_su_tra_cuu: predictionCache.predictionKey,
                phien_sau: predictionCache.phienSau,
                du_doan: predictionCache.du_doan, 
                do_tin_cay: predictionCache.do_tin_cay, // GIÁ TRỊ CỐ ĐỊNH (random ban đầu)
                giai_thich: "bucuaditkemkkk"
            });
        }


        // 2. TÍNH TOÁN DỰ ĐOÁN MỚI (CHỈ XẢY RA KHI PHIÊN MỚI)
        let isPredictionFound = false;

        // --- BƯỚC QUAN TRỌNG: TẠO ĐỘ TIN CẬY NGẪU NHIÊN CỐ ĐỊNH CHO PHIÊN MỚI NÀY ---
        confidence = generateRandomConfidence(); 

        if (historyData.length >= HISTORY_LENGTH) {
            // ĐỦ DỮ LIỆU -> CỐ GẮNG DỰ ĐOÁN BẰNG THUẬT TOÁN
            const recentHistory = historyData
              .slice(0, HISTORY_LENGTH)
              .map(item => item.Ket_qua === 'Tài' ? 'T' : 'X')
              .join('');
            
            // Đảo ngược chuỗi để tra cứu
            predictionKey = recentHistory.split('').reverse().join(''); 
            
            prediction = predictFromHistory(predictionKey);

            if (prediction === "Không xác định") {
                // Không tìm thấy cầu -> DỰ ĐOÁN NGẪU NHIÊN LẤP ĐẦY
                prediction = Math.random() < 0.5 ? "Tài" : "Xỉu";                 
            } else {
                // Dự đoán thành công từ Map
                isPredictionFound = true;
            }

        } else {
            // KHÔNG ĐỦ DỮ LIỆU -> DỰ ĐOÁN NGẪU NHIÊN LẤP ĐẦY
            prediction = Math.random() < 0.5 ? "Tài" : "Xỉu";
            predictionKey = "Chỉ có " + historyData.length + " phiên";
        }
        
        // 3. LƯU KẾT QUẢ VÀO CACHE TRƯỚC KHI TRẢ VỀ
        if (phienSau !== "N/A") {
            predictionCache = {
                phienSau: phienSau,
                du_doan: prediction,
                do_tin_cay: confidence, // GIÁ TRỊ RANDOM ĐÃ ĐƯỢC CỐ ĐỊNH Ở BƯỚC 2
                predictionKey: isPredictionFound ? predictionKey : "NGẪU NHIÊN/THIẾU DATA"
            };
        }
        
        // 4. TRẢ VỀ PHẢN HỒI VỚI KẾT QUẢ MỚI
        res.json({
            id: "@cskhtoollxk_final_standard",
            phien_truoc: currentData ? currentData.Phien : "N/A",
            xuc_xac: currentData ? [currentData.Xuc_xac_1, currentData.Xuc_xac_2, currentData.Xuc_xac_3] : "N/A",
            tong_xuc_xac: tongXucXac,
            ket_qua_truoc: currentData ? currentData.Ket_qua : "N/A",
            lich_su_tra_cuu: predictionKey,
            phien_sau: phienSau,
            du_doan: prediction, 
            do_tin_cay: confidence, 
            giai_thich: ``
        });

    } catch (err) {
        console.error("Lỗi API bên ngoài:", err.message);
        // Trả về dự đoán Ngẫu nhiên nếu API nguồn bị lỗi
        res.status(500).json({
            id: "@cskhtoollxk_final_standard_error",
            error: "Lỗi kết nối API lịch sử. Đã trả về dự đoán ngẫu nhiên.",
            du_doan: Math.random() < 0.5 ? "Tài" : "Xỉu",
            do_tin_cay: generateRandomConfidence(), // Vẫn tạo random khi lỗi (nhưng không cache)
            giai_thich: "Lỗi nghiêm trọng khi gọi API lịch sử bên ngoài. Trả về ngẫu nhiên."
        });
    }
});

app.get('/', (req, res) => {
    res.send("API dự đoán Tài Xỉu (Fixed Standard) đã hoạt động. Truy cập /api/lookup_predict.");
});

app.listen(PORT, () => console.log(`Server đang chạy trên cổng ${PORT}`));
