// =====================================
// SUNWIN VIP SERVER + SMART PREDICT
// =====================================

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const NodeCache = require("node-cache");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SUNWIN_API_URL =
  process.env.SUNWIN_API_URL ||
  "https://lichsh.onrender.com/latest";

const cache = new NodeCache({ stdTTL: 5 });

// =====================================
// THUẬT TOÁN SMART PREDICT (FULL CODE CỦA BẠN)
// =====================================
function smartPredict(history) {
  const recent20 = history.slice(-20);
  const recent10 = history.slice(-10);
  const last = recent20[recent20.length - 1];
  const lastResult = last.ket_qua.toUpperCase();

  let taiSeq = 0,
    xiuSeq = 0;
  let maxTaiSeq = 0,
    maxXiuSeq = 0;
  let taiCount10 = 0,
    xiuCount10 = 0;

  // Đếm trong 20 phiên
  for (let i = 0; i < recent20.length; i++) {
    const k = recent20[i].ket_qua.toUpperCase();

    if (k === "TÀI") {
      taiSeq++;
      xiuSeq = 0;
    } else {
      xiuSeq++;
      taiSeq = 0;
    }

    maxTaiSeq = Math.max(maxTaiSeq, taiSeq);
    maxXiuSeq = Math.max(maxXiuSeq, xiuSeq);
  }

  // Đếm 10 phiên gần nhất
  recent10.forEach((i) => {
    if (i.ket_qua.toUpperCase() === "TÀI") taiCount10++;
    else xiuCount10++;
  });

  // Dice Bias
  const diceBiasTai = recent10.filter((o) => o.tong >= 12).length;
  const diceBiasXiu = recent10.filter((o) => o.tong <= 10).length;

  // Rolling trend (trung bình tổng của 10 phiên)
  const avg10 = recent10.reduce((s, o) => s + o.tong, 0) / 10;
  const rollingTai = avg10 >= 11 ? 1 : 0;
  const rollingXiu = avg10 <= 10 ? 1 : 0;

  // Score
  const scoreTai =
    maxXiuSeq * 4.5 +
    xiuCount10 * 1.5 +
    diceBiasTai * 3 +
    (lastResult === "XỈU" ? 5 : 0) +
    rollingTai * 4 +
    Math.random() * 2;

  const scoreXiu =
    maxTaiSeq * 4.5 +
    taiCount10 * 1.5 +
    diceBiasXiu * 3 +
    (lastResult === "TÀI" ? 5 : 0) +
    rollingXiu * 4 +
    Math.random() * 2;

  const du_doan = scoreTai > scoreXiu ? "Tài" : "Xỉu";
  const do_tin_cay = Math.min(
    95,
    Math.max(68, Math.abs(scoreTai - scoreXiu) * 4 + 60)
  );

  return {
    du_doan,
    do_tin_cay: do_tin_cay.toFixed(2) + "%",
    pattern: `Chuỗi Tài:${maxTaiSeq} | Chuỗi Xỉu:${maxXiuSeq}`,
    chi_tiet: {
      scoreTai,
      scoreXiu,
      dien_bien: {
        tai_trong_10: taiCount10,
        xiu_trong_10: xiuCount10,
        dice_bias_tai: diceBiasTai,
        dice_bias_xiu: diceBiasXiu,
        rolling_avg: avg10,
      },
    },
  };
}

// =====================================
// API CHÍNH
// =====================================
app.get("/api/taixiu", async (req, res) => {
  try {
    const cached = cache.get("history");
    if (cached) return res.json(cached);

    const response = await axios.get(SUNWIN_API_URL);
    const data = response.data;

    if (!data?.data || data.data.length === 0) {
      return res.json({ error: "Không lấy được dữ liệu API" });
    }

    const history = data.data;

    // Lấy phiên gần nhất
    const current = history[0];

    // Tính dự đoán bằng smartPredict
    const predict = smartPredict(history);

    // Xuất đúng FORM bạn yêu cầu
    const result = {
      id: "@Cskhtoolhehe",
      phien_truoc: {
        phien: current.phien,
        xuc_xac_1: current.x1,
        xuc_xac_2: current.x2,
        xuc_xac_3: current.x3,
        tong: current.tong,
        ket_qua: current.tong >= 11 ? "Tài" : "Xỉu",
      },
      phien_sau: {
        phien: current.phien + 1, // phiên sau b yêu cầu phải có
        du_doan: predict.du_doan,
        do_tin_cay: predict.do_tin_cay,
        pattern: predict.pattern,
        chi_tiet: predict.chi_tiet,
      },
    };

    cache.set("history", result);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.json({ error: "Lỗi API" });
  }
});

// =====================================
// START SERVER
// =====================================
app.listen(PORT, () =>
  console.log("SMART PREDICT SERVER đang chạy tại port", PORT)
);
