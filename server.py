# USIサーバー - Python版
# 将棋エンジンとHTTP APIの橋渡しを行う

from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import threading
import queue
import os
import signal
import sys

app = Flask(__name__)
CORS(app)

# USIエンジンのプロセス管理
engine_process = None
engine_ready = False
engine_name = ''
engine_author = ''
current_position = None
current_moves = []
bestmove_queue = queue.Queue()
bestmove_timeout = None

def start_engine(engine_path='engine.exe'):
    """USIエンジンを起動"""
    global engine_process, engine_ready, engine_name, engine_author
    
    if engine_process:
        print('エンジンは既に起動しています')
        return
    
    print(f'エンジンを起動: {engine_path}')
    try:
        engine_process = subprocess.Popen(
            [engine_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # エンジン出力を読み取るスレッドを起動
        threading.Thread(target=read_engine_output, daemon=True).start()
        
    except Exception as e:
        print(f'エンジン起動エラー: {e}')
        engine_process = None
        engine_ready = False

def read_engine_output():
    """エンジンからの出力を読み取る"""
    global engine_ready, engine_name, engine_author
    
    if not engine_process:
        return
    
    try:
        for line in engine_process.stdout:
            line = line.strip()
            if not line:
                continue
            
            print(f'← エンジン: {line}')
            
            if line.startswith('id name '):
                engine_name = line[8:]
            elif line.startswith('id author '):
                engine_author = line[10:]
            elif line == 'usiok':
                engine_ready = True
            elif line.startswith('bestmove '):
                bestmove = line[9:].split()[0]
                bestmove_queue.put(bestmove)
    except Exception as e:
        print(f'エンジン出力読み取りエラー: {e}')

def send_command(command):
    """エンジンにコマンドを送信"""
    global engine_process
    
    if not engine_process:
        print('エンジンが起動していません')
        return False
    
    print(f'→ エンジン: {command}')
    try:
        engine_process.stdin.write(command + '\n')
        engine_process.stdin.flush()
        return True
    except Exception as e:
        print(f'コマンド送信エラー: {e}')
        return False

@app.route('/usi/connect', methods=['POST'])
def connect():
    """接続エンドポイント"""
    data = request.get_json() or {}
    engine_path = data.get('enginePath', os.getenv('ENGINE_PATH', 'engine.exe'))
    
    if not engine_process:
        start_engine(engine_path)
    
    return jsonify({
        'connected': True,
        'message': 'USIサーバーに接続しました'
    })

@app.route('/usi/usi', methods=['POST'])
def usi():
    """USI初期化エンドポイント"""
    global engine_ready
    
    if not engine_process:
        return jsonify({'error': 'エンジンが起動していません'}), 500
    
    if engine_ready:
        return jsonify({
            'ready': True,
            'name': engine_name,
            'author': engine_author
        })
    
    # USIコマンドを送信
    if not send_command('usi'):
        return jsonify({'error': 'コマンド送信に失敗しました'}), 500
    
    # エンジンが準備完了するまで待機（最大5秒）
    import time
    timeout = time.time() + 5
    while not engine_ready and time.time() < timeout:
        time.sleep(0.1)
    
    if engine_ready:
        return jsonify({
            'ready': True,
            'name': engine_name,
            'author': engine_author
        })
    else:
        return jsonify({'error': 'エンジンの初期化がタイムアウトしました'}), 500

@app.route('/usi/position', methods=['POST'])
def position():
    """局面設定エンドポイント"""
    global current_position, current_moves
    
    if not engine_process or not engine_ready:
        return jsonify({'error': 'エンジンが準備できていません'}), 500
    
    data = request.get_json()
    sfen = data.get('sfen')
    moves = data.get('moves', [])
    
    if not sfen:
        return jsonify({'error': 'SFENが指定されていません'}), 400
    
    current_position = sfen
    current_moves = moves
    
    # positionコマンドを構築
    command = f'position sfen {sfen}'
    if moves:
        command += ' moves ' + ' '.join(moves)
    
    if not send_command(command):
        return jsonify({'error': 'コマンド送信に失敗しました'}), 500
    
    return jsonify({
        'success': True,
        'message': '局面を設定しました'
    })

@app.route('/usi/go', methods=['POST'])
def go():
    """思考開始エンドポイント"""
    if not engine_process or not engine_ready:
        return jsonify({'error': 'エンジンが準備できていません'}), 500
    
    data = request.get_json() or {}
    time_limit = data.get('timeLimit', 5000)
    
    # 既存のキューをクリア
    while not bestmove_queue.empty():
        try:
            bestmove_queue.get_nowait()
        except queue.Empty:
            break
    
    # goコマンドを送信
    byoyomi = max(1, int(time_limit / 1000))
    if not send_command(f'go byoyomi {byoyomi}'):
        return jsonify({'error': 'コマンド送信に失敗しました'}), 500
    
    # 最善手を待機（タイムアウト付き）
    try:
        bestmove = bestmove_queue.get(timeout=(time_limit / 1000) + 1)
        return jsonify({
            'bestmove': bestmove,
            'position': current_position
        })
    except queue.Empty:
        return jsonify({'error': '思考がタイムアウトしました'}), 500

@app.route('/usi/quit', methods=['POST'])
def quit():
    """切断エンドポイント"""
    global engine_process, engine_ready
    
    if engine_process:
        send_command('quit')
        import time
        time.sleep(1)
        if engine_process:
            engine_process.terminate()
            engine_process.wait()
            engine_process = None
    
    engine_ready = False
    
    return jsonify({
        'success': True,
        'message': '接続を切断しました'
    })

@app.route('/health', methods=['GET'])
def health():
    """ヘルスチェックエンドポイント"""
    return jsonify({
        'status': 'ok',
        'engineRunning': engine_process is not None,
        'engineReady': engine_ready,
        'engineName': engine_name
    })

def cleanup():
    """クリーンアップ処理"""
    global engine_process
    if engine_process:
        send_command('quit')
        import time
        time.sleep(1)
        if engine_process:
            engine_process.terminate()
            engine_process.wait()

def signal_handler(sig, frame):
    """シグナルハンドラ"""
    print('\nサーバーを終了します...')
    cleanup()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

if __name__ == '__main__':
    print('USIサーバーが起動しました: http://localhost:8080')
    print('エンジンパスを環境変数 ENGINE_PATH で指定できます')
    print('例: ENGINE_PATH=./engine.exe python server.py')
    app.run(host='0.0.0.0', port=8080, debug=False)



