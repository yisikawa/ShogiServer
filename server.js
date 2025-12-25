// USIサーバー - Node.js版（複数サーバー対応）
// コンフィグファイルから複数のUSIサーバーを異なるポートで起動

const fs = require('fs');
const path = require('path');
const USIServerInstance = require('./USIServerInstance');

// コンフィグファイルのパス
const CONFIG_FILE = path.join(__dirname, 'config.json');

/**
 * コンフィグファイルを読み込む
 */
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            console.warn(`[Config] コンフィグファイルが見つかりません: ${CONFIG_FILE}`);
            console.log('[Config] デフォルト設定を使用します（ポート8080）');
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
            console.error('[Config] コンフィグファイルにservers配列がありません');
            process.exit(1);
        }
        
        console.log(`[Config] コンフィグファイルを読み込みました: ${config.servers.length}個のサーバー設定`);
        return config;
    } catch (error) {
        console.error(`[Config] コンフィグファイルの読み込みエラー: ${error.message}`);
        console.log('[Config] デフォルト設定を使用します（ポート8080）');
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
    
    console.log('\n========================================');
    console.log('USIサーバー起動');
    console.log('========================================\n');
    
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
            
            console.log(`[Main] サーバー "${server.name}" をポート ${server.port} で起動しました\n`);
        } catch (error) {
            console.error(`[Main] サーバー "${serverConfig.name || serverConfig.port}" の起動に失敗しました: ${error.message}`);
            if (error.message.includes('already in use')) {
                console.error(`[Main] ポート ${serverConfig.port} は既に使用されています。別のポートを指定してください。`);
            }
        }
    }
    
    if (serverInstances.length === 0) {
        console.error('[Main] 起動できたサーバーがありません');
        process.exit(1);
    }
    
    console.log('========================================');
    console.log(`合計 ${serverInstances.length} 個のサーバーが起動しました`);
    console.log('========================================\n');
    
    // 各サーバーの情報を表示
    serverInstances.forEach(server => {
        console.log(`  - ${server.name}: http://localhost:${server.port}`);
    });
    console.log('');
}

/**
 * すべてのサーバーを停止
 */
async function stopAllServers() {
    console.log('\n[Main] すべてのサーバーを停止します...');
    
    const stopPromises = serverInstances.map(server => server.stop());
    await Promise.all(stopPromises);
    
    console.log('[Main] すべてのサーバーを停止しました');
    process.exit(0);
}

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
    console.log('\n[Main] シグナルを受信しました。サーバーを終了します...');
    await stopAllServers();
});

process.on('SIGTERM', async () => {
    console.log('\n[Main] シグナルを受信しました。サーバーを終了します...');
    await stopAllServers();
});

// 未処理のエラーをキャッチ
process.on('uncaughtException', (error) => {
    console.error('[Main] 未処理の例外:', error);
    stopAllServers();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] 未処理のPromise拒否:', reason);
    stopAllServers();
});

// サーバーを起動
startAllServers().catch(error => {
    console.error('[Main] サーバー起動エラー:', error);
    process.exit(1);
});
