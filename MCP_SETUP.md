# Chrome DevTools MCP サーバー設定

chrome-devtools-mcpをMCPサーバーとして設定する方法です。

## Cursorでの設定方法

### 方法1: Cursor設定UIから設定

1. Cursorを開く
2. 設定（Settings）を開く（`Ctrl+,` または `Cmd+,`）
3. 「MCP Servers」または「Model Context Protocol」を検索
4. 「Add Server」をクリック
5. 以下の情報を入力：
   - **Name**: `chrome-devtools`
   - **Command**: `npx`
   - **Args**: `-y chrome-devtools-mcp@latest`
   - **Env**: （空のまま）

### 方法2: 設定ファイルを直接編集

CursorのMCP設定ファイルを直接編集します。

#### Windowsの場合

設定ファイルの場所：
```
%APPDATA%\Cursor\User\globalStorage\rooveterinaryinc.roo-cline\settings\cline_mcp_settings.json
```

または：
```
%USERPROFILE%\.cursor\mcp.json
```

#### macOS/Linuxの場合

設定ファイルの場所：
```
~/.cursor/mcp.json
```

または：
```
~/Library/Application Support/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json
```

#### 設定内容

以下のJSONを設定ファイルに追加または更新：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest"
      ],
      "env": {}
    }
  }
}
```

## 使用方法

設定後、Cursorを再起動すると、chrome-devtools-mcpがMCPサーバーとして利用可能になります。

### 利用可能な機能

- ブラウザのインスペクション
- デバッグ
- ページの操作
- スクリーンショット取得
- ネットワークリクエストの監視

## 注意事項

⚠️ **セキュリティ警告**: 
chrome-devtools-mcpはブラウザインスタンスの内容をMCPクライアントに公開します。機密情報や個人情報を含むデータを共有しないよう注意してください。

## トラブルシューティング

### MCPサーバーが起動しない

1. Node.jsがインストールされているか確認：
   ```bash
   node --version
   npm --version
   ```

2. npxが利用可能か確認：
   ```bash
   npx --version
   ```

3. 手動で実行してエラーを確認：
   ```bash
   npx -y chrome-devtools-mcp@latest
   ```

### 設定が反映されない

1. Cursorを完全に再起動
2. 設定ファイルのJSON構文を確認
3. 設定ファイルのパスが正しいか確認

## 参考リンク

- [chrome-devtools-mcp GitHub](https://github.com/modelcontextprotocol/servers/tree/main/src/chrome-devtools-mcp)
- [MCP Documentation](https://modelcontextprotocol.io/)



