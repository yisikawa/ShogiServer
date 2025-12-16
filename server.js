// USIサーバー - Node.js版
// 将棋エンジンとHTTP APIの橋渡しを行う

const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;

// CORSを有効化
app.use(cors());
app.use(express.json());

/**
 * エンジン状態管理クラス
 */
class EngineState {
    constructor() {
        this.process = null;
        this.ready = false;
        this.usiokReceived = false; // usiokを受信したか
        this.readyokReceived = false; // readyokを受信したか
        this.name = '';
        this.author = '';
        this.currentPosition = null;
        this.currentMoves = [];
        this.currentGoRequest = null;
        this.positionRequestPending = false;
        this.lastPositionCommand = null;
        this.positionRequestId = 0;
        this.bestMoveCallback = null;
    }

    reset() {
        this.process = null;
        this.ready = false;
        this.usiokReceived = false;
        this.readyokReceived = false;
        this.name = '';
        this.author = '';
        this.currentPosition = null;
        this.currentMoves = [];
        this.currentGoRequest = null;
        this.positionRequestPending = false;
        this.lastPositionCommand = null;
        this.bestMoveCallback = null;
    }
}

// エンジン状態の管理
const engineState = new EngineState();

/**
 * USIエンジンを起動
 */
function startEngine(enginePath = 'engine.exe') {
    if (engineState.process) {
        console.log('[USI Server] エンジンは既に起動しています');
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

    console.log(`[USI Server] エンジンを起動: ${normalizedPath}`);
    console.log(`[USI Server] 作業ディレクトリ: ${engineDir}`);
    
    try {
        engineState.process = spawn(normalizedPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: engineDir,
            shell: false
        });
    } catch (error) {
        console.error(`[USI Server] エンジン起動エラー: ${error.message}`);
        engineState.reset();
        return;
    }
    
    setupEngineEventHandlers();
}

/**
 * エンジンのイベントハンドラーを設定
 */
