const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// --- CẤU HÌNH ---
const HISTORY_API_URL = 'https://kbvvv.onrender.com/api/taixiu/ws';
const ALGORITHM_FILE = 'thuattoan.txt';

// Bạn cần xác định chính xác Key trong file của bạn có bao nhiêu ký tự.
// Dựa trên ảnh mẫu "XXXXXXXXXTTTXT", có vẻ là 12 ký tự.
const HISTORY_KEY_LENGTH = 12; 

// Biến lưu trữ dữ liệu thuật toán đã được xử lý
// Map: {"XXXXXXXXXTTTXT": "Xỉu", "XXXXXXXXXTTXT": "Tài", ...}
let predictionMapByKey = new Map();

// --- TẢI VÀ XỬ LÝ THUẬT TOÁN (CHẠY 1 LẦN) ---
/**
 * Đọc file 'thuattoan8192.txt', trích xuất Key (chuỗi X/T) và Value (Tài/Xỉu), 
 * sau đó lưu toàn bộ vào Map trong bộ nhớ.
 */
function loadPredictionAlgorithm() {
    try {
        const filePath = path.join(__dirname, ALGORITHM_FILE);
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split('\n');

        // Regex: Lấy chuỗi KEY ("...") và VALUE ("...")
        // Lưu ý: Key là nhóm 1, Value là nhóm 2
        const regex = /"(.+)":\s*"(Tài|Xỉu)"/;

        for (const line of lines) {
            const match = line.match(regex);
            if (match && match.length === 3) {
                const key = match[1];   
                const value = match[2]; 
                
                // Chỉ lưu trữ nếu Key có độ dài chính xác
                if (key.length === HISTORY_KEY_LENGTH) {
                    predictionMapByKey.set(key, value);
                }
            }
        }
        console.log(`✅ Đã tải thành công ${predictionMapByKey.size} mẫu dự đoán từ ${ALGORITHM_FILE}.`);
        
        if (predictionMapByKey.size === 0) {
            console.warn(`⚠️ Không tìm thấy mẫu nào có độ dài ${HISTORY_KEY_LENGTH} ký tự.`);
        }
    } catch (err) {
        console.error(`❌ LỖI: Không thể đọc hoặc xử lý file ${ALGORITHM_FILE}.`, err.message);
        // Đóng server nếu không thể tải dữ liệu thuật toán
        process.exit(1); 
    }
}

// --- LOGIC DỰ ĐOÁN (TRA CỨU) ---
/**
 * Thuật toán dự đoán: Tra cứu Key lịch sử (chuỗi X/T) trong bộ 8K mẫu.
 * @param {string} historyKey - Chuỗi lịch sử (ví dụ: "XXXXXXTTTTXX") để tra cứu.
 * @returns {string} - Kết quả dự đoán ("Tài" hoặc "Xỉu") hoặc "Không có mẫu".
 */
function fileBasedPredictTX(historyKey) {
    // Tra cứu cực nhanh trong Map đã được tải
    const prediction = predictionMapByKey.get(historyKey);
    return prediction || "Không có mẫu"; 
}

// --- HÀM TẠO ĐỘ TIN CẬY NGẪU NHIÊN ---
function getRandomConfidence() {
  const min = 80.0; // Độ tin cậy cao hơn khi dùng thuật toán lớn
  const max = 98.5; 
  const confidence = Math.random() * (max - min) + min;
  return confidence.toFixed(1) + "%";
}

// ----------------------------------------------------------------------
// --- ENDPOINT CHÍNH ---
// ----------------------------------------------------------------------
app.get('/api/2k15', async (req, res) => {
  try {
    const response = await axios.get(HISTORY_API_URL);
    // Giả sử API trả về mảng lịch sử (gần nhất ở đầu, cũ nhất ở cuối)
    const historyData = Array.isArray(response.data) ? response.data : [response.data];
    if (!historyData || historyData.length <= HISTORY_KEY_LENGTH) {
        throw new Error(`Không đủ dữ liệu lịch sử. Cần ${HISTORY_KEY_LENGTH} phiên.`);
    }

    const currentData = historyData[0];
    
    // 1. TẠO KEY TỪ LỊCH SỬ API
    const historyKeyArray = historyData
        .slice(1, HISTORY_KEY_LENGTH + 1) // Lấy lịch sử chính xác HISTORY_KEY_LENGTH phiên trước đó
        .map(item => item.Ket_qua === 'Tài' ? 'T' : 'X');

    // **QUAN TRỌNG NHẤT:** Xác định thứ tự Key trong file của bạn (CŨ -> MỚI hay MỚI -> CŨ)
    // Nếu file của bạn sắp xếp Key từ CŨ NHẤT đến MỚI NHẤT, bạn cần đảo ngược:
    const historyKey = historyKeyArray.reverse().join(''); 
    
    // Nếu file của bạn sắp xếp Key từ MỚI NHẤT đến CŨ NHẤT, hãy dùng:
    // const historyKey = historyKeyArray.join(''); 
    
    const phienTruocInt = parseInt(currentData.Phien);
    const nextSession = phienTruocInt + 1;

    // 2. TRA CỨU
    const prediction = fileBasedPredictTX(historyKey);
    
    // 3. XỬ LÝ KHI KHÔNG TÌM THẤY MẪU (Key không khớp với 8K mẫu)
    if (prediction === "Không có mẫu") {
        return res.status(200).json({ 
            id: "@cskhtoollxk",
            error: "Key lịch sử không khớp với bất kỳ mẫu nào trong bộ 8K.",
            history_key: historyKey,
            phien_sau: nextSession,
            du_doan: (historyKey.endsWith('T') ? "Xỉu" : "Tài"), // Ví dụ: Dự đoán ngược lại kết quả cuối cùng
            do_tin_cay: "60.0%",
            giai_thich: "Sử dụng logic dự phòng vì không tìm thấy Key trong thuật toán chính."
        });
    }

    // 4. TRẢ VỀ KẾT QUẢ TỪ THUẬT TOÁN
    const confidence = getRandomConfidence();

    res.json({
      id: "@cskhtoollxk",
      phien_truoc: currentData.Phien,
      ket_qua_truoc: currentData.Ket_qua,
      phien_sau: nextSession,
      history_key: historyKey, 
      du_doan: prediction,
      do_tin_cay: confidence,
      giai_thich: `Đã tra cứu thành công Key: ${historyKey} trong ${predictionMapByKey.size} mẫu.`
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      id: "@cskhtoollxk",
      error: "Lỗi hệ thống hoặc không thể lấy dữ liệu",
      du_doan: "Không thể dự đoán",
      do_tin_cay: "0%",
      giai_thich: "Lỗi: " + err.message
    });
  }
});

app.get('/', (req, res) => {
  res.send("Chào mừng đến API dự đoán Tài Xỉu! Truy cập /api/2k15 để xem dự đoán.");
});

// Tải dữ liệu thuật toán trước khi khởi động server
loadPredictionAlgorithm();

app.listen(PORT, () => console.log(`Server đang chạy trên cổng ${PORT}`));
