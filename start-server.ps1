# USIサーバー起動スクリプト
# 使用方法: .\start-server.ps1

Write-Host "========================================"
Write-Host "USIサーバー起動スクリプト"
Write-Host "========================================"
Write-Host ""

$enginePath = ".\dlshogi-dr2_exhi\dlshogi_tensorrt.exe"

# エンジンファイルの存在確認
if (Test-Path $enginePath) {
    # 絶対パスに変換（DLLの読み込み問題を回避）
    $absolutePath = Resolve-Path $enginePath
    Write-Host "✓ エンジンファイルが見つかりました: $absolutePath"
    Write-Host ""
    Write-Host "環境変数 ENGINE_PATH を設定してサーバーを起動します..."
    Write-Host "サーバー起動後、自動的にエンジンが接続されます。"
    Write-Host ""
    $env:ENGINE_PATH = $absolutePath
} else {
    Write-Host "⚠ 警告: エンジンファイルが見つかりません: $enginePath"
    Write-Host "   環境変数 ENGINE_PATH は設定されません"
    Write-Host "   後で手動でエンジンを接続してください"
    Write-Host ""
    Write-Host "   接続方法:"
    Write-Host "   .\connect-engine.ps1"
    Write-Host ""
}

Write-Host "サーバーを起動しています..."
Write-Host "停止するには Ctrl+C を押してください"
Write-Host ""
Write-Host "========================================"
Write-Host ""

# サーバーを起動（バックグラウンドで起動）
$job = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    if ($using:env:ENGINE_PATH) {
        $env:ENGINE_PATH = $using:env:ENGINE_PATH
    }
    npm start
}

Write-Host "サーバーをバックグラウンドで起動しました。"
Write-Host "接続を確認するまで少しお待ちください..."
Start-Sleep -Seconds 3

# サーバーの起動を確認
$serverUrl = "http://localhost:8080"
try {
    $health = Invoke-RestMethod -Uri "$serverUrl/health" -Method GET -TimeoutSec 2
    Write-Host ""
    Write-Host "✓ サーバーが正常に起動しました！"
    Write-Host "  状態: $($health.status)"
    Write-Host ""
    
    if ($env:ENGINE_PATH) {
        Write-Host "エンジンの自動接続を待機中..."
        Start-Sleep -Seconds 2
        
        $health2 = Invoke-RestMethod -Uri "$serverUrl/health" -Method GET -TimeoutSec 2
        if ($health2.engineRunning) {
            Write-Host "✓ エンジンが接続されました！"
            Write-Host "  エンジン名: $($health2.engineName)"
        } else {
            Write-Host "⚠ エンジンはまだ接続されていません"
            Write-Host "   接続スクリプトを実行してください: .\connect-engine.ps1"
        }
    }
    
    Write-Host ""
    Write-Host "サーバーはバックグラウンドで実行中です。"
    Write-Host "停止するには: Stop-Job -Id $($job.Id); Remove-Job -Id $($job.Id)"
    Write-Host ""
    Write-Host "サーバーログを確認するには:"
    Write-Host "  Receive-Job -Id $($job.Id) -Keep"
    Write-Host ""
    
    # ログを表示
    Write-Host "=== サーバーログ ==="
    Receive-Job -Id $job.Id
    
} catch {
    Write-Host ""
    Write-Host "⚠ 警告: サーバーの起動確認に失敗しました"
    Write-Host "   サーバーは起動中かもしれません。しばらく待ってから再度確認してください。"
    Write-Host ""
    Write-Host "   ログを確認: Receive-Job -Id $($job.Id) -Keep"
}

Write-Host ""
Write-Host "このウィンドウを閉じるとサーバーは停止します。"
Write-Host "サーバーを停止するには Ctrl+C を押してください。"
Write-Host ""

# ログを監視
try {
    while ($true) {
        Start-Sleep -Seconds 1
        $log = Receive-Job -Id $job.Id -ErrorAction SilentlyContinue
        if ($log) {
            Write-Host $log
        }
    }
} finally {
    Stop-Job -Id $job.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $job.Id -ErrorAction SilentlyContinue
}