function setupEngineEventHandlers() {
    const proc = engineState.process;
    if (!proc) return;

    let buffer = '';

    proc.stdout.on('data', (data) => {
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

    proc.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        const timestamp = new Date().toISOString();
        console.error(`%c[USI Server ${timestamp}] エンジンstderr: ${errorMsg.trim()}`, 'color: #F44336; font-weight: bold');
        
        // DLLエラーなどの重要なエラーメッセージを検出
        if (errorMsg.includes('DLL') || errorMsg.includes('dll') || 
            errorMsg.includes('not found') || errorMsg.includes('見つかりません')) {
            console.error('[USI Server] ⚠ DLLまたは依存ファイルが見つかりません。');
            console.error('[USI Server]    エンジンのディレクトリに必要なDLLが存在するか確認してください。');
        }
        
        // SFEN解析エラーの検出
        if (errorMsg.includes('sfen') || errorMsg.includes('SFEN') || 
            errorMsg.includes('position') || errorMsg.includes('Position') ||
            errorMsg.includes('parse') || errorMsg.includes('Parse') ||
            errorMsg.includes('invalid') || errorMsg.includes('Invalid')) {
            console.error('[USI Server] ⚠ SFEN形式またはpositionコマンドの解析エラーの可能性があります');
            console.error('[USI Server]    エラーメッセージ:', errorMsg.trim());
        }
        
        // メモリエラーの検出
        if (errorMsg.includes('memory') || errorMsg.includes('Memory') ||
            errorMsg.includes('out of memory') || errorMsg.includes('Out of memory')) {
            console.error('[USI Server] ⚠ メモリ不足の可能性があります');
        }
    });

    proc.on('exit', (code) => {
        const timestamp = new Date().toISOString();
        console.log(`%c[USI Server ${timestamp}] エンジンが終了しました: コード ${code}`, 'color: #F44336; font-weight: bold');
        
        if (code !== 0 && code !== null) {
            console.error(`[USI Server] エンジンが異常終了しました。エラーコード: ${code}`);
            const errorCodeHex = '0x' + Math.abs(code).toString(16).toUpperCase();
            console.error(`[USI Server] エラーコード（16進数）: ${errorCodeHex}`);
            
            // エラーコードの解釈
            if (code === 3221225477 || code === -1073741819) {
                console.error('[USI Server] エラー: アクセス違反 (Access Violation)');
                console.error('[USI Server] 考えられる原因:');
                console.error('  - メモリ不足');
                console.error('  - エンジンの内部バグ');
                console.error('  - 不正なメモリアクセス');
            } else {
                console.error('[USI Server] 考えられる原因:');
                console.error('  - 必要なDLLファイルが不足している');
                console.error('  - メモリ不足');
                console.error('  - エンジンの内部エラー');
                console.error('  - SFEN形式の解析エラー');
                console.error('  - 不正なpositionコマンド');
            }
            
            // 思考中のリクエストがある場合、エラーレスポンスを返す
            if (engineState.currentGoRequest && !engineState.currentGoRequest.responseSent) {
                engineState.currentGoRequest.responseSent = true;
                engineState.currentGoRequest.res.status(500).json({
                    error: 'エンジンが思考中にクラッシュしました',
                    errorCode: code,
                    errorCodeHex: errorCodeHex
                });
                engineState.currentGoRequest = null;
            }
        } else {
            console.log(`[USI Server] エンジンが正常終了しました`);
        }
        
        engineState.reset();
    });

    proc.on('error', (error) => {
        console.error(`[USI Server] エンジン起動エラー: ${error.message}`, {
            code: error.code,
            errno: error.errno
        });
        engineState.reset();
    });

    // stdinのエラーハンドリング
    proc.stdin.on('error', (error) => {
        const timestamp = new Date().toISOString();
        console.error(`%c[USI Server ${timestamp}] エンジンstdinエラー: ${error.message}`, 'color: #F44336; font-weight: bold', {
            code: error.code,
            errno: error.errno
        });
        
        // EPIPEエラーの場合、エンジンプロセスが終了している可能性が高い
        if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
            console.error('[USI Server] エンジンへの接続が切断されました。エンジンが終了した可能性があります。');
            
            // エンジンプロセスの状態を確認
            if (proc && (proc.killed || proc.exitCode !== null)) {
                console.error('[USI Server] エンジンプロセスが既に終了しています');
            }
            
            // エンジン状態をクリア
            const wasAlive = !!proc;
            engineState.reset();
            
            // 思考中のリクエストがある場合、エラーレスポンスを返す
            if (engineState.currentGoRequest && !engineState.currentGoRequest.responseSent) {
                engineState.currentGoRequest.responseSent = true;
                engineState.currentGoRequest.res.status(500).json({
                    error: 'エンジンへの接続が切断されました。エンジンが終了した可能性があります。',
                    errorCode: error.code,
                    engineWasAlive: wasAlive,
                    possibleCause: 'positionコマンド送信後にエンジンがクラッシュした可能性があります'
                });
                engineState.currentGoRequest = null;
            }
        }
    });

    // stdinが閉じられたときの処理
    proc.stdin.on('close', () => {
        const timestamp = new Date().toISOString();
        console.warn(`%c[USI Server ${timestamp}] エンジンのstdinが閉じられました`, 'color: #FF9800; font-weight: bold');
        
        // エンジンプロセスの状態を確認
        if (proc && (proc.killed || proc.exitCode !== null)) {
            console.warn('[USI Server] エンジンプロセスが終了している可能性があります');
        }
    });
}

/**
 * エンジンの状態をチェック
 */
function isEngineAlive() {
    const proc = engineState.process;
    if (!proc) {
        return false;
    }
    
    // プロセスが終了しているかチェック
    if (proc.killed || proc.exitCode !== null) {
        return false;
    }
    
    // stdinが利用可能かチェック
    if (!proc.stdin || proc.stdin.destroyed || proc.stdin.writableEnded) {
        return false;
    }
    
    return true;
}

/**
 * エンジンにコマンドを送信
 */
