# エンジン接続スクリプト
# 使用方法: .\connect-engine.ps1

$serverUrl = "http://localhost:8080"
$enginePath = ".\dlshogi-dr2_exhi\dlshogi_tensorrt.exe"

Write-Host "========================================"
Write-Host "USIエンジン接続スクリプト"
Write-Host "========================================"
Write-Host ""

# サーバーの状態確認
Write-Host "[1/4] サーバーの状態を確認中..."
try {
    $health = Invoke-RestMethod -Uri "$serverUrl/health" -Method GET -TimeoutSec 2
    Write-Host "✓ サーバーは起動しています"
    Write-Host "  状態: $($health.status)"
    Write-Host "  エンジン起動中: $($health.engineRunning)"
    Write-Host "  エンジン準備完了: $($health.engineReady)"
    Write-Host ""
} catch {
    Write-Host "✗ エラー: サーバーに接続できません"
    Write-Host ""
    Write-Host "【対処方法】"
    Write-Host "1. 別のターミナルでサーバーを起動してください:"
    Write-Host "   cd d:\Cursor\ShogiServer"
    Write-Host "   npm start"
    Write-Host ""
    Write-Host "2. または、環境変数を設定してサーバーを起動:"
    Write-Host "   `$env:ENGINE_PATH='.\dlshogi-dr2_exhi\dlshogi_tensorrt.exe'"
    Write-Host "   npm start"
    Write-Host ""
    Write-Host "3. サーバーが起動したら、このスクリプトを再度実行してください"
    Write-Host ""
    Write-Host "サーバーURL: $serverUrl"
    exit 1
}

# エンジンが既に起動している場合
if ($health.engineRunning) {
    Write-Host "[2/4] エンジンは既に起動しています"
    if ($health.engineReady) {
        Write-Host "✓ エンジンは準備完了です"
        Write-Host "  エンジン名: $($health.engineName)"
        exit 0
    } else {
        Write-Host "  エンジンを初期化中..."
    }
} else {
    # エンジン接続
    Write-Host "[2/4] エンジンを接続中..."
    $connectBody = @{
        enginePath = $enginePath
    } | ConvertTo-Json

    try {
        $connectResult = Invoke-RestMethod -Uri "$serverUrl/usi/connect" `
            -Method POST `
            -ContentType "application/json" `
            -Body $connectBody

        Write-Host "✓ エンジン接続リクエストを送信しました"
        Write-Host "  メッセージ: $($connectResult.message)"
        Write-Host ""
        
        # エンジン起動を待機
        Write-Host "  エンジンの起動を待機中..."
        Start-Sleep -Seconds 3
    } catch {
        Write-Host "✗ エラー: エンジンの接続に失敗しました"
        Write-Host "  エラーメッセージ: $($_.Exception.Message)"
        exit 1
    }
}

# エンジン初期化
Write-Host "[3/4] エンジンを初期化中..."
try {
    $initResult = Invoke-RestMethod -Uri "$serverUrl/usi/usi" `
        -Method POST `
        -ContentType "application/json"

    if ($initResult.ready) {
        Write-Host "✓ エンジンの初期化が完了しました"
        Write-Host "  エンジン名: $($initResult.name)"
        Write-Host "  作者: $($initResult.author)"
        Write-Host ""
    } else {
        Write-Host "✗ エラー: エンジンの初期化がタイムアウトしました"
        exit 1
    }
} catch {
    Write-Host "✗ エラー: エンジンの初期化に失敗しました"
    Write-Host "  エラーメッセージ: $($_.Exception.Message)"
    exit 1
}

# 最終状態確認
Write-Host "[4/4] 最終状態を確認中..."
try {
    $finalHealth = Invoke-RestMethod -Uri "$serverUrl/health" -Method GET
    
    Write-Host "========================================"
    Write-Host "接続完了"
    Write-Host "========================================"
    Write-Host "状態: $($finalHealth.status)"
    Write-Host "エンジン起動中: $($finalHealth.engineRunning)"
    Write-Host "エンジン準備完了: $($finalHealth.engineReady)"
    Write-Host "エンジン名: $($finalHealth.engineName)"
    Write-Host ""
    
    if ($finalHealth.engineReady) {
        Write-Host "✓ エンジンは使用可能です"
        Write-Host "  将棋ゲームで「USIエンジン」を選択してください"
    } else {
        Write-Host "⚠ 警告: エンジンは起動していますが、準備が完了していません"
    }
} catch {
    Write-Host "✗ エラー: 状態確認に失敗しました"
    exit 1
}
