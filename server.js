const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const tf = require('@tensorflow/tfjs-node'); // TensorFlow.js cho Node
const app = express();
const PORT = process.env.PORT || 3000;

const HISTORY_API_URL = 'https://sunwinsaygex-8616.onrender.com/api/his';
const historicalDataCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// --------------------------
// Hàm dự đoán VIP tổng hợp
// --------------------------
async function predictTaiXiuVIP(history) {
    if (!history || history.length < 5) {
        return {
            du_doan: "Chờ thêm dữ liệu",
            do_tin_cay: 10,
            giai_thich: "Chưa đủ dữ liệu để dự đoán.",
            pattern: "Thiếu dữ liệu"
        };
    }

    const recentHistory = history.slice(-20);
    const lastResult = recentHistory[recentHistory.length - 1].ket_qua.toUpperCase();

    // ---------- Thuật toán 1: Tần suất + bẻ cầu ----------
    let taiCount = 0, xiuCount = 0;
    recentHistory.forEach(item => {
        if (item.ket_qua.toUpperCase() === 'TÀI') taiCount++;
        else xiuCount++;
    });

    let taiSeq = 0, xiuSeq = 0;
    for (let i = recentHistory.length - 1; i >= 0; i--) {
        if (recentHistory[i].ket_qua.toUpperCase() === 'TÀI') taiSeq++;
        else break;
    }
    for (let i = recentHistory.length - 1; i >= 0; i--) {
        if (recentHistory[i].ket_qua.toUpperCase() === 'XỈU') xiuSeq++;
        else break;
    }

    let du_doan = taiCount >= xiuCount ? 'TÀI' : 'XỈU';
    let do_tin_cay = Math.max(taiCount, xiuCount) / (taiCount + xiuCount) * 100;

    if (taiSeq >= 3) { du_doan = 'XỈU'; do_tin_cay = Math.min(99, do_tin_cay + 5); }
    else if (xiuSeq >= 3) { du_doan = 'TÀI'; do_tin_cay = Math.min(99, do_tin_cay + 5); }

    let giai_thich = `Dựa trên tần suất 20 phiên gần nhất: Tài=${taiCount}, Xỉu=${xiuCount}, phiên cuối=${lastResult}`;
    let pattern = "Tần suất + Bẻ cầu";

    // ---------- Thuật toán 2: Dense AI học chuỗi ----------
    try {
        const encoded = recentHistory.map(item => item.ket_qua.toUpperCase() === 'TÀI' ? 1 : 0);
        const X = [], Y = [];
        const seqLength = 5;

        for (let i = 0; i < encoded.length - seqLength; i++) {
            X.push(encoded.slice(i, i + seqLength));
            Y.push(encoded[i + seqLength]);
        }

        if (X.length > 0) {
            const xs = tf.tensor2d(X, [X.length, seqLength]);
            const ys = tf.tensor2d(Y, [Y.length, 1]);

            const model = tf.sequential();
            model.add(tf.layers.dense({ units: 10, inputShape: [seqLength], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
            model.compile({ loss: 'binaryCrossentropy', optimizer: 'adam' });

            await model.fit(xs, ys, { epochs: 20, verbose: 0 });

            const lastSeq = tf.tensor2d([encoded.slice(-seqLength)], [1, seqLength]);
            const aiPrediction = model.predict(lastSeq).dataSync()[0];
            const aiResult = aiPrediction > 0.5 ? 'TÀI' : 'XỈU';
            const aiConfidence = Math.round(Math.abs(aiPrediction - 0.5) * 200);

            if (aiConfidence > 60) {
                du_doan = aiResult;
                do_tin_cay = Math.min(99, do_tin_cay + aiConfidence / 2);
                giai_thich += ` | AI Dense dự đoán: ${aiResult} với độ tin cậy ${aiConfidence}%`;
                pattern += " + AI Dense";
            }
        }
    } catch (e) {
        console.log("Lỗi Dense AI:", e.message);
    }

    // ---------- Thuật toán 3: LSTM nâng cao ----------
    try {
        const lstmSeqLength = 10;
        if (history.length >= lstmSeqLength) {
            const lstmEncoded = history.slice(-100).map(item => item.ket_qua.toUpperCase() === 'TÀI' ? 1 : 0);
            const lstmX = [], lstmY = [];

            for (let i = 0; i < lstmEncoded.length - lstmSeqLength; i++) {
                lstmX.push(lstmEncoded.slice(i, i + lstmSeqLength));
                lstmY.push(lstmEncoded[i + lstmSeqLength]);
            }

            if (lstmX.length > 0) {
                const xs = tf.tensor3d(lstmX.map(seq => seq.map(v => [v])), [lstmX.length, lstmSeqLength, 1]);
                const ys = tf.tensor2d(lstmY, [lstmY.length, 1]);

                const lstmModel = tf.sequential();
                lstmModel.add(tf.layers.lstm({ units: 20, inputShape: [lstmSeqLength, 1] }));
                lstmModel.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
                lstmModel.compile({ loss: 'binaryCrossentropy', optimizer: 'adam' });

                await lstmModel.fit(xs, ys, { epochs: 15, verbose: 0 });

                const lastSeq = tf.tensor3d([lstmEncoded.slice(-lstmSeqLength).map(v => [v])], [1, lstmSeqLength, 1]);
                const lstmPred = lstmModel.predict(lastSeq).dataSync()[0];
                const lstmResult = lstmPred > 0.5 ? 'TÀI' : 'XỈU';
                const lstmConf = Math.round(Math.abs(lstmPred - 0.5) * 200);

                if (lstmConf > 50) {
                    du_doan = lstmResult;
                    do_tin_cay = Math.min(99, do_tin_cay + lstmConf / 2);
                    giai_thich += ` | AI LSTM dự đoán: ${lstmResult} với độ tin cậy ${lstmConf}%`;
                    pattern += " + AI LSTM";
                }
            }
        }
    } catch (e) {
        console.log("Lỗi LSTM AI:", e.message);
    }

    return { du_doan, do_tin_cay: Math.round(do_tin_cay * 100) / 100, giai_thich, pattern };
}

// --------------------------
// Endpoint API
// --------------------------
app.get('/api/taixiu', async (req, res) => {
    try {
        const response = await axios.get(HISTORY_API_URL);
        let historyData = response.data;

        const prediction = await predictTaiXiuVIP(historyData);

        const lastItem = historyData[historyData.length - 1];
        const result = {
            id: "@Cskhtool0100000",
            phien_truoc: lastItem.phien,
            xuc_xac: [lastItem.xuc_xac_1, lastItem.xuc_xac_2, lastItem.xuc_xac_3],
            tong_xuc_xac: lastItem.tong,
            ket_qua: lastItem.ket_qua,
            phien_sau: lastItem.phien + 1,
            du_doan: prediction.du_doan,
            do_tin_cay: prediction.do_tin_cay,
            giai_thich: prediction.giai_thich,
            pattern: prediction.pattern
        };

        res.json(result);
    } catch (error) {
        console.error("Lỗi:", error.message);
        res.status(500).json({
            id: "@Cskhtool0100000",
            error: "Không thể lấy dữ liệu hoặc dự đoán.",
            du_doan: "Không thể dự đoán",
            do_tin_cay: 0,
            giai_thich: "Lỗi hệ thống hoặc không đủ dữ liệu.",
            pattern: "Lỗi"
        });
    }
});

// Default endpoint
app.get('/', (req, res) => {
    res.send('API dự đoán Tài Xỉu VIP Siêu nâng cấp. /api/taixiu/du_doan_vip');
});

app.listen(PORT, () => {
    console.log(`Server chạy trên cổng ${PORT}`);
});