function sendCommand(command) {
    if (!isEngineAlive()) {
        const proc = engineState.process;
        console.error('[USI Server] エンジンが起動していないか、既に終了しています', {
            engineProcess: !!proc,
            killed: proc?.killed,
            exitCode: proc?.exitCode,
            stdinDestroyed: proc?.stdin?.destroyed,
            stdinWritableEnded: proc?.stdin?.writableEnded
        });
        engineState.reset();
        return false;
    }

    try {
        const timestamp = new Date().toISOString();
        console.log(`%c[USI Server ${timestamp}] → エンジン: ${command}`, 'color: #4CAF50; font-weight: bold');

        const success = engineState.process.stdin.write(command + '\n');
        
        if (!success) {
            // バッファが満杯の場合、drainイベントを待つ
            engineState.process.stdin.once('drain', () => {
                console.log('[USI Server] stdinバッファが空きました');
            });
        }
        
        return true;
    } catch (error) {
        console.error('[USI Server] コマンド送信エラー', {
            error: error.message,
            code: error.code,
            errno: error.errno
        });
        
        // EPIPEエラーなどの場合、エンジンプロセスをクリーンアップ
        if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
            console.error('[USI Server] エンジンへの接続が切断されました。エンジンを再起動してください。');
            engineState.reset();
        }
        
        return false;
    }
}

/**
 * エンジンからの応答を処理
 */
function handleEngineResponse(response) {
    const timestamp = new Date().toISOString();
    console.log(`%c[USI Server ${timestamp}] ← エンジン: ${response}`, 'color: #2196F3; font-weight: bold');

    if (response.startsWith('id name ')) {
        engineState.name = response.substring(8);
        console.log(`[USI Server] エンジン名: ${engineState.name}`);
    } else if (response.startsWith('id author ')) {
        engineState.author = response.substring(10);
        console.log(`[USI Server] エンジン作者: ${engineState.author}`);
    } else if (response === 'usiok') {
        engineState.usiokReceived = true;
        console.log(`%c[USI Server] usiok受信`, 'color: #4CAF50; font-weight: bold');
    } else if (response === 'readyok') {
        engineState.readyokReceived = true;
        engineState.ready = true;
        console.log(`%c[USI Server] readyok受信 - エンジン準備完了`, 'color: #4CAF50; font-weight: bold');
    } else if (response.startsWith('bestmove ')) {
        const bestmove = response.substring(9).split(' ')[0];
        console.log(`%c[USI Server] 最善手受信: ${bestmove}`, 'color: #9C27B0; font-weight: bold');
        if (engineState.bestMoveCallback && engineState.process) {
            // エンジンがまだ実行中の場合のみコールバックを実行
            engineState.bestMoveCallback(bestmove);
            engineState.bestMoveCallback = null;
        }
    }
}

/**
 * 接続エンドポイント
 */
