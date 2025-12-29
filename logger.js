// サーバー用ログ管理クラス

/**
 * ログレベル定義
 */
const LOG_LEVEL = {
    ERROR: 0,   // エラー
    WARN: 1,    // 警告
    INFO: 2,    // 情報
    DEBUG: 3    // デバッグ
};

/**
 * 統一されたログ管理クラス
 */
class Logger {
    constructor(name, level = LOG_LEVEL.INFO) {
        this.name = name;
        this.level = level;
    }

    /**
     * タイムスタンプを取得
     * @returns {string} タイムスタンプ
     */
    getTimestamp() {
        return new Date().toISOString().split('T')[1].split('.')[0];
    }

    /**
     * ログメッセージをフォーマット
     * @param {string} levelName - ログレベル名
     * @param {string} message - メッセージ
     * @returns {string} フォーマットされたメッセージ
     */
    formatMessage(levelName, message) {
        const timestamp = this.getTimestamp();
        return `[${this.name} ${timestamp}] ${levelName}: ${message}`;
    }

    /**
     * エラーログ
     * @param {string} message - メッセージ
     * @param {*} data - 追加データ
     */
    error(message, data = null) {
        if (this.level < LOG_LEVEL.ERROR) return;
        const msg = this.formatMessage('ERROR', message);
        if (data) {
            console.error(`%c${msg}`, 'color: #F44336; font-weight: bold', data);
        } else {
            console.error(`%c${msg}`, 'color: #F44336; font-weight: bold');
        }
    }

    /**
     * 警告ログ
     * @param {string} message - メッセージ
     * @param {*} data - 追加データ
     */
    warn(message, data = null) {
        if (this.level < LOG_LEVEL.WARN) return;
        const msg = this.formatMessage('WARN', message);
        if (data) {
            console.warn(`%c${msg}`, 'color: #FF9800; font-weight: bold', data);
        } else {
            console.warn(`%c${msg}`, 'color: #FF9800; font-weight: bold');
        }
    }

    /**
     * 情報ログ
     * @param {string} message - メッセージ
     * @param {*} data - 追加データ
     */
    info(message, data = null) {
        if (this.level < LOG_LEVEL.INFO) return;
        const msg = this.formatMessage('INFO', message);
        if (data) {
            console.log(`%c${msg}`, 'color: #4CAF50; font-weight: bold', data);
        } else {
            console.log(`%c${msg}`, 'color: #4CAF50; font-weight: bold');
        }
    }

    /**
     * デバッグログ
     * @param {string} message - メッセージ
     * @param {*} data - 追加データ
     */
    debug(message, data = null) {
        if (this.level < LOG_LEVEL.DEBUG) return;
        const msg = this.formatMessage('DEBUG', message);
        if (data) {
            console.log(msg, data);
        } else {
            console.log(msg);
        }
    }

    /**
     * ログレベルを設定
     * @param {number} level - ログレベル
     */
    setLevel(level) {
        this.level = level;
    }
}

module.exports = { Logger, LOG_LEVEL };
