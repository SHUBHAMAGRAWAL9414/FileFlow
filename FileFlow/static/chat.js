document.addEventListener("DOMContentLoaded", function() {
    const state = {
        socket: null,
        isTyping: false,
        typingTimeout: null,
        onlineUsers: 0
    };

    // Initialize Socket Connection
    initSocketConnection();

    // Setup event listeners
    document.getElementById('chatInput').addEventListener('input', handleTyping);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('searchMessages').addEventListener('input', searchMessages);
    
    // File upload functionality
    document.getElementById('fileUploadBtn').addEventListener('click', () => {
        document.getElementById('chatFileInput').click();
    });
    document.getElementById('chatFileInput').addEventListener('change', handleChatFileUpload);

    // Clear chat functionality
    document.getElementById('clearChatBtn').addEventListener('click', showClearConfirmation);

    function initSocketConnection() {
        state.socket = io({
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            transports: ['websocket', 'polling']
        });
        
        // Connection established
        state.socket.on('connect', () => {
            console.log('Socket connected');
            loadChatHistory();
        });
        
        // Message received
        state.socket.on('message_received', (data) => {
            addMessage(data.username, data.message, data.timestamp, data.username === '{{ session["username"] }}');
        });
        
        // User typing indicator
        state.socket.on('user_typing', (data) => {
            if (data.username !== '{{ session["username"] }}') {
                showTypingIndicator(data.username);
            }
        });
        
        // User stopped typing
        state.socket.on('user_stopped_typing', () => {
            hideTypingIndicator();
        });
        
        // Online count update
        state.socket.on('online_count', (data) => {
            state.onlineUsers = data.count;
            updateOnlineCount();
        });
        
        // Chat cleared notification
        state.socket.on('chat_cleared', (data) => {
            document.getElementById('chatMessages').innerHTML = '';
            showNotification(`${data.username} cleared the chat history`);
        });
    }

    async function loadChatHistory() {
        try {
            const response = await fetch('/chat/history');
            const messages = await response.json();
            
            const container = document.getElementById('chatMessages');
            container.innerHTML = '';
            
            messages.forEach(msg => {
                const isOwn = msg.username === '{{ session["username"] }}';
                addMessage(msg.username, msg.message, msg.timestamp, isOwn);
            });
            
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    function searchMessages() {
        const searchTerm = document.getElementById('searchMessages').value.toLowerCase();
        const messages = document.querySelectorAll('.message');
        
        messages.forEach(message => {
            const text = message.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                message.style.display = 'flex';
                // Highlight matching text
                const textElements = message.querySelectorAll('.message-text');
                textElements.forEach(el => {
                    el.innerHTML = el.textContent.replace(
                        new RegExp(searchTerm, 'gi'),
                        match => `<span class="highlight">${match}</span>`
                    );
                });
            } else {
                message.style.display = 'none';
            }
        });
    }

    function sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message) {
            // Emit message to server
            state.socket.emit('new_message', {
                message: message
            });
            
            // Clear input
            input.value = '';
            
            // Stop typing indicator
            state.socket.emit('stopped_typing');
            state.isTyping = false;
        }
    }

    function addMessage(username, message, timestamp, isOwn) {
        const container = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'sent' : 'received'}`;
        
        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="message-content">
                ${!isOwn ? `
                <div class="message-info">
                    <div class="message-username">${username}</div>
                    <div class="message-time">${timeStr}</div>
                </div>
                ` : ''}
                <div class="message-text">${message}</div>
                ${isOwn ? `
                <div class="message-info" style="justify-content: flex-end; margin-top: 5px;">
                    <div class="message-time">${timeStr}</div>
                </div>
                ` : ''}
            </div>
        `;
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    async function handleChatFileUpload(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('file', files[i]);
        }

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (response.ok) {
                // For each uploaded file, send a message with the file link
                const isOwn = true;
                result.files.forEach(filename => {
                    const fileUrl = `/download/${filename}`;
                    const fileIcon = getFileIcon(filename);
                    
                    // Emit message with file link
                    state.socket.emit('new_message', {
                        message: `<div class="file-message">
                                    <a href="${fileUrl}" target="_blank" style="color: ${isOwn ? 'white' : 'var(--primary)'};">
                                        ${fileIcon}
                                        ${filename}
                                    </a>
                                </div>`
                    });
                });
            } else {
                console.error('File upload failed:', result.error);
            }
        } catch (error) {
            console.error('Error uploading file:', error);
        } finally {
            // Reset file input
            e.target.value = '';
        }
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️',
            'pdf': '📄',
            'txt': '📝', 'csv': '📝', 'json': '📝',
            'docx': '📑', 'doc': '📑',
            'xlsx': '📊', 'xls': '📊',
            'pptx': '📊', 'ppt': '📊',
            'mp4': '🎬'
        };
        return icons[ext] || '📁';
    }

    function showClearConfirmation() {
        const dialog = document.createElement('div');
        dialog.className = 'confirmation-dialog';
        dialog.innerHTML = `
            <div class="confirmation-box">
                <h3>Clear Chat History</h3>
                <p>Are you sure you want to delete all chat messages? This action cannot be undone.</p>
                <div class="confirmation-buttons">
                    <button id="confirmClear" class="btn-danger">Delete All</button>
                    <button id="cancelClear" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        document.getElementById('confirmClear').addEventListener('click', () => {
            state.socket.emit('clear_chat');
            dialog.remove();
        });
        
        document.getElementById('cancelClear').addEventListener('click', () => {
            dialog.remove();
        });
    }

    function showNotification(message) {
        const container = document.getElementById('chatMessages');
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        container.appendChild(notification);
    }

    function handleTyping() {
        const input = document.getElementById('chatInput');
        
        if (input.value.trim() && !state.isTyping) {
            state.isTyping = true;
            state.socket.emit('typing', { username: '{{ session["username"] }}' });
        } else if (!input.value.trim() && state.isTyping) {
            state.isTyping = false;
            state.socket.emit('stopped_typing');
        }
        
        if (state.typingTimeout) clearTimeout(state.typingTimeout);
        
        state.typingTimeout = setTimeout(() => {
            if (state.isTyping) {
                state.isTyping = false;
                state.socket.emit('stopped_typing');
            }
        }, 2000);
    }

    function showTypingIndicator(username) {
        const indicator = document.getElementById('typingIndicator');
        const typingText = document.getElementById('typingText');
        
        typingText.textContent = `${username} is typing`;
        indicator.style.display = 'flex';
    }

    function hideTypingIndicator() {
        document.getElementById('typingIndicator').style.display = 'none';
    }

    function updateOnlineCount() {
        document.getElementById('onlineCount').textContent = `${state.onlineUsers} online`;
    }
});