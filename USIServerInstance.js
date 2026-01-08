// USIサーバーインスタンスクラス
// 各サーバーインスタンスが独立したエンジン状態とExpressアプリを持つ

const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

/**
 * エンジン状態管理クラス
 */
class EngineState {
    constructor() {
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
        this.positionRequestId = 0;
        this.bestMoveCallback = null;
    }

    reset(preserveName = false) {
        const savedName = preserveName ? this.name : '';
        const savedAuthor = preserveName ? this.author : '';
        this.process = null;
        this.ready = false;
        this.usiokReceived = false;
        this.readyokReceived = false;
        this.name = savedName;
        this.author = savedAuthor;
        this.currentPosition = null;
        this.currentMoves = [];
        this.currentGoRequest = null;
        this.positionRequestPending = false;
        this.lastPositionCommand = null;
        this.positionRequestId = 0;
        this.bestMoveCallback = null;
    }
}

/**
 * USIサーバーインスタンスクラス
 */
class USIServerInstance {
    constructor(config) {
        this.name = config.name || 'server';
        this.port = config.port || 8080;
        this.enginePath = config.enginePath || '';
        this.autoConnect = config.autoConnect || false;

        this.app = express();
        this.engineState = new EngineState();
        this.server = null;

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * ミドルウェアの設定
     */
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
    }

