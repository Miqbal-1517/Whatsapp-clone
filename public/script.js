const socket = io();
let currentUser = '';

// Auto-resize textarea
const textarea = document.getElementById('message-input');
if (textarea) {
        textarea.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
}

function joinChat() {
        const usernameInput = document.getElementById('username');
        const username = usernameInput.value.trim();

        if (!username) {
                alert('Please enter a username');
                return;
        }

        currentUser = username;
        socket.emit('user-join', username);

        // Hide login, show chat
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('chat-container').style.display = 'flex';
        document.getElementById('current-user').textContent = username;
}

// Receive users list
socket.on('users-list', (users) => {
        const usersListDiv = document.getElementById('users-list');
        const otherUsers = users.filter(user => user !== currentUser);

        if (otherUsers.length === 0) {
                usersListDiv.innerHTML = '<div class="user-item"><i class="fas fa-info-circle"></i><span>No other users online</span></div>';
        } else {
                usersListDiv.innerHTML = otherUsers.map(user => `
            <div class="user-item" onclick="sendPrivateMessage('${escapeHtml(user)}')">
                <i class="fas fa-user-circle"></i>
                <span class="user-name">${escapeHtml(user)}</span>
                <i class="fas fa-envelope" style="font-size: 14px; opacity: 0.6;"></i>
            </div>
        `).join('');
        }
});

// Update online count
socket.on('user-count', (count) => {
        document.getElementById('online-count').textContent = count;
});

// User joined notification
socket.on('user-joined', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} joined the chat`);
});

// User left notification
socket.on('user-left', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} left the chat`);
});

// Receive message - FIXED: Only add message once
socket.on('receive-message', (message) => {
        // Only add if message is not from current user (handled separately)
        if (message.username !== currentUser) {
                addMessageToChat(message);
        }
});

// Typing indicator
let typingTimeout;
socket.on('user-typing', ({ username, isTyping }) => {
        const indicator = document.getElementById('typing-indicator');
        if (isTyping && username !== currentUser) {
                indicator.textContent = `${username} is typing...`;
        } else {
                indicator.textContent = '';
        }
});

// Private message
socket.on('private-message', ({ from, message, timestamp }) => {
        addPrivateMessage(from, message, timestamp);
});

// Private message sent confirmation
socket.on('private-message-sent', ({ from, to, message, timestamp }) => {
        addSystemMessage(`🔒 Private message sent to ${to}`);
});

function sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();

        if (!message) return;

        const messageData = {
                content: message
        };

        // Send to server
        socket.emit('send-message', messageData);

        // Add message to own chat immediately
        addMessageToChat({
                username: currentUser,
                content: message,
                timestamp: new Date().toISOString(),
                id: Date.now()
        });

        // Clear input
        input.value = '';
        input.style.height = 'auto';
        input.focus();
}

function addMessageToChat(message) {
        const container = document.getElementById('messages-container');
        const isSent = message.username === currentUser;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'message-sent' : 'message-received'}`;

        const time = new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
        });

        messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-username">${escapeHtml(message.username)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(message.content)}</div>
    `;

        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;

        // Remove welcome message if exists
        const welcomeMsg = container.querySelector('.welcome-message');
        if (welcomeMsg && container.children.length > 1) {
                welcomeMsg.remove();
        }
}

function addSystemMessage(text) {
        const container = document.getElementById('messages-container');
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-message';
        systemDiv.textContent = text;
        container.appendChild(systemDiv);
        container.scrollTop = container.scrollHeight;

        // Remove welcome message if exists
        const welcomeMsg = container.querySelector('.welcome-message');
        if (welcomeMsg) {
                welcomeMsg.remove();
        }
}

function addPrivateMessage(from, message, timestamp) {
        const container = document.getElementById('messages-container');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-private';

        const time = new Date(timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
        });

        messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-username">🔒 ${escapeHtml(from)} (Private)</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(message)}</div>
    `;

        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
}

function sendPrivateMessage(to) {
        const message = prompt(`Send private message to ${to}:`);
        if (message && message.trim()) {
                socket.emit('private-message', { to, message: message.trim() });
        }
}

// Typing indicator
let isTyping = false;
const messageInput = document.getElementById('message-input');

if (messageInput) {
        messageInput.addEventListener('input', () => {
                if (!isTyping && messageInput.value.trim()) {
                        isTyping = true;
                        socket.emit('typing', true);
                }

                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                        if (isTyping) {
                                isTyping = false;
                                socket.emit('typing', false);
                        }
                }, 1000);
        });
}

// Send message on Enter (Shift+Enter for new line)
messageInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
        }
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
}

// Mobile sidebar toggle
function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
}

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('menu-btn');
        const overlay = document.getElementById('overlay');

        if (overlay.classList.contains('active') &&
                !sidebar.contains(e.target) &&
                !menuBtn.contains(e.target)) {
                toggleSidebar();
        }
});

// Focus input on load
if (messageInput) {
        setTimeout(() => messageInput.focus(), 100);
}

console.log('✅ Chat application loaded successfully!');