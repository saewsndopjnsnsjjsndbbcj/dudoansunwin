// server_vip_pro.js
// Node.js + Express - BOT DỰ ĐOÁN SIÊU VIP PRO (T/X)
// - Dùng 15 phiên gần nhất (Anti-trend) + 10 phiên gần nhất (Pattern)
// - Anti-trend: dự đoán ngược với xu hướng chiếm đa số
// - Pattern: tìm cầu lặp lại đơn giản (bệt, 1-1)
// - Độ tin cậy ngẫu nhiên từ 50.0% đến 90.0% (được điều chỉnh theo logic)
// - Thống kê: Tổng, Đúng, Sai được cập nhật chính xác sau mỗi phiên có kết quả.
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
// Thống kê sẽ được cập nhật khi có kết quả thực tế của phiên đã dự đoán
let thongKeNgay = {
    ngay: getDateVN(),
    tong: 0, // Tổng số lần dự đoán (phiên đã dự đoán) trong ngày
    dung: 0,
    sai: 0
};

let cacheDuDoan = {
    phienDuDoan: null,     // phiên mà bot đã dự đoán (số)
    duDoan: "Đang chờ",    // "T" (Tài) hoặc "X" (Xỉu)
    doTinCay: "0.0%"       // string như "72.5%"
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
function randConfidence(min = CONF_MIN, max = CONF_MAX) {
    // Độ tin cậy ngẫu nhiên (dùng cho fallback/ban đầu)
    const r = Math.random() * (max - min) + min;
    return r.toFixed(1) + "%";
}

// Chuẩn hoá kết quả từ API (Tài -> T, Xỉu -> X)
function normalizeResult(val) {
    if (!val && val !== "") return "";
    const s = String(val).trim().toLowerCase();
    if (s === "tài" || s === "tai" || s === "taí" || s.includes("t")) return "T";
    if (s === "xỉu" || s === "xiu" || s === "xỉu " || s.includes("x")) return "X";
    return ""; // Trả về rỗng nếu không phải Tài/Xỉu
}

// -------------------- THUẬT TOÁN SIÊU VIP PRO (Anti-Trend + Pattern) --------------------
function superVipProPredict(historyArray) {
    const recent = Array.isArray(historyArray) ? historyArray : [];
    let duDoan = null; // T hoặc X
    // Confidence Weight: 0 (cân bằng) -> 100 (rất T) hoặc -100 (rất X)
    let confidenceWeight = 0; 

    // 1. Logic Anti-Trend (15 phiên) - Lực đẩy chính
    const antiTrendData = recent.slice(0, RECENT_COUNT_ANTI_TREND);
    let countT = 0, countX = 0;
    antiTrendData.forEach(item => {
        const kq = normalizeResult(item.ket_qua);
        if (kq === "T") countT++;
        else if (kq === "X") countX++;
    });

    if (countT + countX > 0) {
        const total = countT + countX;
        const ratioT = countT / total; 
        const ratioX = countX / total; 
        
        // Dự đoán ngược lại xu hướng (Anti-Trend)
        if (ratioT > ratioX) { 
            duDoan = "X"; // T nhiều -> dự đoán X
        } else if (ratioX > ratioT) { 
            duDoan = "T"; // X nhiều -> dự đoán T
        } else { 
            duDoan = Math.random() < 0.5 ? "T" : "X"; // Cân bằng -> ngẫu nhiên
        }

        // Độ mạnh của Anti-Trend (từ 0 đến 50)
        confidenceWeight += Math.abs(ratioT - ratioX) * 50; 
    } else {
        // Fallback ngẫu nhiên nếu không đủ dữ liệu
        duDoan = Math.random() < 0.5 ? "T" : "X";
    }
    
    // 2. Logic Pattern (10 phiên) - Lực điều chỉnh
    const patternData = recent.slice(0, RECENT_COUNT_PATTERN);
    if (patternData.length >= 3) {
        // Chuỗi kết quả (ví dụ: "XTXTXTXXXX")
        const patternString = patternData.map(item => normalizeResult(item.ket_qua)).join('');
        
        // Pattern Influence: -15 (ủng hộ X) đến 15 (ủng hộ T)
        let patternInfluence = 0; 

        // Phân tích 4 phiên gần nhất
        const last4 = patternString.substring(0, 4);
        if (last4.length === 4) {
            // Cầu bệt 4: TTTT hoặc XXXX -> Pattern mạnh mẽ. Dự đoán tiếp tục bệt.
            if (last4 === "TTTT") patternInfluence += 10; 
            if (last4 === "XXXX") patternInfluence -= 10; 
            
            // Cầu 1-1: TXTX hoặc XTXT -> Dự đoán tiếp tục 1-1.
            if (last4 === "TXTX") patternInfluence += 5; // Tiếp theo nên là T
            if (last4 === "XTXT") patternInfluence -= 5; // Tiếp theo nên là X
        }

        // Tác động lên độ tin cậy của Anti-Trend
        if (patternInfluence > 5 && duDoan === "T") { // Pattern mạnh mẽ T và Anti-trend ra T
            confidenceWeight += 10; // Tăng cường T
        } else if (patternInfluence < -5 && duDoan === "X") { // Pattern mạnh mẽ X và Anti-trend ra X
            confidenceWeight += 10; // Tăng cường X
        } else if (Math.abs(patternInfluence) > 5) { // Pattern mạnh mẽ, nhưng ngược Anti-Trend
            confidenceWeight -= 10; // Giảm độ tin cậy Anti-Trend
        }
        
        // Nếu dự đoán Anti-Trend trùng với Pattern vừa phải (ví dụ 1-1)
        if (patternInfluence === 5 && duDoan === "T") {
            confidenceWeight += 5;
        } else if (patternInfluence === -5 && duDoan === "X") {
            confidenceWeight += 5;
        }
    }
    
    // 3. Tính toán Độ tin cậy cuối cùng (Kết hợp với ngẫu nhiên)
    let confValue = CONF_MIN + confidenceWeight;
    
    // Thêm một phần ngẫu nhiên nhỏ (0% đến 5%) để tránh dự đoán cố định
    confValue += Math.random() * 5; 

    // Đảm bảo nằm trong khoảng 50.0% - 90.0%
    if (confValue > CONF_MAX) confValue = CONF_MAX;
    if (confValue < CONF_MIN) confValue = CONF_MIN;
    
    const doTinCay = confValue.toFixed(1) + "%";

    return { duDoan, doTinCay };
}


// -------------------- CẬP NHẬT ĐÚNG/SAI KHI CÓ KQ THỰC TẾ --------------------
function checkAndUpdateAccuracy(latest) {
    try {
        if (!latest || latest.phien === undefined) return;

        // Nếu không có dự đoán trước đó -> không làm gì
        if (!cacheDuDoan || !cacheDuDoan.phienDuDoan) return;

        const predictedPhien = String(cacheDuDoan.phienDuDoan);
        const latestPhien = String(latest.phien);

        // Khi phiên thực tế BẰNG phiên đã dự đoán trước đó -> đánh giá đúng/sai
        if (predictedPhien === latestPhien) {
            const actual = normalizeResult(latest.ket_qua); // T hoặc X
            const predicted = cacheDuDoan.duDoan; // T hoặc X
            
            // Chỉ cập nhật nếu kết quả thực tế là T hoặc X
            if(actual === "T" || actual === "X") {
                 if (actual === predicted) {
                    thongKeNgay.dung = (thongKeNgay.dung || 0) + 1;
                    console.log(`[${getTimeVN()}] -> Phiên ${latestPhien}: DỰ ĐOÁN ĐÚNG! (${predicted} vs ${actual}). Thống kê: ${thongKeNgay.dung}/${thongKeNgay.tong}`);
                } else {
                    thongKeNgay.sai = (thongKeNgay.sai || 0) + 1;
                    console.log(`[${getTimeVN()}] -> Phiên ${latestPhien}: DỰ ĐOÁN SAI! (${predicted} vs ${actual}). Thống kê: ${thongKeNgay.dung}/${thongKeNgay.tong}`);
                }
            }

            // Xóa cache sau khi đã cập nhật (tránh cập nhật lại)
            cacheDuDoan.phienDuDoan = null;
            cacheDuDoan.duDoan = "Đang chờ";
            cacheDuDoan.doTinCay = "0.0%";
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

        // 1. Cập nhật thống kê nếu phiên cũ đã có kết quả
        checkAndUpdateAccuracy(data[0]);

        // Tính dự đoán mới
        const { duDoan, doTinCay } = superVipProPredict(data);

        // Xác định phiên dự đoán tiếp theo
        const phienGanNhat = (data[0] && data[0].phien !== undefined) ? String(data[0].phien) : "N/A";
        const phienDuDoan = (phienGanNhat !== "N/A") ? String(parseInt(phienGanNhat) + 1) : "N/A";

        // 2. Trả về cache nếu phiên đã dự đoán (đảm bảo kết quả cố định trong 1 phiên)
        if (cacheDuDoan.phienDuDoan === phienDuDoan && phienDuDoan !== "N/A") {
            resetIfNewDayAndKeep();
            return res.json({
                id: "VIP_PRO_001_CACHE",
                time_vn: getTimeVN(),
                phien_gan_nhat: phienGanNhat,
                ket_qua_gan_nhat: normalizeResult(data[0].ket_qua),
                phien_du_doan: cacheDuDoan.phienDuDoan,
                du_doan: cacheDuDoan.duDoan,
                do_tin_cay: cacheDuDoan.doTinCay,
                thong_ke: thongKeNgay
            });
        }

        // 3. Cập nhật cache và tăng tổng dự đoán (chỉ khi có dự đoán mới)
        cacheDuDoan = {
            phienDuDoan,
            duDoan, // T hoặc X
            doTinCay
        };

        resetIfNewDayAndKeep();
        thongKeNgay.tong = (thongKeNgay.tong || 0) + 1;
        
        console.log(`[${getTimeVN()}] -> DỰ ĐOÁN MỚI: Phiên ${phienDuDoan} là ${duDoan} (${doTinCay})`);

        // 4. Trả về kết quả mới
        return res.json({
            id: "VIP_PRO_001",
            time_vn: getTimeVN(),
            phien_gan_nhat: phienGanNhat,
            ket_qua_gan_nhat: normalizeResult(data[0].ket_qua),
            phien_du_doan: phienDuDoan,
            du_doan: duDoan, // T hoặc X
            do_tin_cay: doTinCay,
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
        cache: cacheDuDoan
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
          
