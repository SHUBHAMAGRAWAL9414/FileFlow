import os
import sqlite3
import mimetypes
from datetime import datetime
from functools import wraps
from flask import Flask, request, render_template, send_from_directory, jsonify, session, redirect, url_for
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from flask_socketio import SocketIO, emit

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'docx', 'xlsx', 'pptx', 'mp4'}

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB max upload size
app.config['SECRET_KEY'] = 'your-secret-key-here'  # Change this for production
app.config['SESSION_COOKIE_NAME'] = 'file_share_session'

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Database setup
def init_db():
    conn = sqlite3.connect('file_share.db')
    c = conn.cursor()
    
    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  password TEXT)''')
    
    # Messages table
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  username TEXT,
                  message TEXT,
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(user_id) REFERENCES users(id))''')
    
    # Add admin user if not exists
    try:
        c.execute("INSERT INTO users (username, password) VALUES (?, ?)",
                  ('admin', generate_password_hash('admin123')))
    except sqlite3.IntegrityError:
        pass
    
    conn.commit()
    conn.close()

init_db()

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Auth routes
@app.route('/')
def index():
    if 'user_id' in session:
        return render_template("app.html")
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        if 'user_id' in session:
            return redirect(url_for('index'))
        return render_template("login.html")
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received'}), 400
        
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    conn = sqlite3.connect('file_share.db')
    c = conn.cursor()
    c.execute("SELECT id, password FROM users WHERE username = ?", (username,))
    user = c.fetchone()
    conn.close()
    
    if not user or not check_password_hash(user[1], password):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    session['user_id'] = user[0]
    session['username'] = username
        
    return jsonify({
        'message': 'Login successful',
        'user_id': user[0],
        'username': username
    })