app.post('/usi/connect', (req, res) => {
    const enginePath = req.body.enginePath || process.env.ENGINE_PATH || 'engine.exe';
    const timestamp = new Date().toISOString();
    
    console.log(`%c[USI Server ${timestamp}] 接続リクエスト受信`, 'color: #FF9800; font-weight: bold', {
        enginePath: enginePath,
        ip: req.ip || req.connection.remoteAddress
    });
    
    if (!engineState.process) {
        console.log(`[USI Server] エンジン起動開始: ${enginePath}`);
        startEngine(enginePath);
        
        // エンジン起動の結果を少し待ってから返す
        setTimeout(() => {
            if (engineState.process) {
                console.log(`%c[USI Server] エンジン起動成功`, 'color: #4CAF50; font-weight: bold');
                res.json({
                    connected: true,
                    message: 'USIサーバーに接続しました',
                    enginePath: enginePath,
                    engineRunning: engineState.process !== null
                });
            } else {
                console.error(`[USI Server] エンジン起動失敗`);
                res.status(500).json({
                    connected: false,
                    error: 'エンジンの起動に失敗しました',
                    enginePath: enginePath
                });
            }
        }, 500);
    } else {
        console.log(`[USI Server] エンジンは既に起動中`);
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
    const timestamp = new Date().toISOString();
    console.log(`%c[USI Server ${timestamp}] USI初期化リクエスト`, 'color: #FF9800; font-weight: bold');
    
    if (!isEngineAlive()) {
        console.error(`[USI Server] エンジンが起動していません`);
        return res.status(500).json({
            error: 'エンジンが起動していません。エンジンが終了している可能性があります。'
        });
    }

    if (engineState.ready) {
        console.log(`[USI Server] エンジンは既に準備完了`);
        return res.json({
            ready: true,
            name: engineState.name,
            author: engineState.author
        });
    }

    // レスポンスが既に送信されたかチェックするフラグ
    let responseSent = false;

    // USIコマンドを送信
    const commandSent = sendCommand('usi');
    
    if (!commandSent) {
        // コマンド送信に失敗した場合
        console.error('[USI Server] usiコマンドの送信に失敗しました');
        return res.status(500).json({
            error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。'
        });
    }
    
    // usiokを受信するまで待機
    let usiokReceived = false;
    const checkUsiok = setInterval(() => {
        if (responseSent) {
            clearInterval(checkUsiok);
            return;
        }
        
        // エンジンプロセスの状態をチェック
        if (!isEngineAlive()) {
            clearInterval(checkUsiok);
            responseSent = true;
            console.error('[USI Server] エンジンプロセスが終了しました');
            return res.status(500).json({
                error: 'エンジンプロセスが終了しました'
            });
        }
        
        // usiokを受信したかチェック
        if (engineState.usiokReceived) {
            clearInterval(checkUsiok);
            usiokReceived = true;
            console.log(`%c[USI Server] usiok受信完了`, 'color: #4CAF50; font-weight: bold');
            
            // isreadyコマンドを送信
            const isreadyCommandSent = sendCommand('isready');
            if (!isreadyCommandSent) {
                responseSent = true;
                console.error('[USI Server] isreadyコマンドの送信に失敗しました');
                return res.status(500).json({
                    error: 'isreadyコマンドの送信に失敗しました。エンジンが終了している可能性があります。'
                });
            }
            
            console.log(`%c[USI Server] isreadyコマンド送信 - readyok待機中`, 'color: #FF9800; font-weight: bold');
            
            // readyokを受信するまで待機
            const checkReadyok = setInterval(() => {
                if (responseSent) {
                    clearInterval(checkReadyok);
                    return;
                }
                
                // エンジンプロセスの状態をチェック
                if (!isEngineAlive()) {
                    clearInterval(checkReadyok);
                    responseSent = true;
                    console.error('[USI Server] エンジンプロセスが終了しました（readyok待機中）');
                    return res.status(500).json({
                        error: 'エンジンプロセスが終了しました（readyok待機中）'
                    });
                }
                
                // readyokを受信してreadyがtrueになったかチェック
                if (engineState.readyokReceived && engineState.ready) {
                    clearInterval(checkReadyok);
                    responseSent = true;
                    console.log(`%c[USI Server] readyok受信完了 - エンジン初期化完了`, 'color: #4CAF50; font-weight: bold', {
                        name: engineState.name,
                        author: engineState.author
                    });
                    res.json({
                        ready: true,
                        name: engineState.name,
                        author: engineState.author
                    });
                }
            }, 50); // チェック間隔を50msに短縮して応答性を向上
            
            // readyok待機のタイムアウト（10秒）
            setTimeout(() => {
                clearInterval(checkReadyok);
                if (!responseSent && !engineState.readyokReceived) {
                    responseSent = true;
                    console.error(`[USI Server] readyok受信タイムアウト - エンジンの初期化がタイムアウトしました`);
                    res.status(500).json({
                        error: 'エンジンの初期化がタイムアウトしました（readyokを受信できませんでした）'
                    });
                }
            }, 10000); // タイムアウトを10秒に設定
        }
    }, 50); // チェック間隔を50msに短縮して応答性を向上

    // usiok待機のタイムアウト（10秒）
    setTimeout(() => {
        clearInterval(checkUsiok);
        if (!responseSent && !usiokReceived) {
            responseSent = true;
            console.error(`[USI Server] usiok受信タイムアウト - エンジンの初期化がタイムアウトしました`);
            res.status(500).json({
                error: 'エンジンの初期化がタイムアウトしました（usiokを受信できませんでした）'
            });
        }
    }, 10000); // タイムアウトを10秒に設定
});

/**
 * usinewgameエンドポイント
 */
app.post('/usi/usinewgame', (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`%c[USI Server ${timestamp}] usinewgameリクエスト`, 'color: #FF9800; font-weight: bold');
    
    if (!isEngineAlive()) {
        console.error(`[USI Server] エンジンが起動していません`);
        return res.status(500).json({
            error: 'エンジンが起動していません。エンジンが終了している可能性があります。'
        });
    }

    if (!engineState.ready) {
        console.error(`[USI Server] エンジンが初期化されていません`);
        return res.status(500).json({
            error: 'エンジンが初期化されていません。先に/usi/usiエンドポイントを呼び出してください。'
        });
    }

    // usinewgameコマンドを送信
    const commandSent = sendCommand('usinewgame');
    
    if (!commandSent) {
        console.error('[USI Server] usinewgameコマンドの送信に失敗しました');
        return res.status(500).json({
            error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。'
        });
    }

    console.log(`%c[USI Server] usinewgameコマンド送信完了`, 'color: #4CAF50; font-weight: bold');
    res.json({
        success: true,
        message: 'usinewgameコマンドを送信しました'
    });
});

