// ==========================
//  SUNWIN VIP PREDICT SERVER (1 phiên)
// ==========================

const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");
const cors = require("cors");

const app = express();
const cache = new NodeCache({ stdTTL: 5 });
app.use(cors());

const HISTORY_API = process.env.HISTORY || "https://lichsh.onrender.com/latest";

// ==========================
// Chuẩn hóa dữ liệu API
// ==========================
function normalizeData(item) {
    return {
        phien: item.phien || item.Phien || 0,
        xuc_xac_1: item.xuc_xac_1 || item.Xuc_xac_1 || 0,
        xuc_xac_2: item.xuc_xac_2 || item.Xuc_xac_2 || 0,
        xuc_xac_3: item.xuc_xac_3 || item.Xuc_xac_3 || 0,
        tong: item.tong || item.Tong || 0,
        ket_qua: item.ket_qua || item.Ket_qua || "Không rõ"
    };
}

// ==========================
// Thuật toán SIÊU VIP (1 phiên)
// ==========================
function smartPredict(history) {
    const last = history[history.length - 1];
    const lastResult = last.ket_qua.toUpperCase();
    const tong = last.tong;

    // Giả lập max chuỗi như dùng 20 phiên
    const maxTaiSeq = lastResult === "TÀI" ? Math.floor(Math.random() * 3 + 2) : Math.floor(Math.random() * 2);
    const maxXiuSeq = lastResult === "XỈU" ? Math.floor(Math.random() * 3 + 2) : Math.floor(Math.random() * 2);

    // Giả lập 10 phiên gần nhất
    const taiCount10 = lastResult === "TÀI" ? Math.floor(Math.random() * 6 + 3) : Math.floor(Math.random() * 4);
    const xiuCount10 = lastResult === "XỈU" ? Math.floor(Math.random() * 6 + 3) : Math.floor(Math.random() * 4);

    // Dice bias
    const diceBiasTai = tong >= 11 ? 1 : 0;
    const diceBiasXiu = tong <= 10 ? 1 : 0;

    // Rolling avg
    const avg10 = tong; // dùng luôn tong của phiên này
    const rollingTai = avg10 >= 11 ? 1 : 0;
    const rollingXiu = avg10 <= 10 ? 1 : 0;

    // Score
    const scoreTai =
        maxXiuSeq * 4.5 +
        xiuCount10 * 1.5 +
        diceBiasTai * 3 +
        (lastResult === "XỈU" ? 5 : 0) +
        rollingTai * 4 +
        (Math.random() * 2);

    const scoreXiu =
        maxTaiSeq * 4.5 +
        taiCount10 * 1.5 +
        diceBiasXiu * 3 +
        (lastResult === "TÀI" ? 5 : 0) +
        rollingXiu * 4 +
        (Math.random() * 2);

    const du_doan = scoreTai > scoreXiu ? "Tài" : "Xỉu";
    const do_tin_cay = Math.min(95, Math.max(68, Math.abs(scoreTai - scoreXiu) * 4 + 60));

    return {
        du_doan,
        do_tin_cay: do_tin_cay.toFixed(2) + "%",
        pattern: `Chuỗi Tài:${maxTaiSeq} | Chuỗi Xỉu:${maxXiuSeq} (giả lập 1 phiên)`,
        chi_tiet: {
            scoreTai,
            scoreXiu,
            dien_bien: {
                tai_trong_10: taiCount10,
                xiu_trong_10: xiuCount10,
                dice_bias_tai: diceBiasTai,
                dice_bias_xiu: diceBiasXiu,
                rolling_avg: avg10
            }
        }
    };
}

// ==========================
// API chính: /api/taixiu
// ==========================
app.get("/api/taixiu", async (req, res) => {
    try {
        // cache 5 giây
        const cached = cache.get("result");
        if (cached) return res.json(cached);

        const response = await axios.get(HISTORY_API);
        if (!response.data) return res.json({ error: "Không lấy được dữ liệu API" });

        const raw = response.data;
        const history = Array.isArray(raw) ? raw.map(normalizeData) : [normalizeData(raw)];

        if (history.length < 1) return res.json({ error: "Dữ liệu quá ít" });

        const phienTruoc = history[history.length - 1];
        const predict = smartPredict(history);
        const phienSauNumber = phienTruoc.phien + 1;

        const result = {
            id: "@Cskhtool0100000",
            phien_truoc: phienTruoc,
            phien_sau: { phien: phienSauNumber, ...predict }
        };

        cache.set("result", result);
        return res.json(result);

    } catch (err) {
        console.error("Lỗi:", err.message);
        return res.json({ error: "Không lấy được dữ liệu API" });
    }
});

// ==========================
// PORT
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server chạy cổng:", PORT));
