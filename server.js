// USIサーバー - Node.js版（複数サーバー対応）
// コンフィグファイルから複数のUSIサーバーを異なるポートで起動

const fs = require('fs');
const path = require('path');
const USIServerInstance = require('./USIServerInstance');
const { Logger, LOG_LEVEL } = require('./logger');

const logger = new Logger('Main', LOG_LEVEL.INFO);

// コンフィグファイルのパス
const CONFIG_FILE = path.join(__dirname, 'config.json');

/**
 * コンフィグファイルを読み込む
 */
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            logger.warn(`コンフィグファイルが見つかりません: ${CONFIG_FILE}`);
            logger.info('デフォルト設定を使用します（ポート8080）');
            return {
                servers: [{
                    name: 'default',
                    port: 8080,
                    enginePath: process.env.ENGINE_PATH || '',
                    autoConnect: !!process.env.ENGINE_PATH
                }]
            };
        }

        const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
        const config = JSON.parse(configData);

        if (!config.servers || !Array.isArray(config.servers) || config.servers.length === 0) {
            logger.error('コンフィグファイルにservers配列がありません');
            process.exit(1);
        }

        logger.info(`コンフィグ読み込み完了: ${config.servers.length}個のサーバー設定`);
        return config;
    } catch (error) {
        logger.error(`コンフィグファイルの読み込みエラー: ${error.message}`);
        logger.info('デフォルト設定を使用します（ポート8080）');
        return {
            servers: [{
                name: 'default',
                port: 8080,
                enginePath: process.env.ENGINE_PATH || '',
                autoConnect: !!process.env.ENGINE_PATH
            }]
        };
    }
}

/**
 * サーバーインスタンスを管理
 */
const serverInstances = [];

/**
 * すべてのサーバーを起動
 */
async function startAllServers() {
    const config = loadConfig();
<<<<<<< HEAD

    logger.info('USIサーバー起動開始');

    for (const serverConfig of config.servers) {
        try {
            // 必須パラメータの検証
            if (!serverConfig.port) {
                logger.error(`サーバー "${serverConfig.name || 'unknown'}" にポートが指定されていません`);
                continue;
            }

            // サーバーインスタンスを作成
            const server = new USIServerInstance({
                name: serverConfig.name || `server-${serverConfig.port}`,
                port: serverConfig.port,
                enginePath: serverConfig.enginePath || '',
                autoConnect: serverConfig.autoConnect || false
            });

            // サーバーを起動
            await server.start();
            serverInstances.push(server);
        } catch (error) {
            logger.error(`サーバー "${serverConfig.name || serverConfig.port}" の起動に失敗: ${error.message}`);
            if (error.message.includes('already in use')) {
                logger.error(`ポート ${serverConfig.port} は既に使用されています`);
=======
    
        for (const serverConfig of config.servers) {
            try {
                // 必須パラメータの検証
                if (!serverConfig.port) {
                    console.error(`[Config] サーバー "${serverConfig.name || 'unknown'}" にポートが指定されていません`);
                    continue;
                }
                
                // サーバーインスタンスを作成
                const server = new USIServerInstance({
                    name: serverConfig.name || `server-${serverConfig.port}`,
                    port: serverConfig.port,
                    enginePath: serverConfig.enginePath || '',
                    autoConnect: serverConfig.autoConnect || false
                });
                
                // サーバーを起動
                await server.start();
                serverInstances.push(server);
            } catch (error) {
                console.error(`[Main] サーバー "${serverConfig.name || serverConfig.port}" の起動に失敗しました: ${error.message}`);
                if (error.message.includes('already in use')) {
                    console.error(`[Main] ポート ${serverConfig.port} は既に使用されています。別のポートを指定してください。`);
                }
>>>>>>> 7a0f073d260ccd3a6bdc01a58e8e7ac9334ae462
            }
        }
        
        if (serverInstances.length === 0) {
            console.error('[Main] 起動できたサーバーがありません');
            process.exit(1);
    }
<<<<<<< HEAD

    if (serverInstances.length === 0) {
        logger.error('起動できたサーバーがありません');
        process.exit(1);
    }

    const serverList = serverInstances.map(s => `[${s.name}: http://localhost:${s.port}]`).join(', ');
    logger.info(`サーバー起動完了 (${serverInstances.length}個): ${serverList}`);
=======
>>>>>>> 7a0f073d260ccd3a6bdc01a58e8e7ac9334ae462
}

/**
 * すべてのサーバーを停止
 */
async function stopAllServers() {
<<<<<<< HEAD
    logger.info('すべてのサーバーを停止します...');

    const stopPromises = serverInstances.map(server => server.stop());
    await Promise.all(stopPromises);

    logger.info('すべてのサーバーを停止しました');
=======
    const stopPromises = serverInstances.map(server => server.stop());
    await Promise.all(stopPromises);
>>>>>>> 7a0f073d260ccd3a6bdc01a58e8e7ac9334ae462
    process.exit(0);
}

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
<<<<<<< HEAD
    logger.info('シグナルを受信しました。終了します...');
=======
>>>>>>> 7a0f073d260ccd3a6bdc01a58e8e7ac9334ae462
    await stopAllServers();
});

process.on('SIGTERM', async () => {
<<<<<<< HEAD
    logger.info('シグナルを受信しました。終了します...');
=======
>>>>>>> 7a0f073d260ccd3a6bdc01a58e8e7ac9334ae462
    await stopAllServers();
});

// 未処理のエラーをキャッチ
process.on('uncaughtException', (error) => {
    logger.error('未処理の例外:', error);
    stopAllServers();
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('未処理のPromise拒否:', reason);
    stopAllServers();
});

// サーバーを起動
startAllServers().catch(error => {
    logger.error('サーバー起動エラー:', error);
    process.exit(1);
});