/**
 * 局面設定エンドポイント
 */
app.post('/usi/position', (req, res) => {
    const timestamp = new Date().toISOString();
    const { sfen, moves } = req.body;
    const requestId = ++engineState.positionRequestId;
    
    // 重複リクエストの検出
    const command = `position sfen ${sfen}${(moves || []).length > 0 ? ' moves ' + moves.join(' ') : ''}`;
    if (engineState.lastPositionCommand === command && engineState.positionRequestPending) {
        console.warn(`%c[USI Server ${timestamp}] 重複positionリクエストを検出（リクエストID: ${requestId}）`, 'color: #FF9800; font-weight: bold', {
            sfen: sfen,
            movesCount: (moves || []).length
        });
        // 重複リクエストの場合は、前のリクエストの結果を返す
        return res.json({
            success: true,
            message: '局面を設定しました（重複リクエスト）',
            duplicate: true
        });
    }
    
    // SFEN形式の検証（警告のみ、エンジンに送信は試みる）
    if (!sfen || typeof sfen !== 'string') {
        console.error(`[USI Server] 無効なSFEN形式 (ID: ${requestId})`, { sfen: sfen });
        return res.status(400).json({
            error: '無効なSFEN形式です',
            requestId: requestId,
            receivedSfen: sfen
        });
    }
    
    // SFEN形式の基本チェック（警告のみ）
    // 注意: SFEN形式は通常、スペースで区切られた4-5つの部分で構成される
    // 例: "盤面 手番 先手持ち駒 後手持ち駒 手数" または "盤面 手番 先手持ち駒 手数"（後手持ち駒が省略される場合がある）
    const sfenParts = sfen.trim().split(/\s+/);
    
    // SFEN形式の詳細ログ（デバッグ用）
    console.log(`[USI Server] SFEN形式検証 (ID: ${requestId})`, {
        sfenLength: sfen.length,
        partsCount: sfenParts.length,
        parts: sfenParts,
        firstPart: sfenParts[0]?.substring(0, 50) + (sfenParts[0]?.length > 50 ? '...' : '')
    });
    
    // SFEN形式が不完全な場合は警告を出すが、エンジンに送信は試みる
    if (sfenParts.length < 3) {
        console.warn(`[USI Server] ⚠️ SFEN形式が不完全な可能性があります (ID: ${requestId})`, {
            sfen: sfen,
            parts: sfenParts.length,
            expected: '3以上（盤面、手番、持ち駒、手数）',
            note: 'エンジンに送信を試みますが、エラーが発生する可能性があります'
        });
    }
    
    console.log(`%c[USI Server ${timestamp}] 局面設定リクエスト (ID: ${requestId})`, 'color: #FF9800; font-weight: bold', {
        sfen: sfen,
        movesCount: (moves || []).length,
        command: command,
        sfenParts: sfenParts.length
    });
    
    // エンジンの状態を詳細にチェック
    const engineAlive = isEngineAlive();
    if (!engineAlive) {
        console.error(`[USI Server] エンジンが終了しています (ID: ${requestId})`, {
            engineAlive: engineAlive,
            engineProcess: !!engineState.process,
            engineProcessKilled: engineState.process?.killed,
            engineProcessExitCode: engineState.process?.exitCode,
            engineReady: engineState.ready,
            requestId: requestId
        });
        return res.status(500).json({
            error: 'エンジンが終了しています。エンジンを再起動してください。',
            requestId: requestId,
            details: {
                engineAlive: engineAlive,
                engineProcessExists: !!engineState.process,
                engineReady: engineState.ready
            }
        });
    }
    
    if (!engineState.ready) {
        console.error(`[USI Server] エンジンが初期化されていません (ID: ${requestId})`, {
            engineAlive: engineAlive,
            engineReady: engineState.ready,
            requestId: requestId
        });
        return res.status(500).json({
            error: 'エンジンが初期化されていません。先に/usi/usiエンドポイントを呼び出してください。',
            requestId: requestId
        });
    }

    engineState.currentPosition = sfen;
    engineState.currentMoves = moves || [];
    engineState.lastPositionCommand = command;
    engineState.positionRequestPending = true;

    const commandSent = sendCommand(command);
    
    if (!commandSent) {
        // コマンド送信に失敗した場合
        engineState.positionRequestPending = false;
        engineState.lastPositionCommand = null;
        console.error(`[USI Server] positionコマンドの送信に失敗しました (ID: ${requestId})`);
        return res.status(500).json({
            error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。',
            requestId: requestId
        });
    }

    // コマンド送信後、少し待ってからエンジンの状態を確認
    // エンジンがpositionコマンドでクラッシュする可能性があるため
    // 短い待機時間でエンジンの状態を確認してからレスポンスを返す
    const checkInterval = setInterval(() => {
        if (!isEngineAlive()) {
            clearInterval(checkInterval);
            engineState.positionRequestPending = false;
            console.error(`[USI Server] ⚠️ positionコマンド送信後、エンジンが終了しました (ID: ${requestId})`);
            console.error('[USI Server] 送信したコマンド:', command);
            console.error('[USI Server] 考えられる原因:');
            console.error('  - SFEN形式の解析エラー');
            console.error('  - エンジンの内部バグ');
            console.error('  - メモリ不足');
            console.error('  - 不正なpositionコマンド');
            console.error('[USI Server] エンジンのstderr出力を確認してください');
            
            // エンジンが終了した場合はエラーレスポンスを返す
            if (!res.headersSent) {
                return res.status(500).json({
                    error: 'エンジンがpositionコマンド受信後に終了しました',
                    requestId: requestId,
                    command: command,
                    possibleCauses: [
                        'SFEN形式の解析エラー',
                        'エンジンの内部バグ',
                        'メモリ不足',
                        '不正なpositionコマンド'
                    ]
                });
            }
        }
    }, 50); // 50msごとにチェック

    // タイムアウト（500ms後にエンジンが生きているか確認）
    setTimeout(() => {
        clearInterval(checkInterval);
        engineState.positionRequestPending = false;
        
        if (!isEngineAlive()) {
            console.error(`[USI Server] ⚠️ positionコマンド送信後、エンジンが終了しました (ID: ${requestId})`);
            if (!res.headersSent) {
                return res.status(500).json({
                    error: 'エンジンがpositionコマンド受信後に終了しました',
                    requestId: requestId,
                    command: command
                });
            }
        } else {
            console.log(`%c[USI Server] 局面設定完了（エンジンは正常に動作中） (ID: ${requestId})`, 'color: #4CAF50; font-weight: bold');
            // エンジンが正常に動作している場合のみ成功レスポンスを返す
            if (!res.headersSent) {
                res.json({
                    success: true,
                    message: '局面を設定しました',
                    requestId: requestId
                });
            }
        }
    }, 500);
});

