// server_vip_pro.js
// Node.js + Express - BOT DỰ ĐOÁN VIP PRO (Tiếng Việt)
// - Dùng 15 phiên gần nhất
// - Anti-trend (không dựa vào 1 phiên trước)
// - Độ tin cậy ngẫu nhiên từ 50.0% đến 90.0%
// Chạy: node server_vip_pro.js

const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- CẤU HÌNH --------------------
const HISTORY_API_URL = process.env.HISTORY_API_URL || "https://lichsusunwin-2.onrender.com/"; // đổi nếu cần
const RECENT_COUNT = 15; // số phiên gần nhất dùng để phân tích
const CONF_MIN = 50.0; // %
const CONF_MAX = 90.0; // %

// -------------------- THỐNG KÊ & CACHE --------------------
let thongKeNgay = {
  ngay: getDateVN(),
  tong: 0,
  dung: 0,
  sai: 0
};

let cacheDuDoan = {
  phienDuDoan: null,     // phiên mà bot đã dự đoán (số)
  duDoan: "Đang chờ",    // "Tài" hoặc "Xỉu"
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
  const r = Math.random() * (max - min) + min;
  return r.toFixed(1) + "%";
}

// Chuẩn hoá kết quả từ API (tránh chữ hoa/ko dấu)
function normalizeResult(val) {
  if (!val && val !== "") return "";
  const s = String(val).trim().toLowerCase();
  if (s === "tài" || s === "tai" || s === "taí") return "Tài";
  if (s === "xỉu" || s === "xiu" || s === "xỉu ") return "Xỉu";
  // Nếu có dạng "Tài - Xỉu" etc, try includes
  if (s.includes("t")) return "Tài";
  if (s.includes("x")) return "Xỉu";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// -------------------- THUẬT TOÁN VIP PRO (ANTI-TREND) --------------------
function vipProPredict(historyArray) {
  // historyArray là mảng các object có field ket_qua chứa "Tài" hoặc "Xỉu"
  const recent = Array.isArray(historyArray) ? historyArray.slice(0, RECENT_COUNT) : [];
  let countTai = 0, countXiu = 0;

  for (let i = 0; i < recent.length; i++) {
    const kq = normalizeResult(recent[i].ket_qua);
    if (kq === "Tài") countTai++;
    else if (kq === "Xỉu") countXiu++;
  }

  // Nếu không đủ dữ liệu, fallback bằng dự đoán ngẫu nhiên
  if (countTai + countXiu === 0) {
    const rand = Math.random() < 0.5 ? "Tài" : "Xỉu";
    return { duDoan: rand, doTinCay: randConfidence() };
  }

  // Anti-trend: nếu Tài áp đảo -> dự đoán Xỉu, và ngược lại
  let duDoan = countTai > countXiu ? "Xỉu" : "Tài";

  // Tăng/giảm độ tin cậy theo chênh lệch tỉ lệ
  const total = countTai + countXiu;
  const ratioDiff = Math.abs(countTai - countXiu) / total; // 0..1
  // Map ratioDiff (0..1) -> weight (0..(CONF_MAX-CONF_MIN))
  const dynamicPart = ratioDiff * (CONF_MAX - CONF_MIN);
  // Baseline random to avoid deterministic -> add small randomness
  const baseRandom = Math.random() * 5; // 0..5%
  let confValue = CONF_MIN + dynamicPart + baseRandom;
  if (confValue > CONF_MAX) confValue = CONF_MAX;
  if (confValue < CONF_MIN) confValue = CONF_MIN;
  const doTinCay = confValue.toFixed(1) + "%";

  return { duDoan, doTinCay };
}

// -------------------- MỚI: CẬP NHẬT ĐÚNG/SAI KHI CÓ KQ THỰC TẾ --------------------
function checkAndUpdateAccuracy(latest) {
  try {
    // latest: object phiên mới nhất (data[0])
    if (!latest || latest.phien === undefined) return;

    // Nếu không có dự đoán trước đó hoặc cache rỗng -> không làm gì
    if (!cacheDuDoan || !cacheDuDoan.phienDuDoan) return;

    const predictedPhien = String(cacheDuDoan.phienDuDoan);
    const latestPhien = String(latest.phien);

    // Khi phiên thực tế bằng phiên đã dự đoán trước đó -> đánh giá đúng/sai
    if (predictedPhien === latestPhien) {
      const actual = normalizeResult(latest.ket_qua);
      const predicted = cacheDuDoan.duDoan;

      if (actual === predicted) {
        thongKeNgay.dung = (thongKeNgay.dung || 0) + 1;
      } else {
        thongKeNgay.sai = (thongKeNgay.sai || 0) + 1;
      }

      // Sau khi update, clear cache để tránh cộng 2 lần
      cacheDuDoan.phienDuDoan = null;
      cacheDuDoan.duDoan = "Đang chờ";
      cacheDuDoan.doTinCay = "0.0%";
    }
  } catch (e) {
    // ignore errors nhẹ
    console.warn("checkAndUpdateAccuracy error:", e && e.message ? e.message : e);
  }
}

// -------------------- ENDPOINT: /api/lookup_predict --------------------
app.get("/api/lookup_predict", async (req, res) => {
  try {
    // Lấy lịch sử từ API gốc
    const response = await axios.get(HISTORY_API_URL, { timeout: 7000 });
    const data = Array.isArray(response.data) ? response.data : [response.data];
    // data[0] là phiên gần nhất (mới nhất)
    if (!data || data.length === 0) {
      // Không có dữ liệu lịch sử
      return res.json({
        id: "VIP_PRO_001",
        time_vn: getTimeVN(),
        error: "Không có dữ liệu lịch sử",
        thong_ke: thongKeNgay
      });
    }

    // Reset ngày nếu cần trước khi tính toán / cập nhật
    resetIfNewDayAndKeep();

    // MỚI: nếu phiên gần nhất đã là phiên mà ta từng dự đoán -> update đúng/sai
    checkAndUpdateAccuracy(data[0]);

    // Tính dự đoán từ RECENT_COUNT phiên  
    const { duDoan, doTinCay } = vipProPredict(data);  

    // Phiên dự đoán = phiên gần nhất + 1 (nếu có trường phien)  
    const phienGanNhat = (data[0] && data[0].phien !== undefined) ? String(data[0].phien) : "N/A";  
    const phienDuDoan = (phienGanNhat !== "N/A") ? String(parseInt(phienGanNhat) + 1) : "N/A";  

    // Nếu cache đã dự đoán cho cùng phiên -> trả cache (đảm bảo kết quả cố định trong 1 phiên)  
    if (cacheDuDoan.phienDuDoan === phienDuDoan && phienDuDoan !== "N/A") {  
      resetIfNewDayAndKeep();  
      return res.json({  
        id: "VIP_PRO_001",  
        time_vn: getTimeVN(),  
        phien_gan_nhat: phienGanNhat,  
        ket_qua_gan_nhat: normalizeResult(data[0].ket_qua),  
        phien_du_doan: cacheDuDoan.phienDuDoan,  
        du_doan: cacheDuDoan.duDoan,  
        do_tin_cay: cacheDuDoan.doTinCay,  
        thong_ke: thongKeNgay  
      });  
    }  

    // Cập nhật cache và thống kê  
    cacheDuDoan = {  
      phienDuDoan,  
      duDoan,  
      doTinCay  
    };  

    // Reset ngày nếu cần và tăng tổng dự đoán  
    resetIfNewDayAndKeep();  
    thongKeNgay.tong = (thongKeNgay.tong || 0) + 1;  

    // Trả về  
    return res.json({  
      id: "VIP_PRO_001",  
      time_vn: getTimeVN(),  
      phien_gan_nhat: phienGanNhat,  
      ket_qua_gan_nhat: normalizeResult(data[0].ket_qua),  
      phien_du_doan: phienDuDoan,  
      du_doan,  
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
  res.send("✅ VIP PRO API đang chạy. Endpoint: /api/lookup_predict  - Tiếng Việt");
});

// -------------------- RUN --------------------
app.listen(PORT, () => {
  console.log(`🚀 VIP PRO server chạy cổng ${PORT} - Time VN: ${getTimeVN()}`);
});
