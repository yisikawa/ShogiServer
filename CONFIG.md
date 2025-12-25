# コンフィグファイル設定ガイド

## 概要

`config.json`ファイルを使用して、複数のUSIサーバーを異なるポートで起動できます。

## コンフィグファイルの場所

```
ShogiServer/config.json
```

## コンフィグファイルの形式

```json
{
  "servers": [
    {
      "name": "server1",
      "port": 8080,
      "enginePath": "./dlshogi-dr2_exhi/dlshogi_tensorrt.exe",
      "autoConnect": true
    },
    {
      "name": "server2",
      "port": 8081,
      "enginePath": "./dlshogi-dr2_exhi/dlshogi_tensorrt.exe",
      "autoConnect": false
    },
    {
      "name": "server3",
      "port": 8082,
      "enginePath": "",
      "autoConnect": false
    }
  ]
}
```

## 設定項目の説明

### `name` (必須)
- サーバーの名前（識別用）
- ログ出力で使用されます

### `port` (必須)
- サーバーがリッスンするポート番号
- 各サーバーは異なるポートを指定する必要があります
- 例: 8080, 8081, 8082

### `enginePath` (オプション)
- USIエンジンのパス
- 相対パスまたは絶対パスを指定できます
- 空文字列の場合は、後でAPI経由で接続できます
- 例: `"./dlshogi-dr2_exhi/dlshogi_tensorrt.exe"`

### `autoConnect` (オプション)
- サーバー起動時に自動的にエンジンを接続するかどうか
- `true`: 起動時に自動接続（`enginePath`が指定されている必要があります）
- `false`: 手動でAPI経由で接続

## 使用例

### 例1: 3つのサーバーを異なるポートで起動

```json
{
  "servers": [
    {
      "name": "primary",
      "port": 8080,
      "enginePath": "./engine1.exe",
      "autoConnect": true
    },
    {
      "name": "secondary",
      "port": 8081,
      "enginePath": "./engine2.exe",
      "autoConnect": true
    },
    {
      "name": "manual",
      "port": 8082,
      "enginePath": "",
      "autoConnect": false
    }
  ]
}
```

### 例2: 同じエンジンを複数のポートで起動

```json
{
  "servers": [
    {
      "name": "server1",
      "port": 8080,
      "enginePath": "./dlshogi-dr2_exhi/dlshogi_tensorrt.exe",
      "autoConnect": true
    },
    {
      "name": "server2",
      "port": 8081,
      "enginePath": "./dlshogi-dr2_exhi/dlshogi_tensorrt.exe",
      "autoConnect": true
    }
  ]
}
```

**注意**: 同じエンジンファイルを複数のサーバーで使用する場合、各サーバーは独立したエンジンプロセスを起動します。

## サーバーの起動

```bash
cd d:\Cursor\ShogiServer
node server.js
```

または

```bash
npm start
```

## サーバーの確認

各サーバーのヘルスチェックエンドポイントにアクセスして確認できます：

```bash
# サーバー1
curl http://localhost:8080/health

# サーバー2
curl http://localhost:8081/health

# サーバー3
curl http://localhost:8082/health
```

## エンジンの手動接続

`autoConnect: false`のサーバーにエンジンを接続する場合：

```bash
curl -X POST http://localhost:8082/usi/connect \
  -H "Content-Type: application/json" \
  -d '{"enginePath": "./dlshogi-dr2_exhi/dlshogi_tensorrt.exe"}'
```

## コンフィグファイルがない場合

コンフィグファイルが存在しない場合、デフォルト設定が使用されます：
- ポート: 8080
- エンジンパス: 環境変数`ENGINE_PATH`（設定されていない場合は空）
- 自動接続: `ENGINE_PATH`が設定されている場合のみ`true`
