// USIサーバー - Node.js版
// 将棋エンジンとHTTP APIの橋渡しを行う

const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = 8080;

// CORSを有効化
app.use(cors());
app.use(express.json());

// USIエンジンのプロセス管理
let engineProcess = null;
let engineReady = false;
let engineName = '';
let engineAuthor = '';
let pendingCommands = [];
let currentPosition = null;
let currentMoves = [];

/**
 * USIエンジンを起動
 */
function startEngine(enginePath = 'engine.exe') {
    if (engineProcess) {
        console.log('エンジンは既に起動しています');
        return;
    }

    console.log(`エンジンを起動: ${enginePath}`);
    engineProcess = spawn(enginePath, [], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';

    engineProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
                handleEngineResponse(trimmed);
            }
        });
    });

    engineProcess.stderr.on('data', (data) => {
        console.error(`エンジンエラー: ${data.toString()}`);
    });

    engineProcess.on('exit', (code) => {
        console.log(`エンジンが終了しました: コード ${code}`);
        engineProcess = null;
        engineReady = false;
    });

    engineProcess.on('error', (error) => {
        console.error(`エンジン起動エラー: ${error.message}`);
        engineProcess = null;
        engineReady = false;
    });
}

/**
 * エンジンにコマンドを送信
 */
function sendCommand(command) {
    if (!engineProcess) {
        console.error('エンジンが起動していません');
        return;
    }

    console.log(`→ エンジン: ${command}`);
    engineProcess.stdin.write(command + '\n');
}

/**
 * エンジンからの応答を処理
 */
function handleEngineResponse(response) {
    console.log(`← エンジン: ${response}`);

    if (response.startsWith('id name ')) {
        engineName = response.substring(8);
    } else if (response.startsWith('id author ')) {
        engineAuthor = response.substring(10);
    } else if (response === 'usiok') {
        engineReady = true;
        if (pendingCommands.length > 0) {
            const command = pendingCommands.shift();
            sendCommand(command);
        }
    } else if (response.startsWith('bestmove ')) {
        const bestmove = response.substring(9).split(' ')[0];
        if (currentBestMoveCallback) {
            currentBestMoveCallback(bestmove);
            currentBestMoveCallback = null;
        }
    }
}

let currentBestMoveCallback = null;

/**
 * 接続エンドポイント
 */
app.post('/usi/connect', (req, res) => {
    const enginePath = req.body.enginePath || 'engine.exe';
    
    if (!engineProcess) {
        startEngine(enginePath);
    }

    res.json({
        connected: true,
        message: 'USIサーバーに接続しました'
    });
});

/**
 * USI初期化エンドポイント
 */
app.post('/usi/usi', (req, res) => {
    if (!engineProcess) {
        return res.status(500).json({
            error: 'エンジンが起動していません'
        });
    }

    if (engineReady) {
        return res.json({
            ready: true,
            name: engineName,
            author: engineAuthor
        });
    }

    // USIコマンドを送信
    sendCommand('usi');
    
    // エンジンが準備完了するまで待機（簡易版）
    const checkReady = setInterval(() => {
        if (engineReady) {
            clearInterval(checkReady);
            res.json({
                ready: true,
                name: engineName,
                author: engineAuthor
            });
        }
    }, 100);

    // タイムアウト（5秒）
    setTimeout(() => {
        clearInterval(checkReady);
        if (!engineReady) {
            res.status(500).json({
                error: 'エンジンの初期化がタイムアウトしました'
            });
        }
    }, 5000);
});

/**
 * 局面設定エンドポイント
 */
app.post('/usi/position', (req, res) => {
    if (!engineProcess || !engineReady) {
        return res.status(500).json({
            error: 'エンジンが準備できていません'
        });
    }

    const { sfen, moves } = req.body;
    currentPosition = sfen;
    currentMoves = moves || [];

    // positionコマンドを構築
    let command = `position sfen ${sfen}`;
    if (currentMoves.length > 0) {
        command += ' moves ' + currentMoves.join(' ');
    }

    sendCommand(command);

    res.json({
        success: true,
        message: '局面を設定しました'
    });
});

/**
 * 思考開始エンドポイント
 */
app.post('/usi/go', (req, res) => {
    if (!engineProcess || !engineReady) {
        return res.status(500).json({
            error: 'エンジンが準備できていません'
        });
    }

    const { timeLimit = 5000 } = req.body;

    // goコマンドを送信
    // 時間制限を設定（ミリ秒を秒に変換）
    const byoyomi = Math.max(1, Math.floor(timeLimit / 1000));
    sendCommand(`go byoyomi ${byoyomi}`);

    // 最善手を待機
    currentBestMoveCallback = (bestmove) => {
        res.json({
            bestmove: bestmove,
            position: currentPosition
        });
    };

    // タイムアウト処理
    setTimeout(() => {
        if (currentBestMoveCallback) {
            currentBestMoveCallback = null;
            res.status(500).json({
                error: '思考がタイムアウトしました'
            });
        }
    }, timeLimit + 1000);
});

/**
 * 切断エンドポイント
 */
app.post('/usi/quit', (req, res) => {
    if (engineProcess) {
        sendCommand('quit');
        setTimeout(() => {
            if (engineProcess) {
                engineProcess.kill();
                engineProcess = null;
            }
        }, 1000);
    }

    engineReady = false;
    currentBestMoveCallback = null;

    res.json({
        success: true,
        message: '接続を切断しました'
    });
});

/**
 * ヘルスチェックエンドポイント
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        engineRunning: engineProcess !== null,
        engineReady: engineReady,
        engineName: engineName
    });
});

// サーバーを起動
app.listen(PORT, () => {
    console.log(`USIサーバーが起動しました: http://localhost:${PORT}`);
    console.log('エンジンパスを環境変数 ENGINE_PATH で指定できます');
    console.log('例: ENGINE_PATH=./engine.exe node server.js');
});

// プロセス終了時のクリーンアップ
process.on('SIGINT', () => {
    console.log('\nサーバーを終了します...');
    if (engineProcess) {
        sendCommand('quit');
        setTimeout(() => {
            if (engineProcess) {
                engineProcess.kill();
            }
            process.exit(0);
        }, 1000);
    } else {
        process.exit(0);
    }
});



