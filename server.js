const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// --- DỮ LIỆU DỰ ĐOÁN (LOOKUP MAP) ---
// VUI LÒNG DÁN TOÀN BỘ CÁC "CẦU" CỦA BẠN VÀO ĐÂY ĐỂ ĐẠT ĐỘ CHUẨN XÁC CAO NHẤT.
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
    // ... Phần dữ liệu lớn của bạn bị lược bỏ tại đây ...
    "XTXXTTTXXTXXX": "Tài",
    "XTXXTTTXXXTTT": "Xỉu",
    "XTXXTTTXXXTTX": "Xỉu",
};

// --- CẤU HÌNH ---
const HISTORY_API_URL = 'https://lich-uhnh.onrender.com/api/taixiu';
const HISTORY_LENGTH = 13; 

// --- HÀM TÍNH TOÁN ĐỘ TIN CẬY XÁC ĐỊNH (CHUẨN XÁC NHẤT) ---
/**
 * Tính toán độ tin cậy không ngẫu nhiên (deterministic) dựa trên độ dài mẫu trùng khớp.
 *
 * @param {string} history - Chuỗi lịch sử 13 ký tự được dùng để tra cứu.
 * @param {string} prediction - Kết quả dự đoán ("Tài", "Xỉu", hoặc "Không xác định").
 * @returns {string} - Giá trị độ tin cậy dưới dạng chuỗi có ký hiệu %.
 */
function calculateConfidence(history, prediction) {
    if (prediction === "Thiếu dữ liệu lịch sử") {
        return "0.0%";
    }

    if (prediction !== "Không xác định") {
        // Nếu tìm thấy mẫu 13 ký tự, độ tin cậy là 100%
        return "100.0%";
    }

    if (history.length < 5) return "0.0%"; 

    let maxMatchLength = 0;
    const allPatterns = Object.keys(PREDICTION_MAP);

    // Kiểm tra các mẫu con (suffix) dài từ 5 đến 12 ký tự
    for (let len = HISTORY_LENGTH - 1; len >= 5; len--) {
        const partialHistory = history.substring(HISTORY_LENGTH - len);
        
        // Kiểm tra xem có mẫu nào trong Map kết thúc bằng partialHistory không
        const isMatched = allPatterns.some(pattern => {
            return pattern.endsWith(partialHistory);
        });

        if (isMatched) {
            maxMatchLength = len;
            break; 
        }
    }

    // --- CÔNG THỨC TÍNH TOÁN DETERMINISTIC ---
    const baseConfidence = 50.0; // Độ tin cậy cơ sở
    const maxContribution = 50.0; // Đóng góp tối đa từ sự trùng khớp (100.0 - 50.0)

    if (maxMatchLength > 0) {
        // Độ tin cậy tăng tuyến tính theo tỷ lệ chiều dài khớp
        const confidenceValue = baseConfidence + (maxContribution * (maxMatchLength / HISTORY_LENGTH));
        return confidenceValue.toFixed(1) + "%";
    }

    // Nếu không khớp bất kỳ mẫu con nào (>= 5 ký tự)
    return "50.0%"; // Trả về độ tin cậy cơ sở thấp
}


// --- HÀM DỰ ĐOÁN (KHÔNG NGẪU NHIÊN - DỰA TRÊN THUẬT TOÁN LOOKUP) ---
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
    // Tra cứu trực tiếp trong Map. Hoàn toàn không ngẫu nhiên.
    return PREDICTION_MAP[history] || "Không xác định";
}

// ---------------------------------------------------------------------
// --- ENDPOINT DỰ ĐOÁN CHÍNH ---
// ---------------------------------------------------------------------
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

        if (currentData) {
            phienSau = parseInt(currentData.Phien) + 1;
            tongXucXac = currentData.Tong || (parseInt(currentData.Xuc_xac_1) + parseInt(currentData.Xuc_xac_2) + parseInt(currentData.Xuc_xac_3));
        }

        // KIỂM TRA ĐỦ LỊCH SỬ CHO THUẬT TOÁN 13 KÝ TỰ
        if (historyData.length < HISTORY_LENGTH) {
            prediction = "Thiếu dữ liệu lịch sử";
        } else {
            // TẠO CHUỖI KHÓA TRA CỨU 13 KÝ TỰ
            const recentHistory = historyData
              .slice(0, HISTORY_LENGTH)
              .map(item => item.Ket_qua === 'Tài' ? 'T' : 'X')
              .join('');
            
            // Đảo ngược chuỗi (CŨ nhất -> MỚI nhất) để khớp với Map
            predictionKey = recentHistory.split('').reverse().join('');
            
            // 1. DỰ ĐOÁN (NON-RANDOM)
            prediction = predictFromHistory(predictionKey);
        }
        
        // 2. ĐỘ TIN CẬY (NON-RANDOM VÀ CHUẨN XÁC)
        confidence = calculateConfidence(predictionKey, prediction);

        res.json({
            id: "@cskhtoollxk_deterministic_final",
            phien_truoc: currentData ? currentData.Phien : "N/A",
            xuc_xac: currentData ? [currentData.Xuc_xac_1, currentData.Xuc_xac_2, currentData.Xuc_xac_3] : "N/A",
            tong_xuc_xac: tongXucXac,
            ket_qua_truoc: currentData ? currentData.Ket_qua : "N/A",
            lich_su_tra_cuu: predictionKey, // Chuỗi 13 ký tự hoặc N/A
            phien_sau: phienSau,
            du_doan: prediction, // Kết quả Tài/Xỉu/Không xác định
            do_tin_cay: confidence, // Giá trị TÍNH TOÁN XÁC ĐỊNH
            giai_thich: `bucutaodi`
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            id: "@cskhtoollxk_deterministic_final",
            error: "Lỗi hệ thống hoặc không thể lấy dữ liệu lịch sử từ API ngoài.",
            du_doan: "Không thể dự đoán",
            do_tin_cay: "0.0%",
            giai_thich: "Lỗi kết nối API lịch sử hoặc lỗi hệ thống backend."
        });
    }
});

app.get('/', (req, res) => {
    res.send("API dự đoán Tài Xỉu (Deterministic Confidence) đã hoạt động. Truy cập /api/lookup_predict.");
});

app.listen(PORT, () => console.log(`Server đang chạy trên cổng ${PORT}`));
                
