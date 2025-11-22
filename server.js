const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const app = express();
const PORT = process.env.PORT || 3000;

// Cache lịch sử
const historicalDataCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const SUNWIN_API_URL = 'https://lichsusunw-tztq.onrender.com/latest';

// Hàm dự đoán VIP dựa trên 20 phiên gần nhất
function predictTaiXiu(history) {
    if (!history || history.length === 0) {
        return {
            du_doan: "Chờ thêm dữ liệu",
            do_tin_cay: 10,
            giai_thich: "Chưa có dữ liệu để phân tích.",
            pattern: "Thiếu dữ liệu"
        };
    }

    const recent = history.slice(-20); // Lấy 20 phiên gần nhất
    const last = recent[recent.length - 1];
    const lastResult = last.ket_qua.toUpperCase();
    let taiCount = 0, xiuCount = 0;
    let taiSeq = 0, xiuSeq = 0;
    let maxTaiSeq = 0, maxXiuSeq = 0;

    for (let i = 0; i < recent.length; i++) {
        const r = recent[i].ket_qua.toUpperCase();
        if (r === 'TÀI') {
            taiCount++; taiSeq++; xiuSeq = 0;
        } else {
            xiuCount++; xiuSeq++; taiSeq = 0;
        }
        maxTaiSeq = Math.max(maxTaiSeq, taiSeq);
        maxXiuSeq = Math.max(maxXiuSeq, xiuSeq);
    }

    // Chuỗi cuối cùng
    taiSeq = 0; xiuSeq = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
        const r = recent[i].ket_qua.toUpperCase();
        if (r === lastResult) {
            if (r === 'TÀI') taiSeq++; else xiuSeq++;
        } else break;
    }

    let du_doan = "Xỉu", do_tin_cay = 55, giai_thich = "Đang phân tích mẫu hình...", pattern = "Chưa rõ";

    // --- Thuật toán VIP ---
    // 1. Cầu bệt
    if (taiSeq >= 5) {
        du_doan = "Xỉu"; do_tin_cay = Math.min(95, 65 + taiSeq * 4);
        giai_thich = `Cầu bệt Tài dài ${taiSeq} phiên, khả năng cao bẻ cầu về Xỉu!`;
        pattern = `Cầu bệt Tài`;
    } else if (xiuSeq >= 5) {
        du_doan = "Tài"; do_tin_cay = Math.min(95, 65 + xiuSeq * 4);
        giai_thich = `Cầu bệt Xỉu dài ${xiuSeq} phiên, khả năng cao bẻ cầu về Tài!`;
        pattern = `Cầu bệt Xỉu`;
    }
    // 2. Cầu đảo 1-1-1
    else if (recent.length >= 6 &&
        recent[recent.length - 1].ket_qua !== recent[recent.length - 2].ket_qua &&
        recent[recent.length - 2].ket_qua !== recent[recent.length - 3].ket_qua &&
        recent[recent.length - 3].ket_qua !== recent[recent.length - 4].ket_qua
    ) {
        du_doan = (lastResult === 'TÀI') ? "Xỉu" : "Tài";
        do_tin_cay = 90;
        giai_thich = "Mẫu hình cầu đảo liên tục đang rõ nét.";
        pattern = "Cầu đảo 1-1-1-1";
    }
    // 3. Cầu 2-2
    else if (recent.length >= 4 &&
        recent[recent.length - 1].ket_qua === recent[recent.length - 2].ket_qua &&
        recent[recent.length - 3].ket_qua === recent[recent.length - 4].ket_qua &&
        recent[recent.length - 1].ket_qua !== recent[recent.length - 3].ket_qua
    ) {
        du_doan = (lastResult === 'TÀI') ? "Xỉu" : "Tài";
        do_tin_cay = 88;
        giai_thich = "Mẫu hình cầu 2-2 đang hình thành, tiếp tục dự đoán theo cầu.";
        pattern = "Cầu 2-2";
    }
    // 4. Tỷ lệ áp đảo
    else if (taiCount > xiuCount + 3) {
        du_doan = "Xỉu"; do_tin_cay = 70;
        giai_thich = `Tài áp đảo (${taiCount}T/${xiuCount}X), dự đoán cân bằng lại về Xỉu.`;
        pattern = "Tỷ lệ Tài cao";
    } else if (xiuCount > taiCount + 3) {
        du_doan = "Tài"; do_tin_cay = 70;
        giai_thich = `Xỉu áp đảo (${xiuCount}X/${taiCount}T), dự đoán cân bằng lại về Tài.`;
        pattern = "Tỷ lệ Xỉu cao";
    }
    // 5. Lắc / xen kẽ
    else if (maxTaiSeq <= 2 && maxXiuSeq <= 2) {
        du_doan = (lastResult === 'TÀI') ? "Xỉu" : "Tài";
        do_tin_cay = 60;
        giai_thich = "Thị trường lắc/xen kẽ, dự đoán bẻ cầu.";
        pattern = "Lắc/xen kẽ";
    }
    // 6. Mặc định
    else {
        du_doan = (lastResult === 'TÀI') ? "Xỉu" : "Tài";
        do_tin_cay = 55;
        giai_thich = "Không có mẫu hình rõ ràng, dự đoán theo phiên cuối.";
        pattern = "Cơ bản";
    }

    do_tin_cay = Math.max(50, Math.min(99.99, do_tin_cay));

    return { du_doan, do_tin_cay, giai_thich, pattern };
}

// Endpoint dự đoán VIP
app.get('/api/taixiu/du_doan_vip', async (req, res) => {
    let currentData = null;
    let historicalData = historicalDataCache.get("full_history") || [];

    try {
        const response = await axios.get(SUNWIN_API_URL);
        currentData = response.data;

        if (currentData && !historicalData.some(item => item.phien === currentData.phien)) {
            historicalData.push(currentData);
            if (historicalData.length > 100) historicalData = historicalData.slice(-100);
            historicalDataCache.set("full_history", historicalData);
            console.log(`Đã thêm phiên ${currentData.phien}. Tổng: ${historicalData.length}`);
        }

        const { du_doan, do_tin_cay, giai_thich, pattern } = predictTaiXiu(historicalData);

        const result = {
            id: "@Cskhtool0100000",
            phien_truoc: currentData ? {
                phien: currentData.phien,
                xuc_xac: [currentData.xuc_xac_1, currentData.xuc_xac_2, currentData.xuc_xac_3],
                tong: currentData.tong,
                ket_qua: currentData.ket_qua
            } : null,
            phien_sau: currentData ? {
                du_doan,
                do_tin_cay,
                giai_thich,
                pattern
            } : null
        };

        res.json(result);

    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu:", error.message);
        res.status(500).json({
            id: "@Cskhtool0100000",
            error: "Không thể lấy dữ liệu hoặc dự đoán.",
            du_doan: "Không thể dự đoán",
            do_tin_cay: 0,
            giai_thich: error.message,
            pattern: "Lỗi"
        });
    }
});

app.get('/', (req, res) => {
    res.send('API Dự đoán Tài Xỉu VIP. Truy cập /api/taixiu/du_doan_vip để xem dự đoán.');
});

app.listen(PORT, () => console.log(`Server chạy cổng ${PORT}`));
