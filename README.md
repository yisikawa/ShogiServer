# USIサーバー

将棋エンジンとHTTP APIの橋渡しを行うUSIサーバーです。ブラウザからUSIプロトコルを使用する将棋エンジンと通信するために使用します。

## 機能

- USIプロトコルで将棋エンジンと通信
- HTTP APIを提供（CORS対応）
- エンドポイント:
  - `POST /usi/connect` - サーバーに接続
  - `POST /usi/usi` - エンジンを初期化
  - `POST /usi/position` - 局面を設定（SFEN形式）
  - `POST /usi/go` - 思考開始
  - `POST /usi/quit` - 接続を切断
  - `GET /health` - ヘルスチェック

## セットアップ

### Node.js版

1. 依存パッケージをインストール:
   ```bash
   npm install
   ```

2. サーバーを起動:
   ```bash
   npm start
   ```

   または、エンジンパスを指定:
   ```bash
   ENGINE_PATH=./your_engine.exe node server.js
   ```

### Python版

1. 依存パッケージをインストール:
   ```bash
   pip install -r requirements.txt
   ```

2. サーバーを起動:
   ```bash
   python server.py
   ```

   または、エンジンパスを指定:
   ```bash
   ENGINE_PATH=./your_engine.exe python server.py
   ```

## 使用方法

1. USI対応の将棋エンジンを用意
   - 例: [やねうら王](https://github.com/yaneurao/YaneuraOu)、[elmo](https://github.com/HiraokaTakuya/elmo) など

2. サーバーを起動（デフォルトポート: 8080）

3. ブラウザで将棋ゲームを開き、「AI強さ」から「USIエンジン」を選択

4. 必要に応じてUSIサーバーURLを設定（デフォルト: `http://localhost:8080`）

## エンジンパスの指定方法

### 環境変数で指定
```bash
# Node.js
ENGINE_PATH=./engine.exe node server.js

# Python
ENGINE_PATH=./engine.exe python server.py
```

### リクエストで指定
```json
POST /usi/connect
{
  "enginePath": "./path/to/engine.exe"
}
```

## 注意事項

- USI対応の将棋エンジンが必要です
- エンジンはUSIプロトコルを完全にサポートしている必要があります
- エラー時は自動的に中級AIにフォールバックします
- CORSは自動的に有効化されています

## トラブルシューティング

### エンジンが起動しない
- エンジンのパスが正しいか確認してください
- エンジンが実行可能なファイルか確認してください
- エンジンのログを確認してください

### 思考がタイムアウトする
- エンジンの処理速度を確認してください
- `timeLimit`パラメータを調整してください

### CORSエラーが発生する
- サーバーのCORS設定を確認してください（デフォルトで有効）
- ブラウザのコンソールでエラーメッセージを確認してください

## ライセンス

MIT License