/**
 * 思考開始エンドポイント
 */
app.post('/usi/go', (req, res) => {
    const timestamp = new Date().toISOString();
    const { timeLimit = 5000 } = req.body;
    const goStartTime = Date.now();
    
    console.log(`%c[USI Server ${timestamp}] 思考開始リクエスト`, 'color: #FF9800; font-weight: bold', {
        timeLimit: timeLimit,
        byoyomi: Math.max(1, Math.floor(timeLimit / 1000))
    });
    
    // エンジンの状態を詳細にチェック
    if (!isEngineAlive()) {
        console.error(`[USI Server] エンジンが終了しています`, {
            engineAlive: isEngineAlive(),
            engineProcess: !!engineState.process,
            engineReady: engineState.ready,
            positionRequestPending: engineState.positionRequestPending
        });
        return res.status(500).json({
            error: 'エンジンが終了しています。positionコマンド送信後にエンジンがクラッシュした可能性があります。',
            suggestion: 'エンジンを再起動してください。'
        });
    }
    
    if (!engineState.ready) {
        console.error(`[USI Server] エンジンが初期化されていません`, {
            engineAlive: isEngineAlive(),
            engineReady: engineState.ready
        });
        return res.status(500).json({
            error: 'エンジンが初期化されていません。'
        });
    }
    
    // positionコマンドが送信中の場合は少し待つ
    if (engineState.positionRequestPending) {
        console.warn('[USI Server] positionコマンド送信中です。少し待機します...');
        let waitCount = 0;
        const waitInterval = setInterval(() => {
            waitCount++;
            if (!engineState.positionRequestPending || waitCount >= 20) { // 最大1秒待機
                clearInterval(waitInterval);
                if (!isEngineAlive()) {
                    return res.status(500).json({
                        error: 'positionコマンド送信後にエンジンが終了しました。'
                    });
                }
                // 待機後、再度エンジンの状態を確認してからgoコマンドを送信
                proceedWithGo();
            }
        }, 50);
        
        function proceedWithGo() {
            if (!isEngineAlive() || !engineState.ready) {
                return res.status(500).json({
                    error: 'エンジンが準備できていません。'
                });
            }
            sendGoCommandInternal();
        }
        
        return;
    }
    
    sendGoCommandInternal();
    
    function sendGoCommandInternal() {
        // 再度エンジンの状態を確認
        if (!isEngineAlive() || !engineState.ready) {
            console.error(`[USI Server] goコマンド送信前にエンジンの状態を再確認: エンジンが準備できていません`, {
                engineAlive: isEngineAlive(),
                engineReady: engineState.ready
            });
            return res.status(500).json({
                error: 'エンジンが準備できていません。エンジンが終了している可能性があります。'
            });
        }

        // レスポンスが既に送信されたかチェックするフラグ
        let responseSent = false;

        // 現在のリクエスト情報を保存（エンジン終了時のエラーハンドリング用）
        engineState.currentGoRequest = {
            res: res,
            responseSent: false,
            timeoutId: null,
            startTime: goStartTime
        };

        // goコマンドを送信
        // 時間制限を設定（ミリ秒を秒に変換）
        const byoyomi = Math.max(1, Math.floor(timeLimit / 1000));
        const commandSent = sendCommand(`go byoyomi ${byoyomi}`);
        
        if (!commandSent) {
            // コマンド送信に失敗した場合
            console.error('[USI Server] goコマンドの送信に失敗しました');
            engineState.currentGoRequest = null;
            return res.status(500).json({
                error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。'
            });
        }

        // 最善手を待機
        engineState.bestMoveCallback = (bestmove) => {
            const req = engineState.currentGoRequest;
            if (!responseSent && engineState.process && req) {
                responseSent = true;
                req.responseSent = true;
                if (req.timeoutId) {
                    clearTimeout(req.timeoutId);
                }
                const elapsed = Date.now() - req.startTime;
                console.log(`%c[USI Server] 思考完了`, 'color: #4CAF50; font-weight: bold', {
                    bestmove: bestmove,
                    elapsed: `${elapsed}ms`
                });
                engineState.bestMoveCallback = null;
                engineState.currentGoRequest = null;
                res.json({
                    bestmove: bestmove,
                    position: engineState.currentPosition
                });
            }
        };

        // タイムアウト処理
        engineState.currentGoRequest.timeoutId = setTimeout(() => {
            const req = engineState.currentGoRequest;
            if (!responseSent && req) {
                responseSent = true;
                req.responseSent = true;
                engineState.bestMoveCallback = null;
                const elapsed = Date.now() - req.startTime;
                // エンジンが終了しているかチェック
                if (!engineState.process) {
                    console.error(`[USI Server] エンジンが終了しました`, { elapsed: `${elapsed}ms` });
                    res.status(500).json({
                        error: 'エンジンが終了しました'
                    });
                } else {
                    console.error(`[USI Server] 思考タイムアウト`, { elapsed: `${elapsed}ms` });
                    res.status(500).json({
                        error: '思考がタイムアウトしました'
                    });
                }
                engineState.currentGoRequest = null;
            }
        }, timeLimit + 1000);
    }
});