    /**
     * ルートの設定
     */
    setupRoutes() {
        // 接続エンドポイント
        this.app.post('/usi/connect', (req, res) => {
            const enginePath = this.enginePath || process.env.ENGINE_PATH || 'engine.exe';

            if (!this.engineState.process) {
                this.startEngine(enginePath);

                setTimeout(() => {
                    if (this.engineState.process) {
                        res.json({
                            connected: true,
                            message: 'USIサーバーに接続しました',
                            enginePath: enginePath,
                            engineRunning: this.engineState.process !== null
                        });
                    } else {
                        console.error(`[USI Server ${this.name}:${this.port}] エンジン起動失敗`);
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

        // USI初期化エンドポイント
        this.app.post('/usi/usi', (req, res) => {
            // エンジンが既に準備完了している場合、エンジン名を返す（エンジンが終了していても、エンジン名が取得されている場合は返す）
            if (this.engineState.ready || (this.engineState.name && !this.isEngineAlive())) {
                return res.json({
                    ready: this.engineState.ready,
                    name: this.engineState.name,
                    author: this.engineState.author
                });
            }

            // エンジンが終了していても、エンジン名が既に取得されている場合はそれを返す
            if (!this.isEngineAlive()) {
                if (this.engineState.name) {
                    return res.json({
                        ready: false,
                        name: this.engineState.name,
                        author: this.engineState.author
                    });
                }
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが起動していません`);
                return res.status(500).json({
                    error: 'エンジンが起動していません。エンジンが終了している可能性があります。'
                });
            }

            let responseSent = false;
            const commandSent = this.sendCommand('usi');

            if (!commandSent) {
                console.error(`[USI Server ${this.name}:${this.port}] usiコマンドの送信に失敗しました`);
                return res.status(500).json({
                    error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。'
                });
            }

            let usiokReceived = false;
            const checkUsiok = setInterval(() => {
                if (responseSent) {
                    clearInterval(checkUsiok);
                    return;
                }

                if (!this.isEngineAlive()) {
                    clearInterval(checkUsiok);
                    // エンジン名が既に取得されている場合は、それを返す
                    if (this.engineState.name) {
                        responseSent = true;
                        return res.json({
                            ready: false,
                            name: this.engineState.name,
                            author: this.engineState.author
                        });
                    }
                    responseSent = true;
                    console.error(`[USI Server ${this.name}:${this.port}] エンジンプロセスが終了しました`);
                    return res.status(500).json({
                        error: 'エンジンプロセスが終了しました'
                    });
                }

                if (this.engineState.usiokReceived) {
                    clearInterval(checkUsiok);
                    usiokReceived = true;

                    const isreadyCommandSent = this.sendCommand('isready');
                    if (!isreadyCommandSent) {
                        responseSent = true;
                        console.error(`[USI Server ${this.name}:${this.port}] isreadyコマンドの送信に失敗しました`);
                        return res.status(500).json({
                            error: 'isreadyコマンドの送信に失敗しました。エンジンが終了している可能性があります。'
                        });
                    }

                    const checkReadyok = setInterval(() => {
                        if (responseSent) {
                            clearInterval(checkReadyok);
                            return;
                        }

                        if (!this.isEngineAlive()) {
                            clearInterval(checkReadyok);
                            // エンジン名が既に取得されている場合は、それを返す
                            if (this.engineState.name) {
                                responseSent = true;
                                return res.json({
                                    ready: false,
                                    name: this.engineState.name,
                                    author: this.engineState.author
                                });
                            }
                            responseSent = true;
                            console.error(`[USI Server ${this.name}:${this.port}] エンジンプロセスが終了しました（readyok待機中）`);
                            return res.status(500).json({
                                error: 'エンジンプロセスが終了しました（readyok待機中）'
                            });
                        }

                        if (this.engineState.readyokReceived && this.engineState.ready) {
                            clearInterval(checkReadyok);
                            responseSent = true;
                            res.json({
                                ready: true,
                                name: this.engineState.name,
                                author: this.engineState.author
                            });
                        }
                    }, 50);

                    setTimeout(() => {
                        clearInterval(checkReadyok);
                        if (!responseSent && !this.engineState.readyokReceived) {
                            responseSent = true;
                            // エンジン名が取得できている場合は、ready: falseで返す（エラーにしない）
                            if (this.engineState.name) {
                                return res.json({
                                    ready: false,
                                    name: this.engineState.name,
                                    author: this.engineState.author
                                });
                            }
                            console.error(`[USI Server ${this.name}:${this.port}] readyok受信タイムアウト`);
                            res.status(500).json({
                                error: 'エンジンの初期化がタイムアウトしました（readyokを受信できませんでした）'
                            });
                        }
                    }, 10000);
                }
            }, 50);

            setTimeout(() => {
                clearInterval(checkUsiok);
                if (!responseSent && !usiokReceived) {
                    responseSent = true;
                    // エンジン名が取得できている場合は、ready: falseで返す（エラーにしない）
                    if (this.engineState.name) {
                        return res.json({
                            ready: false,
                            name: this.engineState.name,
                            author: this.engineState.author
                        });
                    }
                    console.error(`[USI Server ${this.name}:${this.port}] usiok受信タイムアウト`);
                    res.status(500).json({
                        error: 'エンジンの初期化がタイムアウトしました（usiokを受信できませんでした）'
                    });
                }
            }, 10000);
        });

        // usinewgameエンドポイント
        this.app.post('/usi/usinewgame', (req, res) => {
            if (!this.isEngineAlive()) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが起動していません`);
                return res.status(500).json({
                    error: 'エンジンが起動していません。エンジンが終了している可能性があります。'
                });
            }

            if (!this.engineState.ready) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが初期化されていません`);
                return res.status(500).json({
                    error: 'エンジンが初期化されていません。先に/usi/usiエンドポイントを呼び出してください。'
                });
            }

            const commandSent = this.sendCommand('usinewgame');

            if (!commandSent) {
                console.error(`[USI Server ${this.name}:${this.port}] usinewgameコマンドの送信に失敗しました`);
                return res.status(500).json({
                    error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。'
                });
            }

            res.json({
                success: true,
                message: 'usinewgameコマンドを送信しました'
            });
        });

        // 局面設定エンドポイント
        this.app.post('/usi/position', (req, res) => {
            const { sfen, moves } = req.body;
            const requestId = ++this.engineState.positionRequestId;

            // Security: Input Validation
            // Ban newlines and control characters to prevent USI command injection
            const hasInvalidChars = (str) => /[\r\n\x00-\x1f]/.test(str);

            if (sfen && typeof sfen === 'string' && hasInvalidChars(sfen)) {
                console.error(`[USI Server ${this.name}:${this.port}] Security Warning: Invalid characters in SFEN`);
                return res.status(400).json({ error: 'Invalid characters in SFEN' });
            }

            if (moves && Array.isArray(moves)) {
                for (const move of moves) {
                    if (typeof move === 'string' && hasInvalidChars(move)) {
                        console.error(`[USI Server ${this.name}:${this.port}] Security Warning: Invalid characters in moves`);
                        return res.status(400).json({ error: 'Invalid characters in moves' });
                    }
                }
            }

            let command;
            if (sfen === 'startpos') {
                command = `position startpos`;
            } else {
                command = `position sfen ${sfen}`;
            }

            if (moves && moves.length > 0) {
                command += ` moves ${moves.join(' ')}`;
            }

            console.log(`[USI Server ${this.name}:${this.port}] コマンド生成: ${command} (sfen=${sfen}, moves=${(moves || []).length})`);

            if (this.engineState.lastPositionCommand === command && this.engineState.positionRequestPending) {
                return res.json({
                    success: true,
                    message: '局面を設定しました（重複リクエスト）',
                    duplicate: true
                });
            }

            if ((!sfen || typeof sfen !== 'string') && sfen !== 'startpos') {
                console.error(`[USI Server ${this.name}:${this.port}] 無効なSFEN形式 (ID: ${requestId})`);
                return res.status(400).json({
                    error: '無効なSFEN形式です',
                    requestId: requestId,
                    receivedSfen: sfen
                });
            }

            if (!this.isEngineAlive()) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが終了しています (ID: ${requestId})`);
                return res.status(500).json({
                    error: 'エンジンが終了しています。エンジンを再起動してください。',
                    requestId: requestId
                });
            }

            if (!this.engineState.ready) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが初期化されていません (ID: ${requestId})`);
                return res.status(500).json({
                    error: 'エンジンが初期化されていません。先に/usi/usiエンドポイントを呼び出してください。',
                    requestId: requestId
                });
            }

            this.engineState.currentPosition = sfen;
            this.engineState.currentMoves = moves || [];
            this.engineState.lastPositionCommand = command;
            this.engineState.positionRequestPending = true;

            const commandSent = this.sendCommand(command);

            if (!commandSent) {
                this.engineState.positionRequestPending = false;
                this.engineState.lastPositionCommand = null;
                console.error(`[USI Server ${this.name}:${this.port}] positionコマンドの送信に失敗しました (ID: ${requestId})`);
                return res.status(500).json({
                    error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。',
                    requestId: requestId
                });
            }

            const checkInterval = setInterval(() => {
                if (!this.isEngineAlive()) {
                    clearInterval(checkInterval);
                    this.engineState.positionRequestPending = false;
                    console.error(`[USI Server ${this.name}:${this.port}] positionコマンド送信後、エンジンが終了しました (ID: ${requestId})`);
                    if (!res.headersSent) {
                        return res.status(500).json({
                            error: 'エンジンがpositionコマンド受信後に終了しました',
                            requestId: requestId
                        });
                    }
                }
            }, 50);

            setTimeout(() => {
                clearInterval(checkInterval);
                this.engineState.positionRequestPending = false;

                if (!this.isEngineAlive()) {
                    console.error(`[USI Server ${this.name}:${this.port}] positionコマンド送信後、エンジンが終了しました (ID: ${requestId})`);
                    if (!res.headersSent) {
                        return res.status(500).json({
                            error: 'エンジンがpositionコマンド受信後に終了しました',
                            requestId: requestId
                        });
                    }
                } else {
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

        // 思考開始エンドポイント
        this.app.post('/usi/go', (req, res) => {
            const { timeLimit = 5000 } = req.body;

            if (!this.isEngineAlive()) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが終了しています`);
                return res.status(500).json({
                    error: 'エンジンが終了しています。positionコマンド送信後にエンジンがクラッシュした可能性があります。',
                    suggestion: 'エンジンを再起動してください。'
                });
            }

            if (!this.engineState.ready) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが初期化されていません`);
                return res.status(500).json({
                    error: 'エンジンが初期化されていません。'
                });
            }

            if (this.engineState.positionRequestPending) {
                let waitCount = 0;
                const waitInterval = setInterval(() => {
                    waitCount++;
                    if (!this.engineState.positionRequestPending || waitCount >= 20) {
                        clearInterval(waitInterval);
                        if (!this.isEngineAlive()) {
                            return res.status(500).json({
                                error: 'positionコマンド送信後にエンジンが終了しました。'
                            });
                        }
                        this.proceedWithGo(req, res, timeLimit);
                    }
                }, 50);
                return;
            }

            this.proceedWithGo(req, res, timeLimit);
        });

        // 終了エンドポイント
        this.app.post('/usi/quit', (req, res) => {
            if (this.engineState.process) {
                this.sendCommand('quit');
                setTimeout(() => {
                    if (this.engineState.process) {
                        this.engineState.process.kill();
                    }
                    this.engineState.reset();
                }, 1000);
            }

            res.json({
                success: true,
                message: 'エンジンを終了しました'
            });
        });

        // ヘルスチェックエンドポイント
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                serverName: this.name,
                port: this.port,
                engineRunning: this.engineState.process !== null,
                engineReady: this.engineState.ready,
                engineName: this.engineState.name
            });
        });

        // 404エラーハンドラー
        this.app.use((req, res) => {
            if (req.path.includes('.well-known') || req.path.includes('devtools')) {
                res.status(404).json({
                    error: 'Not found',
                    message: 'This endpoint is not available on this server'
                });
                return;
            }
            res.status(404).json({
                error: 'Not found',
                message: `The requested endpoint ${req.path} was not found`
            });
        });
    }

    /**
     * エンジンを起動
     * (セキュリティ対策: 外部からのパス指定を廃止)
     */
    startEngine() {
        const pathToUse = this.enginePath || process.env.ENGINE_PATH || 'engine.exe';

        if (this.engineState.process) {
            return;
        }

        let normalizedPath = pathToUse;
        if (!path.isAbsolute(pathToUse)) {
            normalizedPath = path.resolve(process.cwd(), pathToUse);
        }
        normalizedPath = path.normalize(normalizedPath);

        if (!fs.existsSync(normalizedPath)) {
            console.error(`[USI Server ${this.name}:${this.port}] エラー: エンジンファイルが見つかりません: ${normalizedPath}`);
            return;
        }

        const engineDir = path.dirname(normalizedPath);

        try {
            this.engineState.process = spawn(normalizedPath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: engineDir,
                shell: false
            });
        } catch (error) {
            console.error(`[USI Server ${this.name}:${this.port}] エンジン起動エラー: ${error.message}`);
            this.engineState.reset();
            return;
        }

        this.setupEngineEventHandlers();
    }

    /**
     * エンジンのイベントハンドラーを設定
     */
    setupEngineEventHandlers() {
        const proc = this.engineState.process;
        if (!proc) return;

        let buffer = '';

        proc.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed) {
                    // console.log(`[USI Server ${this.name}:${this.port}] Engine Output << ${trimmed}`);
                    this.handleEngineResponse(trimmed);
                }
            });
        });

        proc.stderr.on('data', (data) => {
            const errorMsg = data.toString().trim();
            if (errorMsg) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンstderr: ${errorMsg}`);
            }
        });