@app.route('/logout')
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received'}), 400
        
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    
    conn = sqlite3.connect('file_share.db')
    c = conn.cursor()
    
    try:
        hashed_password = generate_password_hash(password)
        c.execute("INSERT INTO users (username, password) VALUES (?, ?)", 
                 (username, hashed_password))
        user_id = c.lastrowid
        conn.commit()
        
        session['user_id'] = user_id
        session['username'] = username
        
        return jsonify({
            'message': 'User registered successfully',
            'user_id': user_id,
            'username': username
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 400
    finally:
        conn.close()

# File sharing functions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_file_metadata(filename):
    path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    try:
        stat = os.stat(path)
        file_type, _ = mimetypes.guess_type(filename)
        
        # Get icon based on file extension
        ext = filename.split('.')[-1].lower()
        icon = '📁'  # Default icon
        
        icon_mapping = {
            'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️',
            'pdf': '📄',
            'txt': '📝', 'csv': '📝', 'json': '📝',
            'docx': '📑', 'doc': '📑',
            'xlsx': '📊', 'xls': '📊',
            'pptx': '📊', 'ppt': '📊',
            'mp4': '🎬'
        }
        
        icon = icon_mapping.get(ext, '📁')
        
        return {
            "name": filename,
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "type": file_type or 'application/octet-stream',
            "icon": icon
        }
    except Exception as e:
        print(f"Error getting metadata for {filename}: {e}")
        return None

# File sharing routes
@app.route("/files")
@login_required
def list_files():
    try:
        files = []
        for filename in os.listdir(app.config["UPLOAD_FOLDER"]):
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            if os.path.isfile(filepath):
                metadata = get_file_metadata(filename)
                if metadata:
                    files.append(metadata)
        
        return jsonify(files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/upload", methods=["POST"])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    files = request.files.getlist("file")
    uploaded_files = []
    errors = []

    for file in files:
        if file.filename == '':
            errors.append("No selected file")
            continue

        if file and allowed_file(file.filename):
            try:
                filename = secure_filename(file.filename)
                filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
                
                # Ensure unique filename
                counter = 1
                while os.path.exists(filepath):
                    name, ext = os.path.splitext(filename)
                    filename = f"{name}_{counter}{ext}"
                    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
                    counter += 1
                
                file.save(filepath)
                uploaded_files.append(filename)
            except Exception as e:
                errors.append(f"Failed to save {file.filename}: {str(e)}")
        else:
            errors.append(f"File type not allowed: {file.filename}")

    if errors:
        return jsonify({
            "message": "Some files failed to upload",
            "files": uploaded_files,
            "errors": errors
        }), 207

    return jsonify({
        "message": "Files uploaded successfully!",
        "files": uploaded_files
    })

@app.route("/download/<filename>")
@login_required
def download_file(filename):
    try:
        return send_from_directory(
            app.config["UPLOAD_FOLDER"],
            filename,
            as_attachment=True
        )
    except FileNotFoundError:
        return jsonify({"error": "File not found"}), 404

# Chat routes
@app.route('/chat')
@login_required
def chat_page():
    return render_template("chat.html")

@app.route('/chat/history')
@login_required
def chat_history():
    conn = sqlite3.connect('file_share.db')
    c = conn.cursor()
    c.execute('''SELECT username, message, timestamp 
                 FROM messages 
                 ORDER BY timestamp DESC 
                 LIMIT 100''')
    messages = [{'username': row[0], 'message': row[1], 'timestamp': row[2]} 
                for row in c.fetchall()]
    conn.close()
    return jsonify(messages[::-1])

# SocketIO Events
connected_users = set()

@socketio.on('connect')
def handle_connect():
    if 'user_id' in session:
        connected_users.add(session['user_id'])
        emit('online_count', {'count': len(connected_users)}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        connected_users.discard(session['user_id'])
    emit('online_count', {'count': len(connected_users)}, broadcast=True)

@socketio.on('new_message')
def handle_new_message(data):
    if 'user_id' not in session:
        return
    
    username = session['username']
    user_id = session['user_id']
    message = data.get('message')  # Fixed: use parentheses instead of square brackets
    
    # Save to database
    conn = sqlite3.connect('file_share.db')
    c = conn.cursor()
    c.execute("INSERT INTO messages (user_id, username, message) VALUES (?, ?, ?)",
              (user_id, username, message))
    conn.commit()
    conn.close()
    
    # Broadcast to all clients
    emit('message_received', {
        'username': username,
        'message': message,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }, broadcast=True)

@socketio.on('typing')
def handle_typing(data):
    if 'username' in session:
        emit('user_typing', {
            'username': session['username'],
            'isTyping': data.get('isTyping', True)  # Default to True if not specified
        }, broadcast=True)

@socketio.on('stopped_typing')
def handle_stopped_typing(data=None):  # Add data parameter with default None
    if 'username' in session:
        emit('user_stopped_typing', {
            'username': session['username']
        }, broadcast=True)
        
@socketio.on('clear_chat')
def handle_clear_chat():
    if 'user_id' not in session:
        return
    
    try:
        conn = sqlite3.connect('file_share.db')
        c = conn.cursor()
        
        # Delete all messages
        c.execute("DELETE FROM messages")
        
        # Reset auto-increment counter (SQLite specific)
        c.execute("DELETE FROM sqlite_sequence WHERE name='messages'")
        
        conn.commit()
        conn.close()
        
        # Notify all clients via SocketIO
        emit('chat_cleared', {'username': session['username']}, broadcast=True)
    except Exception as e:
        print(f"Error clearing chat: {e}")

@app.route('/chat/clear', methods=['DELETE'])
@login_required
def clear_chat_history():
    try:
        conn = sqlite3.connect('file_share.db')
        c = conn.cursor()
        
        # Delete all messages
        c.execute("DELETE FROM messages")
        
        # Reset auto-increment counter (SQLite specific)
        c.execute("DELETE FROM sqlite_sequence WHERE name='messages'")
        
        conn.commit()
        conn.close()
        
        # Notify all clients via SocketIO
        socketio.emit('chat_cleared', {'username': session['username']}, broadcast=True)
        
        return jsonify({'success': True, 'message': 'Chat history cleared'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == "__main__":
    mimetypes.init()
    socketio.run(app, host="0.0.0.0", port=5001, debug=True)