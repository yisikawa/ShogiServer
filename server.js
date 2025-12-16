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
let currentGoRequest = null; // 現在のgoリクエスト情報

/**
 * USIエンジンを起動
 */
function startEngine(enginePath = 'engine.exe') {
    if (engineProcess) {
        console.log('エンジンは既に起動しています');
        return;
    }

    // パスを正規化（相対パスを絶対パスに変換）
    const path = require('path');
    const fs = require('fs');
    
    let normalizedPath = enginePath;
    if (!path.isAbsolute(enginePath)) {
        // 相対パスの場合、現在の作業ディレクトリからの相対パスに変換
        normalizedPath = path.resolve(process.cwd(), enginePath);
    }
    
    // パスの正規化（バックスラッシュを統一）
    normalizedPath = path.normalize(normalizedPath);
    
    // ファイルの存在確認
    if (!fs.existsSync(normalizedPath)) {
        console.error(`エラー: エンジンファイルが見つかりません: ${normalizedPath}`);
        return;
    }
    
    // エンジンのディレクトリを取得（DLLの読み込み用）
    const engineDir = path.dirname(normalizedPath);
    const engineFile = path.basename(normalizedPath);

    console.log(`エンジンを起動: ${normalizedPath}`);
    console.log(`作業ディレクトリ: ${engineDir}`);
    
    try {
        engineProcess = spawn(normalizedPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: engineDir, // エンジンのディレクトリを作業ディレクトリに設定
            shell: false
        });
    } catch (error) {
        console.error(`エンジン起動エラー: ${error.message}`);
        engineProcess = null;
        engineReady = false;
        return;
    }

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
        const errorMsg = data.toString();
        console.error(`エンジンエラー: ${errorMsg}`);
        // DLLエラーなどの重要なエラーメッセージを検出
        if (errorMsg.includes('DLL') || errorMsg.includes('dll') || 
            errorMsg.includes('not found') || errorMsg.includes('見つかりません')) {
            console.error('⚠ DLLまたは依存ファイルが見つかりません。');
            console.error('   エンジンのディレクトリに必要なDLLが存在するか確認してください。');
        }
    });

    engineProcess.on('exit', (code) => {
        console.log(`エンジンが終了しました: コード ${code}`);
        if (code !== 0 && code !== null) {
            console.error(`エンジンが異常終了しました。エラーコード: ${code}`);
            const errorCodeHex = '0x' + Math.abs(code).toString(16).toUpperCase();
            console.error(`エラーコード（16進数）: ${errorCodeHex}`);
            
            // エラーコードの解釈
            if (code === 3221225477 || code === -1073741819) {
                console.error('エラー: アクセス違反 (Access Violation)');
                console.error('考えられる原因:');
                console.error('  - メモリ不足');
                console.error('  - エンジンの内部バグ');
                console.error('  - 不正なメモリアクセス');
            } else {
                console.error('考えられる原因:');
                console.error('  - 必要なDLLファイルが不足している');
                console.error('  - メモリ不足');
                console.error('  - エンジンの内部エラー');
            }
            
            // 思考中のリクエストがある場合、エラーレスポンスを返す
            if (currentGoRequest && !currentGoRequest.responseSent) {
                currentGoRequest.responseSent = true;
                currentGoRequest.res.status(500).json({
                    error: 'エンジンが思考中にクラッシュしました',
                    errorCode: code,
                    errorCodeHex: errorCodeHex
                });
            }
        }
        engineProcess = null;
        engineReady = false;
        // コールバックをクリア（エラーを防ぐため）
        if (currentBestMoveCallback) {
            currentBestMoveCallback = null;
        }
        currentGoRequest = null;
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
        if (currentBestMoveCallback && engineProcess) {
            // エンジンがまだ実行中の場合のみコールバックを実行
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
    const enginePath = req.body.enginePath || process.env.ENGINE_PATH || 'engine.exe';
    
    if (!engineProcess) {
        console.log(`エンジン接続リクエスト: ${enginePath}`);
        startEngine(enginePath);
        
        // エンジン起動の結果を少し待ってから返す
        setTimeout(() => {
            if (engineProcess) {
                res.json({
                    connected: true,
                    message: 'USIサーバーに接続しました',
                    enginePath: enginePath,
                    engineRunning: engineProcess !== null
                });
            } else {
                res.status(500).json({
                    connected: false,
                    error: 'エンジンの起動に失敗しました',
                    enginePath: enginePath
                });
            }
        }, 500);
    } else {
        res.json({
            connected: true,
            message: 'エンジンは既に起動しています',
            engineRunning: true
        });
    }
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

    // レスポンスが既に送信されたかチェックするフラグ
    let responseSent = false;

    // USIコマンドを送信
    sendCommand('usi');
    
    // エンジンが準備完了するまで待機（簡易版）
    const checkReady = setInterval(() => {
        if (responseSent) {
            clearInterval(checkReady);
            return;
        }
        
        if (engineReady) {
            clearInterval(checkReady);
            responseSent = true;
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
        if (!responseSent && !engineReady) {
            responseSent = true;
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

    // レスポンスが既に送信されたかチェックするフラグ
    let responseSent = false;

    // 現在のリクエスト情報を保存（エンジン終了時のエラーハンドリング用）
    currentGoRequest = {
        res: res,
        responseSent: false,
        timeoutId: null
    };

    // goコマンドを送信
    // 時間制限を設定（ミリ秒を秒に変換）
    const byoyomi = Math.max(1, Math.floor(timeLimit / 1000));
    sendCommand(`go byoyomi ${byoyomi}`);

    // 最善手を待機
    currentBestMoveCallback = (bestmove) => {
        if (!responseSent && engineProcess && currentGoRequest) {
            responseSent = true;
            currentGoRequest.responseSent = true;
            if (currentGoRequest.timeoutId) {
                clearTimeout(currentGoRequest.timeoutId);
            }
            currentBestMoveCallback = null;
            currentGoRequest = null;
            res.json({
                bestmove: bestmove,
                position: currentPosition
            });
        }
    };

    // タイムアウト処理
    currentGoRequest.timeoutId = setTimeout(() => {
        if (!responseSent && currentGoRequest) {
            responseSent = true;
            currentGoRequest.responseSent = true;
            currentBestMoveCallback = null;
            // エンジンが終了しているかチェック
            if (!engineProcess) {
                res.status(500).json({
                    error: 'エンジンが終了しました'
                });
            } else {
                res.status(500).json({
                    error: '思考がタイムアウトしました'
                });
            }
            currentGoRequest = null;
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
    currentGoRequest = null;

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
    
    // 環境変数でエンジンパスが指定されている場合、自動的に接続を試みる
    const defaultEnginePath = process.env.ENGINE_PATH;
    if (defaultEnginePath) {
        console.log(`環境変数 ENGINE_PATH が設定されています: ${defaultEnginePath}`);
        console.log('エンジンを自動接続します...');
        setTimeout(() => {
            if (!engineProcess) {
                startEngine(defaultEnginePath);
            }
        }, 1000);
    } else {
        console.log('\nエンジンを接続するには、以下のAPIを呼び出してください:');
        console.log('POST http://localhost:8080/usi/connect');
        console.log('Body: { "enginePath": "./dlshogi-dr2_exhi/dlshogi_tensorrt.exe" }');
        console.log('\nまたは、環境変数 ENGINE_PATH を設定してサーバーを再起動してください。');
    }
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



