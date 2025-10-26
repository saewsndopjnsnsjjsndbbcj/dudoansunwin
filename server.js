// server_vip_pro.js
// Node.js + Express - BOT DỰ ĐOÁN SIÊU VIP PRO (Tài/Xỉu)
// - Dùng 15 phiên gần nhất (Anti-trend) + 10 phiên gần nhất (Pattern)
// - Độ tin cậy HOÀN TOÀN NGẪU NHIÊN 50-90%
// - Thống kê Đúng/Sai: Dự đoán phiên nào lưu phiên đó, so sánh với KQ thực tế.
// - Cache lưu chi tiết dự đoán và kết quả thực tế.
// Chạy: node server_vip_pro.js

const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- CẤU HÌNH --------------------
const HISTORY_API_URL = process.env.HISTORY_API_URL || "https://lichsusunwin-2.onrender.com/"; 
const RECENT_COUNT_ANTI_TREND = 15; // 15 phiên cho Anti-trend
const RECENT_COUNT_PATTERN = 10; // 10 phiên cho Pattern (chuỗi 10 cầu)
const CONF_MIN = 50.0; // %
const CONF_MAX = 90.0; // %

// -------------------- THỐNG KÊ & CACHE --------------------
let thongKeNgay = {
    ngay: getDateVN(),
    tong: 0, 
    dung: 0,
    sai: 0
};

// Cấu trúc cache lưu chi tiết phiên đã dự đoán
let cacheDuDoan = {
    phienDuDoan: null,     
    duDoan: "Đang chờ",    
    doTinCay: "0.0%",      
    chuoiPattern: "",      
    ketQuaThucTe: null,     // Kết quả thực tế của phiên này (sau khi có)
    daCapNhatThongKe: false // Trạng thái: Đã cập nhật thống kê ĐÚNG/SAI cho phiên này chưa?
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
    // Khi reset ngày, cũng nên reset cache để tránh lỗi
    cacheDuDoan = {
        phienDuDoan: null, duDoan: "Đang chờ", doTinCay: "0.0%", 
        chuoiPattern: "", ketQuaThucTe: null, daCapNhatThongKe: false
    };
    console.log(`[${getTimeVN()}] -> Đã reset thống kê hàng ngày và cache.`);
}

// Lên lịch reset lúc 00:00 VN
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
        console.warn("Không thể lên lịch reset tự động.");
    }
})();

// -------------------- HÀM HỖ TRỢ --------------------

function randConfidence(min = CONF_MIN, max = CONF_MAX) {
    const r = Math.random() * (max - min) + min;
    return r.toFixed(1) + "%";
}

function normalizeResultInternal(val) {
    if (!val && val !== "") return "";
    const s = String(val).trim().toLowerCase();
    if (s === "tài" || s.includes("t")) return "T";
    if (s === "xỉu" || s.includes("x")) return "X";
    return "";
}

function normalizeResultExternal(val) {
    const internal = normalizeResultInternal(val);
    if (internal === "T") return "Tài";
    if (internal === "X") return "Xỉu";
    return "";
}

