const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 12345;

// Middleware
app.use(cors());
app.use(express.json());

// Khai báo API URL chính xác
const API_URL = 'https://suncoc.onrender.com/latest'; 

// =======================
// BOT AI PREDICTION SYSTEM
// =======================
class UltraDicePredictionSystem {
    constructor() {
        this.history = [];
        this.models = {};
        this.weights = {};
        this.performance = {};
        this.patternDatabase = {};
        this.advancedPatterns = {};

        this.sessionStats = {
            streaks: { T: 0, X: 0, maxT: 0, maxX: 0 },
            transitions: { TtoT: 0, TtoX: 0, XtoT: 0, XtoX: 0 },
            volatility: 0.5,
            patternConfidence: {},
            recentAccuracy: 0,
            bias: { T: 0, X: 0 }
        };

        this.marketState = {
            trend: 'neutral',
            momentum: 0,
            stability: 0.5,
            regime: 'normal'
        };

        this.adaptiveParameters = {
            patternMinLength: 3,
            patternMaxLength: 8,
            volatilityThreshold: 0.7,
            trendStrengthThreshold: 0.6,
            patternConfidenceDecay: 0.95,
            patternConfidenceGrowth: 1.05
        };

        this.previousTopModels = null;

        // INIT MODELS SAFELY
        this.initAllModels();
    }

    // ========================
    // INIT ALL MODELS (SAFE)
    // ========================
    initAllModels() {
        // Khởi tạo các mô hình chính (1-21) và các mô hình hỗ trợ
        for (let i = 1; i <= 21; i++) {
            const modelName = `model${i}`;
            
            // Chỉ bind các hàm đã được định nghĩa
            if (typeof this[modelName] === "function") {
                this.models[modelName] = this[modelName].bind(this);
            }
            if (typeof this[`${modelName}Mini`] === "function") {
                this.models[`${modelName}Mini`] = this[`${modelName}Mini`].bind(this);
            }
            if (typeof this[`${modelName}Support1`] === "function") {
                this.models[`${modelName}Support1`] = this[`${modelName}Support1`].bind(this);
            }
            if (typeof this[`${modelName}Support2`] === "function") {
                this.models[`${modelName}Support2`] = this[`${modelName}Support2`].bind(this);
            }
            
            // Default weights + performance cho mô hình chính
            this.weights[modelName] = 1;
            this.performance[modelName] = {
                correct: 0,
                total: 0,
                recentCorrect: 0,
                recentTotal: 0,
                streak: 0,
                maxStreak: 0
            };
        }

        this.initPatternDatabase();
        this.initAdvancedPatterns();
        this.initSupportModels();
    }

    // ========================
    // PATTERN DATABASE
    // ========================
    initPatternDatabase() {
        this.patternDatabase = {
            '1-1': { pattern: ['T', 'X', 'T', 'X'], probability: 0.7, strength: 0.8 },
            '1-2-1': { pattern: ['T', 'X', 'X', 'T'], probability: 0.65, strength: 0.75 },
            '2-1-2': { pattern: ['T', 'T', 'X', 'T', 'T'], probability: 0.68, strength: 0.78 },
            '3-1': { pattern: ['T', 'T', 'T', 'X'], probability: 0.72, strength: 0.82 },
            '1-3': { pattern: ['T', 'X', 'X', 'X'], probability: 0.72, strength: 0.82 },
            '2-2': { pattern: ['T', 'T', 'X', 'X'], probability: 0.66, strength: 0.76 },
            '2-3': { pattern: ['T', 'T', 'X', 'X', 'X'], probability: 0.71, strength: 0.81 },
            '3-2': { pattern: ['T', 'T', 'T', 'X', 'X'], probability: 0.73, strength: 0.83 },
            '4-1': { pattern: ['T', 'T', 'T', 'T', 'X'], probability: 0.76, strength: 0.86 },
            '1-4': { pattern: ['T', 'X', 'X', 'X', 'X'], probability: 0.76, strength: 0.86 },
        };
    }

