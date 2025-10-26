// server_vip_pro.js
// Node.js + Express - BOT DỰ ĐOÁN SIÊU VIP PRO (Tài/Xỉu)
// - Dùng 15 phiên gần nhất (Anti-trend) + 10 phiên gần nhất (Pattern)
// - Độ tin cậy HOÀN TOÀN NGẪU NHIÊN 50-90%
// - Thống kê Đúng/Sai cập nhật ngay sau khi phiên có kết quả
// - Cache lưu trữ chi tiết dự đoán và kết quả thực tế (sau khi có)
// Chạy: node server_vip_pro.js

const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- CẤU HÌNH --------------------
const HISTORY_API_URL = process.env.HISTORY_API_URL || "https://lichsusunwin-2.onrender.com/"; // đổi nếu cần
const RECENT_COUNT_ANTI_TREND = 15; // số phiên gần nhất dùng cho Anti-trend
const RECENT_COUNT_PATTERN = 10; // số phiên gần nhất dùng cho Pattern
const CONF_MIN = 50.0; // %
const CONF_MAX = 90.0; // %

// -------------------- THỐNG KÊ & CACHE --------------------
let thongKeNgay = {
    ngay: getDateVN(),
    tong: 0, 
    dung: 0,
    sai: 0
};

// Cấu trúc cache mới để lưu chi tiết phiên đã dự đoán
let cacheDuDoan = {
    phienDuDoan: null,     // Phiên bot đã dự đoán
    duDoan: "Đang chờ",    // Dự đoán của bot ("Tài" hoặc "Xỉu")
    doTinCay: "0.0%",      // Độ tin cậy ngẫu nhiên
    chuoiPattern: "",      // Chuỗi T/X 10 phiên
    ketQuaThucTe: null     // NEW: Kết quả thực tế của phiên này (sau khi có)
};