// -------------------- THUẬT TOÁN SIÊU VIP PRO (Anti-Trend + Pattern) --------------------
function superVipProPredict(historyArray) {
    const recent = Array.isArray(historyArray) ? historyArray : [];
    let duDoanInternal = null; 
    
    // 1. Logic Anti-Trend (15 phiên)
    const antiTrendData = recent.slice(0, RECENT_COUNT_ANTI_TREND);
    let countT = 0, countX = 0;
    antiTrendData.forEach(item => {
        const kq = normalizeResultInternal(item.ket_qua);
        if (kq === "T") countT++;
        else if (kq === "X") countX++;
    });

    if (countT + countX > 0) {
        if (countT > countX) { 
            duDoanInternal = "X"; // T nhiều -> dự đoán X
        } else if (countX > countT) { 
            duDoanInternal = "T"; // X nhiều -> dự đoán T
        } else { 
            duDoanInternal = Math.random() < 0.5 ? "T" : "X"; 
        }
    } else {
        duDoanInternal = Math.random() < 0.5 ? "T" : "X";
    }
    
    // 2. Logic Pattern (10 phiên) - TẠO CHUỖI HIỂN THỊ
    const patternData = recent.slice(0, RECENT_COUNT_PATTERN);
    // Chuỗi 10 cầu T/X
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

        // Phiên mới nhất (latestPhien) có phải là phiên mà ta đã dự đoán trước đó không?
        if (predictedPhien === latestPhien) {
            
            const actual = normalizeResultExternal(latest.ket_qua); 
            const predicted = cacheDuDoan.duDoan; 
            
            // Chỉ cập nhật nếu kết quả thực tế là Tài hoặc Xỉu VÀ chưa cập nhật thống kê
            if((actual === "Tài" || actual === "Xỉu") && !cacheDuDoan.daCapNhatThongKe) {
                
                // *** BƯỚC 1: CẬP NHẬT THỐNG KÊ ĐÚNG/SAI ***
                if (actual === predicted) {
                    thongKeNgay.dung = (thongKeNgay.dung || 0) + 1;
                    console.log(`[${getTimeVN()}] -> Phiên ${latestPhien}: DỰ ĐOÁN ĐÚNG! (${predicted} vs ${actual}). Thống kê: ${thongKeNgay.dung}/${thongKeNgay.tong}`);
                } else {
                    thongKeNgay.sai = (thongKeNgay.sai || 0) + 1;
                    console.log(`[${getTimeVN()}] -> Phiên ${latestPhien}: DỰ ĐOÁN SAI! (${predicted} vs ${actual}). Thống kê: ${thongKeNgay.dung}/${thongKeNgay.tong}`);
                }
                
                cacheDuDoan.daCapNhatThongKe = true; // Đánh dấu đã cập nhật
            } 
            
            // *** BƯỚC 2: LƯU KẾT QUẢ THỰC TẾ VÀO CACHE ***
            if (actual === "Tài" || actual === "Xỉu") {
                cacheDuDoan.ketQuaThucTe = actual; 
            }
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

        // 1. Cập nhật thống kê và lưu kết quả thực tế của phiên trước đó (nếu có)
        checkAndUpdateAccuracy(data[0]);

        // Xác định phiên dự đoán tiếp theo
        const phienGanNhat = (data[0] && data[0].phien !== undefined) ? String(data[0].phien) : "N/A";
        const phienDuDoanTiepTheo = (phienGanNhat !== "N/A") ? String(parseInt(phienGanNhat) + 1) : "N/A";
        const ketQuaGanNhat = normalizeResultExternal(data[0].ket_qua); 

        // 2. Trả về cache nếu phiên hiện tại vẫn đang chờ kết quả (giữ nguyên dự đoán cũ)
        if (cacheDuDoan.phienDuDoan === phienDuDoanTiepTheo && phienDuDoanTiepTheo !== "N/A") {
            resetIfNewDayAndKeep();
            return res.json({
                id: "@STPSWQ",
                time_vn: getTimeVN(),
                phien_gan_nhat: phienGanNhat,
                ket_qua_gan_nhat: ketQuaGanNhat,
                phien_du_doan: cacheDuDoan.phienDuDoan,
                du_doan: cacheDuDoan.duDoan,
                do_tin_cay: cacheDuDoan.doTinCay,
                chuoi_pattern: cacheDuDoan.chuoiPattern, 
                ket_qua_thuc_te_phien_du_doan: cacheDuDoan.ketQuaThucTe, 
                thong_ke: thongKeNgay
            });
        }
        
        // --- TÍNH DỰ ĐOÁN MỚI CHO PHIÊN TIẾP THEO ---
        const { duDoan, chuoiPattern } = superVipProPredict(data); 
        const doTinCay = randConfidence();

        // 3. Cập nhật cache và tăng tổng dự đoán (chỉ khi có dự đoán mới)
        // Lưu dự đoán mới vào cache, reset các trường liên quan đến KQ thực tế
        cacheDuDoan = {
            phienDuDoan: phienDuDoanTiepTheo,
            duDoan, 
            doTinCay,
            chuoiPattern,
            ketQuaThucTe: null, // Phiên này chưa có kết quả thực tế
            daCapNhatThongKe: false
        };

        resetIfNewDayAndKeep();
        thongKeNgay.tong = (thongKeNgay.tong || 0) + 1; // Tăng tổng dự đoán
        
        console.log(`[${getTimeVN()}] -> DỰ ĐOÁN MỚI: Phiên ${phienDuDoanTiepTheo} là ${duDoan} (${doTinCay})`);

        // 4. Trả về kết quả mới
        return res.json({
            id: "@STPSWQ",
            time_vn: getTimeVN(),
            phien_gan_nhat: phienGanNhat,
            ket_qua_gan_nhat: ketQuaGanNhat, 
            phien_du_doan: phienDuDoanTiepTheo,
            du_doan: duDoan, 
            do_tin_cay: doTinCay,
            chuoi_pattern: chuoiPattern,
            ket_qua_thuc_te_phien_du_doan: null, // Mới dự đoán nên chưa có kết quả thực tế
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
        cache_du_doan_gan_nhat: cacheDuDoan // Cache hiện tại đã bao gồm kết quả thực tế (nếu có)
    });
});

// -------------------- HÀM RESET NGÀY TRƯỚC KHI TRẢ (KIỂM TRA MẪU) --------------------
function resetIfNewDayAndKeep() {
    const today = getDateVN();
    if (thongKeNgay.ngay !== today) {
        resetThongKeNgay();
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