    // ========================
    // ADVANCED PATTERNS
    // ========================
    initAdvancedPatterns() {
        this.advancedPatterns = {
            'dynamic-1': {
                detect: (data) => {
                    if (data.length < 6) return false;
                    const last6 = data.slice(-6);
                    return last6.filter(x => x === 'T').length === 4 &&
                           last6[last6.length - 1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.72,
                description: "4T trong 6 phiên, cuối là T -> dự đoán X"
            },

            'dynamic-2': {
                detect: (data) => {
                    if (data.length < 8) return false;
                    const last8 = data.slice(-8);
                    const tCount = last8.filter(x => x === 'T').length;
                    return tCount >= 6 && last8[last8.length - 1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.78,
                description: "6+T trong 8 phiên, cuối là T -> dự đoán X mạnh"
            },

            'alternating-3': {
                detect: (data) => {
                    if (data.length < 5) return false;
                    const last5 = data.slice(-5);
                    for (let i = 1; i < last5.length; i++) {
                        if (last5[i] === last5[i - 1]) return false;
                    }
                    return true;
                },
                predict: (data) => data[data.length - 1] === 'T' ? 'X' : 'T',
                confidence: 0.68,
                description: "5 phiên đan xen hoàn hảo -> đảo chiều"
            },

            'cyclic-7': {
                detect: (data) => {
                    if (data.length < 14) return false;
                    const firstHalf = data.slice(-14, -7);
                    const secondHalf = data.slice(-7);
                    return this.arraysEqual(firstHalf, secondHalf);
                },
                predict: (data) => data[data.length - 7],
                confidence: 0.75,
                description: "Chu kỳ 7 phiên lặp lại -> dự đoán theo chu kỳ"
            }
        };
    }

    // ========================
    // FIXED SUPPORT MODELS
    // ========================
    initSupportModels() {
        for (let i = 1; i <= 21; i++) {
            if (typeof this[`model${i}Support3`] === "function") {
                this.models[`model${i}Support3`] =
                    this[`model${i}Support3`].bind(this);
            }

            if (typeof this[`model${i}Support4`] === "function") {
                this.models[`model${i}Support4`] =
                    this[`model${i}Support4`].bind(this);
            }
        }
    }

    // ========================
    // UTILS
    // ========================
    arraysEqual(a, b) {
        return a.length === b.length && a.every((x, i) => x === b[i]);
    }

    addResult(result) {
        if (this.history.length > 0) {
            const lastResult = this.history[this.history.length-1];
            const transitionKey = `${lastResult}to${result}`;
            this.sessionStats.transitions[transitionKey] = (this.sessionStats.transitions[transitionKey] || 0) + 1;
            
            if (result === lastResult) {
                this.sessionStats.streaks[result]++;
                this.sessionStats.streaks[`max${result}`] = Math.max(
                    this.sessionStats.streaks[`max${result}`],
                    this.sessionStats.streaks[result]
                );
            } else {
                this.sessionStats.streaks[result] = 1;
                this.sessionStats.streaks[lastResult] = 0;
            }
        } else {
            this.sessionStats.streaks[result] = 1;
        }
        
        this.history.push(result);
        if (this.history.length > 200) {
            this.history.shift();
        }
        
        this.updateVolatility();
        this.updatePatternConfidence();
        this.updateMarketState();
        this.updatePatternDatabase();
    }

    updateVolatility() {
        if (this.history.length < 10) return;
        
        const recent = this.history.slice(-10);
        let changes = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] !== recent[i-1]) changes++;
        }
        
        this.sessionStats.volatility = changes / (recent.length - 1);
    }

    updatePatternConfidence() {
        for (const [patternName, confidence] of Object.entries(this.sessionStats.patternConfidence)) {
            if (this.history.length < 2) continue;
            
            const lastResult = this.history[this.history.length-1];
            
            if (this.advancedPatterns[patternName]) {
                const prediction = this.advancedPatterns[patternName].predict(this.history.slice(0, -1));
                if (prediction !== lastResult) {
                    this.sessionStats.patternConfidence[patternName] = Math.max(
                        0.1, 
                        confidence * this.adaptiveParameters.patternConfidenceDecay
                    );
                } else {
                    this.sessionStats.patternConfidence[patternName] = Math.min(
                        0.95, 
                        confidence * this.adaptiveParameters.patternConfidenceGrowth
                    );
                }
            }
        }
    }

    updateMarketState() {
        if (this.history.length < 15) return;
        
        const recent = this.history.slice(-15);
        const tCount = recent.filter(x => x === 'T').length;
        const xCount = recent.filter(x => x === 'X').length;
        
        const trendStrength = Math.abs(tCount - xCount) / recent.length;
        
        if (trendStrength > this.adaptiveParameters.trendStrengthThreshold) {
            this.marketState.trend = tCount > xCount ? 'up' : 'down';
        } else {
            this.marketState.trend = 'neutral';
        }
        
        let momentum = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] === recent[i-1]) {
                momentum += recent[i] === 'T' ? 0.1 : -0.1;
            }
        }
        this.marketState.momentum = Math.tanh(momentum);
        
        this.marketState.stability = 1 - this.sessionStats.volatility;
        
        if (this.sessionStats.volatility > this.adaptiveParameters.volatilityThreshold) {
            this.marketState.regime = 'volatile';
        } else if (trendStrength > 0.7) {
            this.marketState.regime = 'trending';
        } else if (trendStrength < 0.3) {
            this.marketState.regime = 'random';
        } else {
            this.marketState.regime = 'normal';
        }
    }

    updatePatternDatabase() {
        if (this.history.length < 10) return;
        
        for (let length = this.adaptiveParameters.patternMinLength; 
             length <= this.adaptiveParameters.patternMaxLength; length++) {
            for (let i = 0; i <= this.history.length - length; i++) {
                const segment = this.history.slice(i, i + length);
                const patternKey = segment.join('-');
                
                if (!this.patternDatabase[patternKey]) {
                    let count = 0;
                    for (let j = 0; j <= this.history.length - length - 1; j++) {
                        const testSegment = this.history.slice(j, j + length);
                        if (testSegment.join('-') === patternKey) {
                            count++;
                        }
                    }
                    
                    if (count > 2) {
                        const probability = count / (this.history.length - length);
                        const strength = Math.min(0.9, probability * 1.2);
                        
                        this.patternDatabase[patternKey] = {
                            pattern: segment,
                            probability: probability,
                            strength: strength
                        };
                    }
                }
            }
        }
    }

    // MODEL 1: Nhận biết các loại cầu cơ bản
    model1() {
        const recent = this.history.slice(-10);
        if (recent.length < 4) return null;
        
        const patterns = this.model1Mini(recent);
        if (patterns.length === 0) return null;
        
        const bestPattern = patterns.reduce((best, current) => 
            current.probability > best.probability ? current : best
        );
        
        let confidence = bestPattern.probability * 0.8;
        if (this.marketState.regime === 'trending') {
            confidence *= 1.1;
        } else if (this.marketState.regime === 'volatile') {
            confidence *= 0.9;
        }
        
        return {
            prediction: bestPattern.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Phát hiện pattern ${bestPattern.type} (xác suất ${bestPattern.probability.toFixed(2)})`
        };
    }

    model1Mini(data) {
        const patterns = [];
        
        for (const [type, patternData] of Object.entries(this.patternDatabase)) {
            const pattern = patternData.pattern;
            if (data.length < pattern.length) continue;
            
            const segment = data.slice(-pattern.length + 1);
            const patternWithoutLast = pattern.slice(0, -1);
            
            if (segment.join('-') === patternWithoutLast.join('-')) {
                patterns.push({
                    type: type,
                    prediction: pattern[pattern.length - 1],
                    probability: patternData.probability,
                    strength: patternData.strength
                });
            }
        }
        
        return patterns;
    }

    model1Support1() {
        return { 
            status: "Phân tích pattern nâng cao",
            totalPatterns: Object.keys(this.patternDatabase).length,
            recentPatterns: Object.keys(this.patternDatabase).length
        };
    }

    model1Support2() {
        const patternCount = Object.keys(this.patternDatabase).length;
        const avgConfidence = patternCount > 0 ? 
            Object.values(this.patternDatabase).reduce((sum, p) => sum + p.probability, 0) / patternCount : 0;
        
        return { 
            status: "Đánh giá độ tin cậy pattern",
            patternCount,
            averageConfidence: avgConfidence
        };
    }

    model1Support3() {
        const recentPerformance = this.calculatePatternPerformance();
        return {
            status: "Phân tích hiệu suất pattern",
            performance: recentPerformance
        };
    }

    model1Support4() {
        const optimalParams = this.optimizePatternParameters();
        return {
            status: "Tối ưu parameters pattern",
            parameters: optimalParams
        };
    }

    calculatePatternPerformance() {
        const performance = {};
        const recentHistory = this.history.slice(-50);
        
        for (const [pattern, data] of Object.entries(this.patternDatabase)) {
            let correct = 0;
            let total = 0;
            
            for (let i = data.pattern.length; i < recentHistory.length; i++) {
                const segment = recentHistory.slice(i - data.pattern.length + 1, i);
                if (segment.join('-') === data.pattern.slice(0, -1).join('-')) {
                    total++;
                    if (recentHistory[i] === data.pattern[data.pattern.length - 1]) {
                        correct++;
                    }
                }
            }
            
            performance[pattern] = {
                accuracy: total > 0 ? correct / total : 0,
                occurrences: total
            };
        }
        
        return performance;
    }

    optimizePatternParameters() {
        if (this.marketState.regime === 'volatile') {
            this.adaptiveParameters.patternMinLength = 4;
            this.adaptiveParameters.patternMaxLength = 6;
        } else if (this.marketState.regime === 'trending') {
            this.adaptiveParameters.patternMinLength = 3;
            this.adaptiveParameters.patternMaxLength = 5;
        } else {
            this.adaptiveParameters.patternMinLength = 3;
            this.adaptiveParameters.patternMaxLength = 8;
        }
        
        return { ...this.adaptiveParameters };
    }

    // MODEL 2: Bắt trend xu hướng ngắn và dài
    model2() {
        const shortTerm = this.history.slice(-5);
        const longTerm = this.history.slice(-20);
        
        if (shortTerm.length < 3 || longTerm.length < 10) return null;
        
        const shortAnalysis = this.model2Mini(shortTerm);
        const longAnalysis = this.model2Mini(longTerm);
        
        let prediction, confidence, reason;
        
        if (shortAnalysis.trend === longAnalysis.trend) {
            prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
            confidence = (shortAnalysis.strength + longAnalysis.strength) / 2;
            reason = `Xu hướng ngắn và dài hạn cùng ${shortAnalysis.trend}`;
        } else {
            if (shortAnalysis.strength > longAnalysis.strength * 1.5) {
                prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = shortAnalysis.strength;
                reason = `Xu hướng ngắn hạn mạnh hơn dài hạn`;
            } else {
                prediction = longAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = longAnalysis.strength;
                reason = `Xu hướng dài hạn ổn định hơn`;
            }
        }
        
        if (this.marketState.regime === 'trending') {
            confidence *= 1.15;
        } else if (this.marketState.regime === 'volatile') {
            confidence *= 0.85;
        }
        
        return { 
            prediction, 
            confidence: Math.min(0.95, confidence * 0.9), 
            reason 
        };
    }

    model2Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        
        let trend = tCount > xCount ? 'up' : (xCount > tCount ? 'down' : 'neutral');
        let strength = Math.abs(tCount - xCount) / data.length;
        
        let changes = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] !== data[i-1]) changes++;
        }
        
        const volatility = changes / (data.length - 1);
        strength = strength * (1 - volatility / 2);
        
        return { trend, strength, volatility };
    }

    model2Support1() {
        const quality = this.analyzeTrendQuality();
        return {
            status: "Phân tích chất lượng trend",
            quality
        };
    }

    model2Support2() {
        const reversalPoints = this.findPotentialReversals();
        return {
            status: "Xác định điểm đảo chiều",
            points: reversalPoints
        };
    }

    analyzeTrendQuality() {
        if (this.history.length < 20) return { quality: 'unknown', score: 0 };
        
        const trends = [];
        for (let i = 5; i <= 20; i += 5) {
            if (this.history.length >= i) {
                const analysis = this.model2Mini(this.history.slice(-i));
                trends.push(analysis);
            }
        }
        
        let consistent = true;
        for (let i = 1; i < trends.length; i++) {
            if (trends[i].trend !== trends[0].trend) {
                consistent = false;
                break;
            }
        }
        
        const avgStrength = trends.reduce((sum, t) => sum + t.strength, 0) / trends.length;
        const avgVolatility = trends.reduce((sum, t) => sum + t.volatility, 0) / trends.length;
        
        const qualityScore = avgStrength * (1 - avgVolatility);
        let quality;
        
        if (qualityScore > 0.7) quality = 'excellent';
        else if (qualityScore > 0.5) quality = 'good';
        else if (qualityScore > 0.3) quality = 'fair';
        else quality = 'poor';
        
        return { quality, score: qualityScore, consistent };
    }

    findPotentialReversals() {
        const points = [];
        if (this.history.length < 15) return points;
        
        for (let i = 10; i < this.history.length - 5; i++) {
            const before = this.history.slice(i - 5, i);
            const after = this.history.slice(i, i + 5);
            
            const beforeAnalysis = this.model2Mini(before);
            const afterAnalysis = this.model2Mini(after);
            
            if (beforeAnalysis.trend !== afterAnalysis.trend && 
                beforeAnalysis.strength > 0.6 && 
                afterAnalysis.strength > 0.6) {
                points.push({
                    position: i,
                    beforeTrend: beforeAnalysis.trend,
                    afterTrend: afterAnalysis.trend,
                    strength: (beforeAnalysis.strength + afterAnalysis.strength) / 2
                });
            }
        }
        
        return points;
    }

    // MODEL 3: Xem trong 12 phiên gần nhất có sự chênh lệch cao thì sẽ dự đoán bên còn lại
    model3() {
        const recent = this.history.slice(-12);
        if (recent.length < 12) return null;
        
        const analysis = this.model3Mini(recent);
        
        if (analysis.difference < 0.4) return null;
        
        let confidence = analysis.difference * 0.8;
        if (this.marketState.regime === 'random') {
            confidence *= 1.1;
        } else if (this.marketState.regime === 'trending') {
            confidence *= 0.9;
        }
        
        return {
            prediction: analysis.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Chênh lệch cao (${Math.round(analysis.difference * 100)}%) trong 12 phiên, dự đoán cân bằng`
        };
    }

    model3Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        const total = data.length;
        const difference = Math.abs(tCount - xCount) / total;
        
        return {
            difference,
            prediction: tCount > xCount ? 'X' : 'T',
            tCount,
            xCount
        };
    }

    model3Support1() {
        const effectiveness = this.analyzeMeanReversionEffectiveness();
        return {
            status: "Phân tích hiệu quả mean reversion",
            effectiveness
        };
    }

    model3Support2() {
        const optimalThreshold = this.findOptimalDifferenceThreshold();
        return {
            status: "Tìm ngưỡng chênh lệch tối ưu",
            threshold: optimalThreshold
        };
    }

    analyzeMeanReversionEffectiveness() {
        if (this.history.length < 30) return { effectiveness: 'unknown', successRate: 0 };
        
        let successes = 0;
        let opportunities = 0;
        
        for (let i = 12; i < this.history.length; i++) {
            const segment = this.history.slice(i - 12, i);
            const tCount = segment.filter(x => x === 'T').length;
            const xCount = segment.filter(x => x === 'X').length;
            const difference = Math.abs(tCount - xCount) / segment.length;
            
            if (difference >= 0.4) {
                opportunities++;
                const prediction = tCount > xCount ? 'X' : 'T';
                if (this.history[i] === prediction) {
                    successes++;
                }
            }
        }
        
        const successRate = opportunities > 0 ? successes / opportunities : 0;
        let effectiveness;
        
        if (successRate > 0.6) effectiveness = 'high';
        else if (successRate > 0.5) effectiveness = 'medium';
        else effectiveness = 'low';
        
        return { effectiveness, successRate, opportunities };
    }

    findOptimalDifferenceThreshold() {
        if (this.history.length < 50) return 0.4;
        
        let bestThreshold = 0.4;
        let bestSuccessRate = 0;
        
        for (let threshold = 0.3; threshold <= 0.6; threshold += 0.05) {
            let successes = 0;
            let opportunities = 0;
            
            for (let i = 12; i < this.history.length; i++) {
                const segment = this.history.slice(i - 12, i);
                const tCount = segment.filter(x => x === 'T').length;
                const xCount = segment.filter(x => x === 'X').length;
                const difference = Math.abs(tCount - xCount) / segment.length;
                
                if (difference >= threshold) {
                    opportunities++;
                    const prediction = tCount > xCount ? 'X' : 'T';
                    if (this.history[i] === prediction) {
                        successes++;
                    }
                }
            }
            
            const successRate = opportunities > 0 ? successes / opportunities : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestThreshold = threshold;
            }
        }
        
        return bestThreshold;
    }

    // MODEL 4: Bắt cầu ngắn hạn
    model4() {
        const recent = this.history.slice(-6);
        if (recent.length < 4) return null;
        
        const analysis = this.model4Mini(recent);
        
        if (analysis.confidence < 0.6) return null;
        
        let confidence = analysis.confidence;
        if (this.marketState.regime === 'trending') {
            confidence *= 1.1;
        } else if (this.marketState.regime === 'volatile') {
            confidence *= 0.9;
        }
        
        return {
            prediction: analysis.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Cầu ngắn hạn ${analysis.trend} với độ tin cậy ${analysis.confidence.toFixed(2)}`
        };
    }

    model4Mini(data) {
        const last3 = data.slice(-3);
        const tCount = last3.filter(x => x === 'T').length;
        const xCount = last3.filter(x => x === 'X').length;
        
        let prediction, confidence, trend;
        
        if (tCount === 3) {
            prediction = 'T';
            confidence = 0.7;
            trend = 'Tăng mạnh';
        } else if (xCount === 3) {
            prediction = 'X';
            confidence = 0.7;
            trend = 'Giảm mạnh';
        } else if (tCount === 2) {
            prediction = 'T';
            confidence = 0.65;
            trend = 'Tăng nhẹ';
        } else if (xCount === 2) {
            prediction = 'X';
            confidence = 0.65;
            trend = 'Giảm nhẹ';
        } else {
            const changes = data.slice(-4).filter((val, idx, arr) => 
                idx > 0 && val !== arr[idx-1]).length;
            
            if (changes >= 3) {
                prediction = data[data.length - 1] === 'T' ? 'X' : 'T';
                confidence = 0.6;
                trend = 'Đảo chiều';
            } else {
                prediction = data[data.length - 1];
                confidence = 0.55;
                trend = 'Ổn định';
            }
        }
        
        return { prediction, confidence, trend };
    }

    model4Support1() {
        const effectiveness = this.analyzeShortTermMomentumEffectiveness();
        return {
            status: "Phân tích hiệu quả momentum ngắn hạn",
            effectiveness
        };
    }

    model4Support2() {
        const optimalTimeframe = this.findOptimalMomentumTimeframe();
        return {
            status: "Tối ưu khung thời gian momentum",
            timeframe: optimalTimeframe
        };
    }

    analyzeShortTermMomentumEffectiveness() {
        if (this.history.length < 20) return { effectiveness: 'unknown', successRate: 0 };
        
        let successes = 0;
        let opportunities = 0;
        
        for (let i = 6; i < this.history.length; i++) {
            const segment = this.history.slice(i - 6, i);
            const analysis = this.model4Mini(segment);
            
            if (analysis.confidence >= 0.6) {
                opportunities++;
                if (this.history[i] === analysis.prediction) {
                    successes++;
                }
            }
        }
        
        const successRate = opportunities > 0 ? successes / opportunities : 0;
        let effectiveness;
        
        if (successRate > 0.6) effectiveness = 'high';
        else if (successRate > 0.5) effectiveness = 'medium';
        else effectiveness = 'low';
        
        return { effectiveness, successRate, opportunities };
    }

    findOptimalMomentumTimeframe() {
        if (this.history.length < 50) return 6;
        
        let bestTimeframe = 6;
        let bestSuccessRate = 0;
        
        for (let timeframe = 4; timeframe <= 8; timeframe++) {
            let successes = 0;
            let opportunities = 0;
            
            for (let i = timeframe; i < this.history.length; i++) {
                const segment = this.history.slice(i - timeframe, i);
                const analysis = this.model4Mini(segment);
                
                if (analysis.confidence >= 0.6) {
                    opportunities++;
                    if (this.history[i] === analysis.prediction) {
                        successes++;
                    }
                }
            }
            
            const successRate = opportunities > 0 ? successes / opportunities : 0;
            if (successRate > bestSuccessRate) {
                bestSuccessRate = successRate;
                bestTimeframe = timeframe;
            }
        }
        
        return bestTimeframe;
    }
    
    // Phương thức cốt lõi đã được SỬA LỖI ĐỆ QUY VÔ HẠN
    getAllPredictions() {
        const predictions = {};
        // LOẠI TRỪ model5 và model7 để phá vỡ chu trình gọi đệ quy
        const excludedModels = ['model5', 'model7']; 
        
        for (const modelName of Object.keys(this.models)) {
            // Chỉ xem xét các model chính (model1, model2,...) và không bị loại trừ
            if (modelName.match(/^model\d+$/) && !excludedModels.includes(modelName)) {
                const prediction = this.models[modelName]();
                if (prediction && prediction.prediction) {
                    predictions[modelName] = {
                        ...prediction,
                        modelName: modelName
                    };
                }
            }
        }
        return predictions;
    }

    // MODEL 5: Nếu tỉ lệ trọng số dự đoán tài /Xỉu chênh lệch cao thì cân bằng lại
    model5() {
        // Model 5 SẼ CHỈ gọi các model cơ sở (đã được lọc trong getAllPredictions)
        const predictions = this.getAllPredictions();
        const tPredictions = Object.values(predictions).filter(p => p && p.prediction === 'T').length;
        const xPredictions = Object.values(predictions).filter(p => p && p.prediction === 'X').length;
        const total = tPredictions + xPredictions;
        
        if (total < 5) return null;
        
        const difference = Math.abs(tPredictions - xPredictions) / total;
        
        if (difference > 0.6) {
            return {
                prediction: tPredictions > xPredictions ? 'X' : 'T',
                confidence: difference * 0.9,
                reason: `Cân bằng tỷ lệ chênh lệch cao (${Math.round(difference * 100)}%) giữa các model`
            };
        }
        
        return null;
    }

    model5Support1() {
        const consensus = this.analyzeModelConsensus();
        return {
            status: "Phân tích đồng thuận model",
            consensus
        };
    }

    model5Support2() {
        const divergence = this.analyzeModelDivergence();
        return {
            status: "Phân tích phân kỳ model",
            divergence
        };
    }

    analyzeModelConsensus() {
        // Tương tự, cần gọi getAllPredictions đã được sửa
        const predictions = this.getAllPredictions(); 
        const validPredictions = Object.values(predictions).filter(p => p && p.prediction);
        
        if (validPredictions.length === 0) return { consensus: 'none', rate: 0 };
        
        const tCount = validPredictions.filter(p => p.prediction === 'T').length;
        const xCount = validPredictions.filter(p => p.prediction === 'X').length;
        const total = validPredictions.length;
        
        const consensusRate = Math.max(tCount, xCount) / total;
        let consensus;
        
        if (consensusRate > 0.7) consensus = 'strong';
        else if (consensusRate > 0.6) consensus = 'moderate';
        else consensus = 'weak';
        
        return { consensus, rate: consensusRate, tCount, xCount };
    }

    analyzeModelDivergence() {
        // Tương tự, cần gọi getAllPredictions đã được sửa
        const predictions = this.getAllPredictions();
        const validPredictions = Object.values(predictions).filter(p => p && p.prediction);
        
        if (validPredictions.length < 2) return { divergence: 'low', score: 0 };
        
        let divergenceScore = 0;
        for (let i = 0; i < validPredictions.length; i++) {
            for (let j = i + 1; j < validPredictions.length; j++) {
                if (validPredictions[i].prediction !== validPredictions[j].prediction) {
                    divergenceScore += validPredictions[i].confidence * validPredictions[j].confidence;
                }
            }
        }
        
        const maxPossible = (validPredictions.length * (validPredictions.length - 1)) / 2;
        divergenceScore = divergenceScore / maxPossible;
        
        let divergence;
        if (divergenceScore > 0.7) divergence = 'high';
        else if (divergenceScore > 0.4) divergence = 'medium';
        else divergence = 'low';
        
        return { divergence, score: divergenceScore };
    }
    
    // MODEL 6: Biết lúc nào nên bắt theo cầu hay bẻ cầu
    model6() {
        const trendAnalysis = this.model2();
        if (!trendAnalysis) return null;
        
        const continuity = this.model6Mini(this.history.slice(-8));
        
        const breakProbability = typeof this.model10Mini === 'function' ? this.model10Mini(this.history) : 0.5;
        
        if (continuity.streak >= 5 && breakProbability > 0.7) {
            return {
                prediction: trendAnalysis.prediction === 'T' ? 'X' : 'T',
                confidence: breakProbability * 0.8,
                reason: `Cầu liên tục ${continuity.streak} lần, xác suất bẻ cầu ${breakProbability.toFixed(2)}`
            };
        }
        
        return {
            prediction: trendAnalysis.prediction,
            confidence: trendAnalysis.confidence * 0.9,
            reason: `Tiếp tục theo xu hướng, cầu chưa đủ mạnh để bẻ`
        };
    }

    model6Mini(data) {
        if (data.length < 2) return { streak: 0, direction: 'neutral', maxStreak: 0 };
        
        let currentStreak = 1;
        let maxStreak = 1;
        let direction = data[data.length - 1];
        
        for (let i = data.length - 1; i > 0; i--) {
            if (data[i] === data[i-1]) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                break;
            }
        }
        
        return { streak: currentStreak, direction, maxStreak };
    }

    model6Support1() {
        const effectiveness = this.analyzeBreakEffectiveness();
        return {
            status: "Phân tích hiệu quả bẻ cầu",
            effectiveness
        };
    }

    model6Support2() {
        const optimalConditions = this.findOptimalBreakConditions();
        return {
            status: "Xác định điều kiện bẻ cầu tối ưu",
            conditions: optimalConditions
        };
    }

    analyzeBreakEffectiveness() {
        if (this.history.length < 30) return { effectiveness: 'unknown', successRate: 0 };
        
        let successes = 0;
        let opportunities = 0;
        
        for (let i = 8; i < this.history.length; i++) {
            const segment = this.history.slice(i - 8, i);
            const continuity = this.model6Mini(segment);
            const breakProb = typeof this.model10Mini === 'function' ? this.model10Mini(this.history.slice(0, i)) : 0.5;
            
            if (continuity.streak >= 5 && breakProb > 0.7) {
                opportunities++;
                const trendAnalysis = this.model2Mini(segment);
                const prediction = trendAnalysis.trend === 'up' ? 'X' : 'T';
                
                if (this.history[i] === prediction) {
                    successes++;
                }
            }
        }
        
        const successRate = opportunities > 0 ? successes / opportunities : 0;
        let effectiveness;
        
        if (successRate > 0.6) effectiveness = 'high';
        else if (successRate > 0.5) effectiveness = 'medium';
        else effectiveness = 'low';
        
        return { effectiveness, successRate, opportunities };
    }

    findOptimalBreakConditions() {
        if (this.history.length < 50) return { minStreak: 5, minProbability: 0.7 };
        
        let bestMinStreak = 5;
        let bestMinProbability = 0.7;
        let bestSuccessRate = 0;
        
        for (let minStreak = 4; minStreak <= 7; minStreak++) {
            for (let minProb = 0.6; minProb <= 0.8; minProb += 0.05) {
                let successes = 0;
                let opportunities = 0;
                
                for (let i = 8; i < this.history.length; i++) {
                    const segment = this.history.slice(i - 8, i);
                    const continuity = this.model6Mini(segment);
                    const breakProb = typeof this.model10Mini === 'function' ? this.model10Mini(this.history.slice(0, i)) : 0.5;
                    
                    if (continuity.streak >= minStreak && breakProb >= minProb) {
                        opportunities++;
                        const trendAnalysis = this.model2Mini(segment);
                        const prediction = trendAnalysis.trend === 'up' ? 'X' : 'T';
                        
                        if (this.history[i] === prediction) {
                            successes++;
                        }
                    }
                }
                
                const successRate = opportunities > 0 ? successes / opportunities : 0;
                if (successRate > bestSuccessRate) {
                    bestSuccessRate = successRate;
                    bestMinStreak = minStreak;
                    bestMinProbability = minProb;
                }
            }
        }
        
        return { minStreak: bestMinStreak, minProbability: bestMinProbability, successRate: bestSuccessRate };
    }

    // MODEL 7: Cân bằng trọng số từng model khi chênh lệch quá cao
    model7() {
        const performanceStats = this.model13Mini();
        const imbalance = this.model7Mini(performanceStats);
        
        if (imbalance > 0.3) {
            this.adjustWeights(performanceStats);
            return {
                prediction: null,
                confidence: 0,
                reason: `Điều chỉnh trọng số do chênh lệch hiệu suất ${imbalance.toFixed(2)}`
            };
        }
        
        return null;
    }

    model7Mini(performanceStats) {
        const accuracies = Object.values(performanceStats).map(p => p.accuracy);
        if (accuracies.length < 2) return 0;
        
        const maxAccuracy = Math.max(...accuracies);
        const minAccuracy = Math.min(...accuracies);
        
        return (maxAccuracy - minAccuracy) / maxAccuracy;
    }

    adjustWeights(performanceStats) {
        const avgAccuracy = Object.values(performanceStats).reduce((sum, p) => sum + p.accuracy, 0) / Object.values(performanceStats).length;
        for (const [model, stats] of Object.entries(performanceStats)) {
            const deviation = stats.accuracy - avgAccuracy;
            // Trọng số điều chỉnh từ 0.1 đến 2.0
            this.weights[model] = Math.max(0.1, Math.min(2, 1 + deviation * 2));
        }
    }

    // ===============================================
    // PHƯƠNG THỨC HỖ TRỢ CẦN THIẾT
    // ===============================================

    // Cung cấp hiệu suất của tất cả các model (Được gọi bởi model7)
    model13Mini() {
        const stats = {};
        for (const model of Object.keys(this.performance)) {
            if (this.performance[model].total > 0) {
                stats[model] = { 
                    accuracy: this.performance[model].correct / this.performance[model].total,
                    recentAccuracy: this.performance[model].recentTotal > 0 ? this.performance[model].recentCorrect / this.performance[model].recentTotal : 0,
                    total: this.performance[model].total,
                    recentTotal: this.performance[model].recentTotal,
                    streak: this.performance[model].streak,
                    maxStreak: this.performance[model].maxStreak
                };
            } else {
                stats[model] = { accuracy: 0.5, recentAccuracy: 0.5, total: 0, recentTotal: 0, streak: 0, maxStreak: 0 };
            }
        }
        return stats;
    }

    // Cập nhật hiệu suất cho tất cả các model sau khi có kết quả mới
    updatePerformance(result) {
        for (const modelName of Object.keys(this.performance)) {
            if (modelName.match(/^model\d+$/)) {
                
                const prediction = this.models[modelName] ? this.models[modelName]() : null;

                if (prediction && prediction.prediction) {
                    this.performance[modelName].total++;
                    this.performance[modelName].recentTotal++;

                    if (prediction.prediction === result) {
                        this.performance[modelName].correct++;
                        this.performance[modelName].recentCorrect++;
                        this.performance[modelName].streak++;
                    } else {
                        this.performance[modelName].streak = 0;
                    }
                    this.performance[modelName].maxStreak = Math.max(
                        this.performance[modelName].maxStreak,
                        this.performance[modelName].streak
                    );
                }
            }
        }
    }

    // Tổng hợp kết quả cuối cùng từ tất cả các model
    getFinalPrediction() {
        // Chạy model 7 để điều chỉnh trọng số trước (Chỉ chạy một lần)
        this.model7();

        // Gọi getAllPredictions đã được sửa để lấy dự đoán cơ sở
        const predictions = this.getAllPredictions();
        let tScore = 0;
        let xScore = 0;
        let totalWeight = 0;

        for (const [modelName, prediction] of Object.entries(predictions)) {
            const weight = this.weights[modelName] || 1; 
            const confidence = prediction.confidence;

            if (prediction.prediction === 'T') {
                tScore += weight * confidence;
            } else if (prediction.prediction === 'X') {
                xScore += weight * confidence;
            }
            totalWeight += weight * confidence;
        }

        if (totalWeight === 0) {
             return { prediction: 'T', confidence: 0.5, reason: 'Không xác định: Không có model nào dự đoán' };
        }

        const finalPrediction = tScore > xScore ? 'T' : 'X';
        const finalConfidence = Math.max(tScore, xScore) / totalWeight;

        return {
            prediction: finalPrediction,
            confidence: finalConfidence,
            reason: `Kết quả tổng hợp (Tài: ${tScore.toFixed(2)}, Xỉu: ${xScore.toFixed(2)})`
        };
    }
}
// ----------------------------------------------------------------------
// Khởi tạo hệ thống dự đoán
const predictionSystem = new UltraDicePredictionSystem();


// Route lấy dự đoán cho phiên tiếp theo
app.get('/predict', async (req, res) => {
    try {
        // 1. Lấy dữ liệu phiên gần nhất từ API bên ngoài
        const response = await axios.get(API_URL);
        const data = response.data;
        
        // 2. Kiểm tra format dữ liệu
        if (!data || typeof data.Tong !== 'number' || typeof data.Ket_qua !== 'string') {
            throw new Error("Dữ liệu API không hợp lệ hoặc thiếu trường Tong/Ket_qua.");
        }
        
        // 3. Chuyển đổi kết quả thành định dạng T/X
        const result = data.Ket_qua === 'Tài' ? 'T' : (data.Ket_qua === 'Xỉu' ? 'X' : null);
        
        if (!result) {
            throw new Error(`Kết quả API không phải 'Tài' hoặc 'Xỉu': ${data.Ket_qua}`);
        }
        
        // 4. THỰC HIỆN DỰ ĐOÁN
        // Lưu ý: getFinalPrediction() sẽ gọi model7() (điều chỉnh trọng số) và getAllPredictions()
        const prediction = predictionSystem.getFinalPrediction();
        
        // 5. Thêm kết quả phiên VỪA KẾT THÚC vào lịch sử VÀ CẬP NHẬT TRẠNG THÁI
        predictionSystem.addResult(result);
        
        // 6. Cập nhật hiệu suất của các model dựa trên kết quả vừa rồi
        predictionSystem.updatePerformance(result);
        
        // 7. Chuẩn bị response
        const responseData = {
            phien: data.Phien + 1, // Phiên hiện tại + 1
            Xuc_xac_1: data.Xuc_xac_1,
            Xuc_xac_2: data.Xuc_xac_2,
            Xuc_xac_3: data.Xuc_xac_3,
            Tong: data.Tong,
            Ket_qua: data.Ket_qua,
            du_doan: prediction ? (prediction.prediction === 'T' ? 'Tài' : 'Xỉu') : 'Không xác định',
            do_tin_cay: prediction ? Math.round(prediction.confidence * 100) : 0,
            thong_tin_bo_sung: {
                sessionStats: predictionSystem.sessionStats,
                marketState: predictionSystem.marketState,
                ly_do_du_doan: prediction ? prediction.reason : 'Hệ thống chưa đủ dữ liệu để dự đoán',
            }
        };
        
        res.json(responseData);
    } catch (error) {
        // Xử lý lỗi chi tiết hơn
        let errorMessage = 'Lỗi xử lý nội bộ.';
        if (axios.isAxiosError(error)) {
            if (error.response) {
                errorMessage = `Lỗi từ API (HTTP Status: ${error.response.status}). Vui lòng kiểm tra API URL: ${API_URL}`;
                console.error('Lỗi API HTTP Status:', error.response.status, error.response.data);
            } else if (error.request) {
                errorMessage = `Lỗi kết nối mạng: Không thể truy cập ${API_URL}. Vui lòng kiểm tra trạng thái API.`;
                console.error('Lỗi kết nối mạng:', error.message);
            }
        } else {
             // Lỗi do code tự ném ra (ví dụ: Dữ liệu API không hợp lệ)
            errorMessage = `Lỗi xử lý dữ liệu: ${error.message}`;
            console.error('Lỗi không phải Axios:', error.message);
        }
        
        res.status(500).json({ error: errorMessage });
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server bot AI đang chạy trên cổng ${PORT}`);
});