        proc.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンが異常終了しました。エラーコード: ${code}`);

                if (this.engineState.currentGoRequest && !this.engineState.currentGoRequest.responseSent) {
                    this.engineState.currentGoRequest.responseSent = true;
                    this.engineState.currentGoRequest.res.status(500).json({
                        error: 'エンジンが思考中にクラッシュしました',
                        errorCode: code
                    });
                    this.engineState.currentGoRequest = null;
                }
            }

            this.engineState.reset(true);
        });

        proc.on('error', (error) => {
            console.error(`[USI Server ${this.name}:${this.port}] エンジン起動エラー: ${error.message}`);
            this.engineState.reset(false);
        });

        proc.stdin.on('error', (error) => {
            if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンへの接続が切断されました。`);
                this.engineState.reset();

                if (this.engineState.currentGoRequest && !this.engineState.currentGoRequest.responseSent) {
                    this.engineState.currentGoRequest.responseSent = true;
                    this.engineState.currentGoRequest.res.status(500).json({
                        error: 'エンジンへの接続が切断されました。'
                    });
                    this.engineState.currentGoRequest = null;
                }
            }
        });
    }

    /**
     * エンジンの状態をチェック
     */
    isEngineAlive() {
        const proc = this.engineState.process;
        if (!proc) {
            return false;
        }

        if (proc.killed || proc.exitCode !== null) {
            return false;
        }

        if (!proc.stdin || proc.stdin.destroyed || proc.stdin.writableEnded) {
            return false;
        }

        return true;
    }

    /**
     * エンジンにコマンドを送信
     */
    sendCommand(command) {
        if (!this.isEngineAlive()) {
            console.error(`[USI Server ${this.name}:${this.port}] エンジンが起動していないか、既に終了しています`);
            // エンジン名と作者を保持したまま、その他の状態のみリセット
            this.engineState.reset(true);
            return false;
        }

        try {
            console.log(`[USI Server ${this.name}:${this.port}] Engine Input >> ${command}`);
            const success = this.engineState.process.stdin.write(command + '\n');

            if (!success) {
                this.engineState.process.stdin.once('drain', () => {
                    // バッファが空になったことを待つ（ログなし）
                });
            }

            return true;
        } catch (error) {
            console.error(`[USI Server ${this.name}:${this.port}] コマンド送信エラー: ${error.message}`);

            if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
                console.error(`[USI Server ${this.name}:${this.port}] エンジンへの接続が切断されました。`);
                this.engineState.reset(true);
            }

            return false;
        }
    }

    /**
     * エンジンからの応答を処理
     */
    handleEngineResponse(response) {
        if (response.startsWith('id name ')) {
            this.engineState.name = response.substring(8);
        } else if (response.startsWith('id author ')) {
            this.engineState.author = response.substring(10);
        } else if (response.startsWith('option name Engine_Name')) {
            // dlshogi_onnxruntime.exeなどが使用する非標準形式: "option name Engine_Name type string default dlshogi"
            const match = response.match(/option name Engine_Name\s+type string\s+default\s+(.+)/);
            if (match && match[1]) {
                this.engineState.name = match[1].trim();
            }
        } else if (response === 'usiok') {
            this.engineState.usiokReceived = true;
        } else if (response === 'readyok') {
            this.engineState.readyokReceived = true;
            this.engineState.ready = true;
        } else if (response.startsWith('bestmove ')) {
            const bestmove = response.substring(9).split(' ')[0];
            if (this.engineState.bestMoveCallback && this.engineState.process) {
                this.engineState.bestMoveCallback(bestmove);
                this.engineState.bestMoveCallback = null;
            }
        }
    }

    /**
     * goコマンドの実行
     */
    proceedWithGo(req, res, timeLimit) {
        const goStartTime = Date.now();
        let responseSent = false;

        // 再度エンジンの状態を確認
        if (!this.isEngineAlive() || !this.engineState.ready) {
            console.error(`[USI Server ${this.name}:${this.port}] goコマンド送信前にエンジンの状態を再確認: エンジンが準備できていません`, {
                engineAlive: this.isEngineAlive(),
                engineReady: this.engineState.ready
            });
            return res.status(500).json({
                error: 'エンジンが準備できていません。エンジンが終了している可能性があります。'
            });
        }

        // 現在のリクエスト情報を保存
        this.engineState.currentGoRequest = {
            res: res,
            responseSent: false,
            timeoutId: null,
            startTime: goStartTime
        };

        // goコマンドを送信
        const byoyomi = Math.max(1, Math.floor(timeLimit / 1000));
        const commandSent = this.sendCommand(`go byoyomi ${byoyomi}`);

        if (!commandSent) {
            console.error(`[USI Server ${this.name}:${this.port}] goコマンドの送信に失敗しました`);
            this.engineState.currentGoRequest = null;
            return res.status(500).json({
                error: 'エンジンへのコマンド送信に失敗しました。エンジンが終了している可能性があります。'
            });
        }

        // 最善手を待機
        this.engineState.bestMoveCallback = (bestmove) => {
            const req = this.engineState.currentGoRequest;
            if (!responseSent && this.engineState.process && req) {
                responseSent = true;
                req.responseSent = true;
                if (req.timeoutId) {
                    clearTimeout(req.timeoutId);
                }
                this.engineState.bestMoveCallback = null;
                this.engineState.currentGoRequest = null;
                res.json({
                    bestmove: bestmove,
                    position: this.engineState.currentPosition
                });
            }
        };

        // タイムアウト処理
        this.engineState.currentGoRequest.timeoutId = setTimeout(() => {
            const req = this.engineState.currentGoRequest;
            if (!responseSent && req) {
                responseSent = true;
                req.responseSent = true;
                this.engineState.bestMoveCallback = null;
                const elapsed = Date.now() - req.startTime;
                // エンジンが終了しているかチェック
                if (!this.engineState.process) {
                    console.error(`[USI Server ${this.name}:${this.port}] エンジンが終了しました`, { elapsed: `${elapsed}ms` });
                    res.status(500).json({
                        error: 'エンジンが終了しました'
                    });
                } else {
                    console.error(`[USI Server ${this.name}:${this.port}] 思考タイムアウト`, { elapsed: `${elapsed}ms` });
                    res.status(500).json({
                        error: '思考がタイムアウトしました'
                    });
                }
                this.engineState.currentGoRequest = null;
            }
        }, timeLimit + 1000);
    }

    /**
     * サーバーを起動
     */
    start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`%c[USI Server ${this.name}] サーバーが起動しました: http://localhost:${this.port}`, 'color: #4CAF50; font-weight: bold');

                if (this.autoConnect && this.enginePath) {
                    setTimeout(() => {
                        if (!this.engineState.process) {
                            this.startEngine(this.enginePath);
                        }
                    }, 1000);
                }

                resolve();
            });

            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`[USI Server ${this.name}] ポート ${this.port} は既に使用されています`);
                    reject(new Error(`Port ${this.port} is already in use`));
                } else {
                    console.error(`[USI Server ${this.name}] サーバー起動エラー: ${error.message}`);
                    reject(error);
                }
            });
        });
    }

    /**
     * サーバーを停止
     */
    stop() {
        return new Promise((resolve) => {
            if (this.engineState.process) {
                this.sendCommand('quit');
                setTimeout(() => {
                    if (this.engineState.process) {
                        this.engineState.process.kill();
                    }
                    this.engineState.reset();
                }, 1000);
            }

            if (this.server) {
                this.server.close(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = USIServerInstance;