/**
 * 切断エンドポイント
 */
app.post('/usi/quit', (req, res) => {
    if (engineState.process) {
        sendCommand('quit');
        setTimeout(() => {
            if (engineState.process) {
                engineState.process.kill();
            }
            engineState.reset();
        }, 1000);
    } else {
        engineState.reset();
    }

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
        engineRunning: engineState.process !== null,
        engineReady: engineState.ready,
        engineName: engineState.name,
        engineAlive: isEngineAlive()
    });
});

/**
 * Chrome DevTools MCP用のエンドポイント
 * Chrome DevTools MCPが自動的にアクセスするエンドポイント
 */
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
    // Chrome DevTools MCPがこのエンドポイントにアクセスするが、
    // このサーバーではDevTools MCPを使用しないため、空のレスポンスを返す
    res.status(204).send();
});

/**
 * 404エラーハンドリング（Chrome DevTools MCP関連のエラーを抑制）
 */
app.use((req, res, next) => {
    // Chrome DevTools MCP関連のリクエストは404を返すが、ログを抑制
    if (req.path.includes('.well-known') || req.path.includes('devtools')) {
        res.status(404).json({
            error: 'Not found',
            message: 'This endpoint is not available on this server'
        });
        return;
    }
    // その他の404エラー
    res.status(404).json({
        error: 'Not found',
        message: `The requested endpoint ${req.path} was not found`
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
        console.log(`[USI Server] 環境変数 ENGINE_PATH が設定されています: ${defaultEnginePath}`);
        console.log('[USI Server] エンジンを自動接続します...');
        setTimeout(() => {
            if (!engineState.process) {
                startEngine(defaultEnginePath);
            }
        }, 1000);
    } else {
        console.log('\n[USI Server] エンジンを接続するには、以下のAPIを呼び出してください:');
        console.log('[USI Server] POST http://localhost:8080/usi/connect');
        console.log('[USI Server] Body: { "enginePath": "./dlshogi-dr2_exhi/dlshogi_tensorrt.exe" }');
        console.log('\n[USI Server] または、環境変数 ENGINE_PATH を設定してサーバーを再起動してください。');
    }
});

// プロセス終了時のクリーンアップ
process.on('SIGINT', () => {
    console.log('\n[USI Server] サーバーを終了します...');
    if (engineState.process) {
        sendCommand('quit');
        setTimeout(() => {
            if (engineState.process) {
                engineState.process.kill();
            }
            engineState.reset();
            process.exit(0);
        }, 1000);
    } else {
        process.exit(0);
    }
});



