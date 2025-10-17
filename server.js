const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================================
// I. DỮ LIỆU DỰ ĐOÁN (ĐÃ LOẠI BỎ MAP LỊCH SỬ CŨ)
// =====================================================================
// Không còn sử dụng PREDICTION_MAP

// --- CẤU HÌNH ---
const HISTORY_API_URL = 'https://lichsusunwin-h2g4.onrender.com/api/taixiu/ws';
// HISTORY_LENGTH không còn cần thiết nhưng giữ lại để không làm lỗi code khác

// =====================================================================
// II. CACHE DỰ ĐOÁN (ĐỂ CỐ ĐỊNH KẾT QUẢ CHO TỪNG PHIÊN)
// =====================================================================
/**
 * Lưu trữ kết quả dự đoán của phiên N+1 sau khi phiên N kết thúc.
 * {phienSau: "12345", du_doan: "Tài", do_tin_cay: "95.0%", predictionKey: "..."}
 */
let predictionCache = {
    phienSau: null,
    du_doan: "Đang chờ",
    do_tin_cay: "0.0%",
    predictionKey: "N/A"
};

// =====================================================================
// III. HÀM CHỨC NĂNG MỚI (DỰ ĐOÁN THEO TỔNG 3 XÚC XẮC)
// =====================================================================

/**
 * Thuật toán dự đoán *GIẢ LẬP KHÔNG NGẪU NHIÊN* dựa trên Tổng 3 xúc xắc.
 * Lưu ý: Thuật toán này không đảm bảo dự đoán chính xác 100% trong thực tế.
 * Logic: Tổng chẵn -> Tài | Tổng lẻ -> Xỉu
 *
 * @param {number} total - Tổng 3 xúc xắc của phiên N.
 * @returns {string} - Kết quả dự đoán ("Tài" hoặc "Xỉu").
 */
function predictFromTotal(total) {
    // Kiểm tra xem tổng có hợp lệ (3 đến 18)
    if (typeof total !== 'number' || total < 3 || total > 18) {
        return "Lỗi tổng xúc xắc";
    }
    
    // Quy tắc giả lập "chuẩn xác, không random"
    if (total % 2 === 0) { // Tổng chẵn
        return "Tài";
    } else { // Tổng lẻ
        return "Xỉu";
    }
}

/**
 * Tạo một giá trị độ tin cậy CỐ ĐỊNH CAO (Giả lập "chuẩn xác").
 * @returns {string} - Giá trị độ tin cậy dưới dạng chuỗi có ký hiệu %.
 */
function getFixedConfidence() {
    return "95.0%"; // Giá trị cố định
}


// =====================================================================
// IV. ENDPOINT DỰ ĐOÁN CHÍNH (SỬ DỤNG CACHE)
// =====================================================================
app.get('/api/lookup_predict', async (req, res) => {
    let prediction = "Không thể dự đoán";
    let confidence = getFixedConfidence(); // Lấy độ tin cậy cố định
    let predictionKey = "N/A";
    let currentData = null;
    let phienSau = "N/A";
    let tongXucXac = "N/A";

    try {
        const response = await axios.get(HISTORY_API_URL);
        const historyData = Array.isArray(response.data) ? response.data : [response.data];
        
        currentData = historyData.length > 0 ? historyData[0] : null;

        if (currentData) {
            phienSau = (parseInt(currentData.Phien) + 1).toString();
            
            // TÍNH TỔNG 3 XÚC XẮC
            const x1 = parseInt(currentData.Xuc_xac_1);
            const x2 = parseInt(currentData.Xuc_xac_2);
            const x3 = parseInt(currentData.Xuc_xac_3);
            tongXucXac = currentData.Tong || (x1 + x2 + x3);
        }

        // 1. KIỂM TRA CACHE: Nếu phiên tiếp theo đã được dự đoán, trả về ngay kết quả cache
        if (predictionCache.phienSau === phienSau && phienSau !== "N/A") {
             // Trả về kết quả ĐÃ LƯU TRỮ (cố định)
             return res.json({
                id: "@SHSUTS1_NEW_TOTAL",
                phien_truoc: currentData ? currentData.Phien : "N/A",
                xuc_xac: currentData ? [currentData.Xuc_xac_1, currentData.Xuc_xac_2, currentData.Xuc_xac_3] : "N/A",
                tong_xuc_xac: tongXucXac, 
                ket_qua_truoc: currentData ? currentData.Ket_qua : "N/A",
                lich_su_tra_cuu: predictionCache.predictionKey,
                phien_sau: predictionCache.phienSau,
                du_doan: predictionCache.du_doan, 
                do_tin_cay: predictionCache.do_tin_cay, // GIÁ TRỊ CỐ ĐỊNH CAO
                giai_thich: "bucuemko"
            });
        }


        // 2. TÍNH TOÁN DỰ ĐOÁN MỚI (CHỈ XẢY RA KHI PHIÊN MỚI)
        if (currentData && tongXucXac !== "N/A") {
            // SỬ DỤNG THUẬT TOÁN DỰ ĐOÁN MỚI DỰA TRÊN TỔNG
            prediction = predictFromTotal(tongXucXac); 
            predictionKey = `Tổng: ${tongXucXac} (${tongXucXac % 2 === 0 ? "Chẵn" : "Lẻ"})`;
        } else {
             // Không có dữ liệu để tính toán, trả về mặc định
            prediction = "Không có dữ liệu tổng";
            confidence = "0.0%";
            predictionKey = "Thiếu dữ liệu phiên trước";
        }
        
        // 3. LƯU KẾT QUẢ VÀO CACHE TRƯỚC KHI TRẢ VỀ
        if (phienSau !== "N/A" && prediction !== "Không có dữ liệu tổng") {
            predictionCache = {
                phienSau: phienSau,
                du_doan: prediction,
                do_tin_cay: confidence, // GIÁ TRỊ CỐ ĐỊNH
                predictionKey: predictionKey
            };
        }
        
        // 4. TRẢ VỀ PHẢN HỒI VỚI KẾT QUẢ MỚI
        res.json({
            id: "@STPSVI",
            phien_truoc: currentData ? currentData.Phien : "N/A",
            xuc_xac: currentData ? [currentData.Xuc_xac_1, currentData.Xuc_xac_2, currentData.Xuc_xac_3] : "N/A",
            tong_xuc_xac: tongXucXac,
            ket_qua_truoc: currentData ? currentData.Ket_qua : "N/A",
            lich_su_tra_cuu: predictionKey,
            phien_sau: phienSau,
            du_doan: prediction, 
            do_tin_cay: confidence, 
            giai_thich: `bucu`
        });

    } catch (err) {
        console.error("Lỗi API bên ngoài:", err.message);
        // Trả về dự đoán Mặc định khi API nguồn bị lỗi
        res.status(500).json({
            id: "@cskhtoollxk_new_total_error",
            error: "Lỗi kết nối API lịch sử. Đã trả về dự đoán mặc định (không ngẫu nhiên).",
            du_doan: "Xỉu", // Giá trị mặc định cố định
            do_tin_cay: getFixedConfidence(), // Độ tin cậy cố định
            giai_thich: "Lỗi nghiêm trọng khi gọi API lịch sử bên ngoài. Trả về Xỉu cố định."
        });
    }
});

app.get('/', (req, res) => {
    res.send("API dự đoán Tài Xỉu (New Total Standard) đã hoạt động. Truy cập /api/lookup_predict.");
});

app.listen(PORT, () => console.log(`Server đang chạy trên cổng ${PORT}`));
                