// -------------------- HỖ TRỢ NGÀY GIỜ VN --------------------
function getTimeVN() {
    return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
function getDateVN() {
    return new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// -------------------- RESET THỐNG KÊ 00:00 VN --------------------
function resetThongKeNgay() {
    thongKeNgay = { ngay: getDateVN(), tong: 0, dung: 0, sai: 0 };
    console.log(`[${getTimeVN()}] -> Đã reset thống kê hàng ngày.`);
}

// Lên lịch reset lúc 00:00 VN (khi server khởi động)
(function scheduleMidnightReset() {
    try {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        const ms = nextMidnight - now;
        setTimeout(() => {
            resetThongKeNgay();
            setInterval(resetThongKeNgay, 24 * 60 * 60 * 1000);
        }, ms);
    } catch (e) {
        console.warn("Không thể lên lịch reset tự động (hosting có thể khác timezone).");
    }
})();

// -------------------- HÀM HỖ TRỢ --------------------

/**
 * Tạo độ tin cậy ngẫu nhiên (50.0% đến 90.0%)
 */
function randConfidence(min = CONF_MIN, max = CONF_MAX) {
    const r = Math.random() * (max - min) + min;
    return r.toFixed(1) + "%";
}

/**
 * Chuẩn hoá kết quả từ API sang T (Tài) hoặc X (Xỉu). Dùng trong logic nội bộ.
 */
function normalizeResultInternal(val) {
    if (!val && val !== "") return "";
    const s = String(val).trim().toLowerCase();
    if (s === "tài" || s === "tai" || s === "taí" || s.includes("t")) return "T";
    if (s === "xỉu" || s === "xiu" || s === "xỉu " || s.includes("x")) return "X";
    return "";
}

/**
 * Chuẩn hoá kết quả từ API sang "Tài" hoặc "Xỉu". Dùng cho API trả về và thống kê.
 */
function normalizeResultExternal(val) {
    const internal = normalizeResultInternal(val);
    if (internal === "T") return "Tài";
    if (internal === "X") return "Xỉu";
    return "";
}

// -------------------- THUẬT TOÁN SIÊU VIP PRO (Anti-Trend + Pattern) --------------------
/**
 * Trả về dự đoán ngoại bộ ("Tài" hoặc "Xỉu") và chuỗi pattern (T/X).
 */
function superVipProPredict(historyArray) {
    const recent = Array.isArray(historyArray) ? historyArray : [];
    let duDoanInternal = null; // T hoặc X
    
    // 1. Logic Anti-Trend (15 phiên) - Core Logic
    const antiTrendData = recent.slice(0, RECENT_COUNT_ANTI_TREND);
    let countT = 0, countX = 0;
    antiTrendData.forEach(item => {
        const kq = normalizeResultInternal(item.ket_qua);
        if (kq === "T") countT++;
        else if (kq === "X") countX++;
    });

    if (countT + countX > 0) {
        if (countT > countX) { 
            duDoanInternal = "X"; 
        } else if (countX > countT) { 
            duDoanInternal = "T"; 
        } else { 
            duDoanInternal = Math.random() < 0.5 ? "T" : "X"; 
        }
    } else {
        duDoanInternal = Math.random() < 0.5 ? "T" : "X";
    }
    
    // 2. Logic Pattern (10 phiên) - TẠO CHUỖI HIỂN THỊ
    const patternData = recent.slice(0, RECENT_COUNT_PATTERN);
    const chuoiPattern = patternData.map(item => normalizeResultInternal(item.ket_qua)).join('');
    
    const duDoanExternal = duDoanInternal === "T" ? "Tài" : (duDoanInternal === "X" ? "Xỉu" : "Đang chờ");

    return { duDoan: duDoanExternal, chuoiPattern };
}


// -------------------- CẬP NHẬT ĐÚNG/SAI KHI CÓ KQ THỰC TẾ --------------------
function checkAndUpdateAccuracy(latest) {
    try {
        if (!latest || latest.phien === undefined) return;

        // Nếu không có dự đoán nào đang chờ hoặc phiên chờ không xác định -> bỏ qua
        if (!cacheDuDoan || !cacheDuDoan.phienDuDoan) return;

        const predictedPhien = String(cacheDuDoan.phienDuDoan);
        const latestPhien = String(latest.phien);

        // Phiên mới nhất (latestPhien) đã là phiên mà ta từng dự đoán (predictedPhien)
        if (predictedPhien === latestPhien) {
            const actual = normalizeResultExternal(latest.ket_qua); 
            const predicted = cacheDuDoan.duDoan; 
            
            // Chỉ cập nhật nếu kết quả thực tế là Tài hoặc Xỉu
            if(actual === "Tài" || actual === "Xỉu") {
                // *** BƯỚC 1: CẬP NHẬT THỐNG KÊ ĐÚNG/SAI ***
                if (actual === predicted) {
                    thongKeNgay.dung = (thongKeNgay.dung || 0) + 1;
                    console.log(`[${getTimeVN()}] -> Phiên ${latestPhien}: DỰ ĐOÁN ĐÚNG! (${predicted} vs ${actual}). Thống kê: ${thongKeNgay.dung}/${thongKeNgay.tong}`);
                } else {
                    thongKeNgay.sai = (thongKeNgay.sai || 0) + 1;
                    console.log(`[${getTimeVN()}] -> Phiên ${latestPhien}: DỰ ĐOÁN SAI! (${predicted} vs ${actual}). Thống kê: ${thongKeNgay.dung}/${thongKeNgay.tong}`);
                }

                // *** BƯỚC 2: LƯU KẾT QUẢ THỰC TẾ VÀO CACHE TRƯỚC KHI DỌN DẸP ***
                // Lưu kết quả thực tế vào bản ghi cache hiện tại
                cacheDuDoan.ketQuaThucTe = actual; 
            } else {
                // Nếu kết quả không phải Tài/Xỉu (ví dụ: đang chờ), không làm gì.
                return;
            }

            // *** BƯỚC 3: DỌN DẸP CACHE SAU KHI ĐÃ LƯU KẾT QUẢ VÀ CẬP NHẬT THỐNG KÊ ***
            // Nếu bạn muốn lưu bản ghi đầy đủ, thì chỉ reset các trường để chuẩn bị cho phiên mới
            // Nếu bạn muốn nó biến mất sau khi được tính, bạn có thể comment đoạn dưới
            /*
            cacheDuDoan.phienDuDoan = null;
            cacheDuDoan.duDoan = "Đang chờ";
            cacheDuDoan.doTinCay = "0.0%";
            cacheDuDoan.chuoiPattern = "";
            */
            
            // Giữ lại kết quả đã lưu và reset các trường dự đoán để chuẩn bị cho phiên tiếp theo
            cacheDuDoan.phienDuDoan = null;
            cacheDuDoan.duDoan = "Đang chờ";
            cacheDuDoan.doTinCay = "0.0%"; 
            cacheDuDoan.chuoiPattern = "";
        }

    } catch (e) {
        console.warn("checkAndUpdateAccuracy error:", e && e.message ? e.message : e);
    }
}

// -------------------- ENDPOINT: /api/lookup_predict --------------------
app.get("/api/lookup_predict", async (req, res) => {
    try {
        const response = await axios.get(HISTORY_API_URL, { timeout: 7000 });
        const data = Array.isArray(response.data) ? response.data : [response.data];
        
        if (!data || data.length === 0) {
            return res.json({
                id: "VIP_PRO_001",
                time_vn: getTimeVN(),
                error: "Không có dữ liệu lịch sử",
                thong_ke: thongKeNgay
            });
        }

        resetIfNewDayAndKeep();

        // 1. Cập nhật thống kê và lưu kết quả thực tế của phiên trước đó
        checkAndUpdateAccuracy(data[0]);

        // Tính dự đoán mới
        const { duDoan, chuoiPattern } = superVipProPredict(data); 
        const doTinCay = randConfidence();

        // Xác định phiên dự đoán tiếp theo
        const phienGanNhat = (data[0] && data[0].phien !== undefined) ? String(data[0].phien) : "N/A";
        const phienDuDoan = (phienGanNhat !== "N/A") ? String(parseInt(phienGanNhat) + 1) : "N/A";
        const ketQuaGanNhat = normalizeResultExternal(data[0].ket_qua); 

        // 2. Trả về cache nếu phiên đã dự đoán (đảm bảo kết quả không đổi trong 1 phiên)
        if (cacheDuDoan.phienDuDoan === phienDuDoan && phienDuDoan !== "N/A") {
            resetIfNewDayAndKeep();
            return res.json({
                id: "VIP_PRO_001_CACHE",
                time_vn: getTimeVN(),
                phien_gan_nhat: phienGanNhat,
                ket_qua_gan_nhat: ketQuaGanNhat,
                phien_du_doan: cacheDuDoan.phienDuDoan,
                du_doan: cacheDuDoan.duDoan,
                do_tin_cay: cacheDuDoan.doTinCay,
                chuoi_pattern: cacheDuDoan.chuoiPattern, 
                ket_qua_thuc_te_phien_truoc: cacheDuDoan.ketQuaThucTe, // NEW: Kết quả thực tế của phiên đã dự đoán gần nhất
                thong_ke: thongKeNgay
            });
        }
        
        // 3. Cập nhật cache và tăng tổng dự đoán (chỉ khi có dự đoán mới)
        cacheDuDoan = {
            phienDuDoan,
            duDoan, 
            doTinCay,
            chuoiPattern,
            ketQuaThucTe: null // Reset kết quả thực tế cho phiên mới này
        };

        resetIfNewDayAndKeep();
        thongKeNgay.tong = (thongKeNgay.tong || 0) + 1;
        
        console.log(`[${getTimeVN()}] -> DỰ ĐOÁN MỚI: Phiên ${phienDuDoan} là ${duDoan} (${doTinCay})`);

        // 4. Trả về kết quả mới
        return res.json({
            id: "VIP_PRO_001",
            time_vn: getTimeVN(),
            phien_gan_nhat: phienGanNhat,
            ket_qua_gan_nhat: ketQuaGanNhat, 
            phien_du_doan: phienDuDoan,
            du_doan: duDoan, 
            do_tin_cay: doTinCay,
            chuoi_pattern: chuoiPattern,
            ket_qua_thuc_te_phien_truoc: null, // Mới dự đoán nên chưa có kết quả thực tế
            thong_ke: thongKeNgay
        });

    } catch (err) {
        console.error("Lỗi khi gọi API lịch sử:", err && err.message ? err.message : err);
        return res.status(500).json({
            id: "VIP_PRO_001_ERR",
            time_vn: getTimeVN(),
            error: "Không lấy được dữ liệu lịch sử",
            thong_ke: thongKeNgay
        });
    }
});

// -------------------- ENDPOINT: /api/thongke --------------------
app.get("/api/thongke", (req, res) => {
    resetIfNewDayAndKeep();
    return res.json({
        id: "VIP_PRO_001_STATS",
        time_vn: getTimeVN(),
        thong_ke: thongKeNgay,
        cache: cacheDuDoan // Cache hiện tại đã bao gồm kết quả thực tế (nếu có)
    });
});

// -------------------- HÀM RESET NGÀY TRƯỚC KHI TRẢ (KIỂM TRA MẪU) --------------------
function resetIfNewDayAndKeep() {
    const today = getDateVN();
    if (thongKeNgay.ngay !== today) {
        thongKeNgay = { ngay: today, tong: 0, dung: 0, sai: 0 };
        console.log(`[${getTimeVN()}] -> Reset thống kê ngày mới (trước trả API).`);
    }
}

// -------------------- TRANG CHỦ --------------------
app.get("/", (req, res) => {
    res.send("👑 SIÊU VIP PRO API đang chạy. Endpoint: /api/lookup_predict - Tiếng Việt");
});

// -------------------- RUN --------------------
app.listen(PORT, () => {
    console.log(`🚀 SIÊU VIP PRO server chạy cổng ${PORT} - Time VN: ${getTimeVN()}`);
});
