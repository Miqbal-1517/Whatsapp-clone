// Socket connection
const socket = io();
let currentUser = '';
let selectedFiles = [];
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// DOM Elements
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages-container');

// ========== JOIN CHAT ==========
function joinChat() {
        const usernameInput = document.getElementById('username');
        const username = usernameInput.value.trim();

        if (!username) {
                alert('Please enter a username');
                return;
        }

        currentUser = username;
        socket.emit('user-join', username);

        document.getElementById('login-container').style.display = 'none';
        document.getElementById('chat-container').style.display = 'flex';
        document.getElementById('current-user').textContent = currentUser;

        setTimeout(() => messageInput?.focus(), 500);
}

// ========== PREVIOUS MESSAGES ==========
socket.on('previous-messages', (oldMessages) => {
        oldMessages.forEach(msg => {
                if (!msg.deleted) {
                        renderMessage(msg);
                }
        });
});

// ========== USER LIST ==========
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
                <i class="fas fa-envelope" style="font-size: 12px; opacity: 0.6;"></i>
            </div>
        `).join('');
        }
});

socket.on('user-count', (count) => {
        document.getElementById('online-count').textContent = count;
});

socket.on('user-joined', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} joined the chat`);
});

socket.on('user-left', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} left the chat`);
});

// ========== TEXT MESSAGES ==========
socket.on('receive-message', (message) => {
        renderMessage(message);
});

// ========== VOICE MESSAGES ==========
socket.on('receive-voice', (data) => {
        renderMessage(data);
});

// ========== FILE MESSAGES ==========
socket.on('receive-file', (fileData) => {
        renderMessage(fileData);
});

// ========== DELETE MESSAGE ==========
socket.on('message-deleted', ({ messageId, deletedFor }) => {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
                if (deletedFor === 'everyone') {
                        messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-username">${messageElement.querySelector('.message-username')?.innerHTML || 'User'}</span>
                    <span class="message-time">${messageElement.querySelector('.message-time')?.innerHTML || ''}</span>
                </div>
                <div class="message-text deleted-message">
                    <i class="fas fa-trash-alt"></i> This message was deleted
                </div>
            `;
                        messageElement.classList.add('deleted');
                } else if (deletedFor === 'me') {
                        messageElement.remove();
                }
        }
});

// ========== TYPING INDICATOR ==========
let typingTimeout;
socket.on('user-typing', ({ username, isTyping }) => {
        const indicator = document.getElementById('typing-indicator');
        if (isTyping && username !== currentUser) {
                indicator.textContent = `${username} is typing...`;
        } else {
                indicator.textContent = '';
        }
});

// ========== PRIVATE MESSAGES ==========
socket.on('private-message', ({ from, content, timestamp }) => {
        addPrivateMessage(from, content, timestamp);
});

socket.on('private-message-sent', ({ to }) => {
        addSystemMessage(`🔒 Private message sent to ${to}`);
});

// ========== SEND TEXT MESSAGE ==========
function sendMessage() {
        const message = messageInput?.value.trim();
        if (!message) return;

        socket.emit('send-message', { content: message });
        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();
}

// ========== RENDER MESSAGE ==========
function renderMessage(msg) {
        const container = messagesContainer;
        const isSent = msg.username === currentUser;

        // Check if message already exists
        if (document.querySelector(`[data-message-id="${msg.messageId}"]`)) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'message-sent' : 'message-received'} ${msg.deleted ? 'deleted' : ''}`;
        messageDiv.setAttribute('data-message-id', msg.messageId);

        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let contentHTML = '';

        if (msg.deleted) {
                contentHTML = `<div class="message-text deleted-message"><i class="fas fa-trash-alt"></i> This message was deleted</div>`;
        } else if (msg.type === 'voice') {
                contentHTML = `
            <div class="message-text voice-message">
                <audio controls>
                    <source src="${msg.audio}" type="audio/webm">
                </audio>
            </div>
        `;
        } else if (msg.type === 'file') {
                contentHTML = getFileHTML(msg);
        } else {
                contentHTML = `<div class="message-text">${escapeHtml(msg.content)}</div>`;
        }

        messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-username">${escapeHtml(msg.username)} ${msg.type === 'voice' ? '<i class="fas fa-microphone"></i>' : ''} ${msg.type === 'file' ? '<i class="fas fa-paperclip"></i>' : ''}</span>
            <span class="message-time">${time}</span>
            <div class="message-actions">
                <i class="fas fa-trash-alt delete-msg" onclick="deleteMessage('${msg.messageId}', ${isSent})" title="Delete"></i>
            </div>
        </div>
        ${contentHTML}
    `;

        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;

        // Remove welcome message
        const welcomeMsg = container.querySelector('.welcome-message');
        if (welcomeMsg && container.children.length > 1) welcomeMsg.remove();
}

// ========== DELETE MESSAGE ==========
function deleteMessage(messageId, isSent) {
        const options = ['Delete for me'];
        if (isSent) options.push('Delete for everyone');

        const action = prompt(`Delete message:\n${options.join('\n')}\n\nEnter 1 for "Delete for me"${isSent ? ', 2 for "Delete for everyone"' : ''}`);

        if (action === '1') {
                socket.emit('delete-for-me', messageId);
        } else if (action === '2' && isSent) {
                socket.emit('delete-message', messageId);
        }
}

// ========== FILE HTML GENERATOR ==========
function getFileHTML(fileData) {
        if (fileData.fileType?.startsWith('image/') && fileData.fileData) {
                return `
            <div class="message-text">
                <img src="${fileData.fileData}" class="file-preview-img" onclick="window.open(this.src)">
                <div class="file-info">${escapeHtml(fileData.filename)} (${(fileData.fileSize / 1024).toFixed(1)} KB)</div>
            </div>
        `;
        } else if (fileData.fileType?.startsWith('video/') && fileData.fileData) {
                return `
            <div class="message-text">
                <video controls class="file-preview-video">
                    <source src="${fileData.fileData}" type="${fileData.fileType}">
                </video>
                <div class="file-info">${escapeHtml(fileData.filename)}</div>
            </div>
        `;
        } else {
                return `
            <div class="message-text">
                <div class="file-attachment">
                    <i class="fas fa-file"></i>
                    <div class="file-details">
                        <div class="file-name">${escapeHtml(fileData.filename)}</div>
                        <div class="file-size">${(fileData.fileSize / 1024).toFixed(1)} KB</div>
                    </div>
                    ${fileData.fileData ? `<button onclick="downloadFile('${fileData.fileData}', '${fileData.filename}')" class="download-btn">Download</button>` : ''}
                </div>
            </div>
        `;
        }
}

function downloadFile(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
}

// ========== SYSTEM MESSAGE ==========
function addSystemMessage(text) {
        const container = messagesContainer;
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-message';
        systemDiv.textContent = text;
        container.appendChild(systemDiv);
        container.scrollTop = container.scrollHeight;

        const welcomeMsg = container.querySelector('.welcome-message');
        if (welcomeMsg) welcomeMsg.remove();
}

function addPrivateMessage(from, message, timestamp) {
        const container = messagesContainer;
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-private';
        const time = new Date(timestamp).toLocaleTimeString();
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
        if (message?.trim()) {
                socket.emit('private-message', { to, message: message.trim() });
        }
}

// ========== VOICE RECORDING ==========
const micBtn = document.getElementById('mic-btn');
const recordingStatus = document.getElementById('recording-status');

if (micBtn) {
        micBtn.addEventListener('mousedown', startRecording);
        micBtn.addEventListener('mouseup', stopRecording);
        micBtn.addEventListener('mouseleave', stopRecording);
        micBtn.addEventListener('touchstart', startRecording);
        micBtn.addEventListener('touchend', stopRecording);
}

function startRecording(e) {
        e.preventDefault();
        navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                        mediaRecorder = new MediaRecorder(stream);
                        audioChunks = [];
                        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
                        mediaRecorder.onstop = () => {
                                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                                sendVoiceMessage(audioBlob);
                                stream.getTracks().forEach(track => track.stop());
                                recordingStatus.style.display = 'none';
                        };
                        mediaRecorder.start();
                        isRecording = true;
                        micBtn.classList.add('recording');
                        recordingStatus.style.display = 'block';
                })
                .catch(() => alert('Please allow microphone access'));
}

function stopRecording() {
        if (mediaRecorder && isRecording) {
                mediaRecorder.stop();
                isRecording = false;
                micBtn.classList.remove('recording');
        }
}

function sendVoiceMessage(audioBlob) {
        const reader = new FileReader();
        reader.onloadend = () => {
                socket.emit('voice-message', {
                        audio: reader.result,
                        username: currentUser,
                        timestamp: new Date().toISOString(),
                        duration: 0
                });
        };
        reader.readAsDataURL(audioBlob);
}

// ========== FILE ATTACHMENT ==========
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');

attachBtn?.addEventListener('click', () => fileInput.click());

fileInput?.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
                if (file.size > 25 * 1024 * 1024) {
                        alert(`${file.name} is too large (max 25MB)`);
                        return;
                }
                const reader = new FileReader();
                reader.onloadend = () => {
                        socket.emit('file-attachment', {
                                filename: file.name,
                                type: file.type,
                                size: file.size,
                                data: reader.result,
                                username: currentUser,
                                timestamp: new Date().toISOString()
                        });
                };
                reader.readAsDataURL(file);
        });
        fileInput.value = '';
});

// ========== EMOJI PICKER ==========
const emojiBtn = document.getElementById('emoji-btn');
let emojiPicker = null;

if (emojiBtn) {
        emojiBtn.addEventListener('click', () => {
                if (emojiPicker) {
                        emojiPicker.remove();
                        emojiPicker = null;
                } else {
                        const picker = document.createElement('div');
                        picker.className = 'emoji-picker';
                        picker.innerHTML = `
                <div class="emoji-list">
                    😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 😍 🤩 🥰 😘 😗 😙 😚 
                    😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😒 😞 😔 😟 
                    😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 
                    🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 
                    ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 
                    👍 👎 👌 ✌️ 🤞 🤟 🤘 👊 💪 🦾 🖕 👆 👇 👈 👉 🖐️
                </div>
            `;
                        picker.style.cssText = `
                position: absolute;
                bottom: 70px;
                left: 10px;
                background: white;
                border-radius: 12px;
                padding: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                max-width: 280px;
            `;
                        picker.querySelector('.emoji-list').style.cssText = `
                font-size: 24px;
                display: grid;
                grid-template-columns: repeat(8, 1fr);
                gap: 5px;
                cursor: pointer;
            `;
                        picker.querySelectorAll('.emoji-list').forEach(el => {
                                el.addEventListener('click', (e) => {
                                        const emoji = e.target.textContent;
                                        if (emoji && messageInput) {
                                                messageInput.value += emoji;
                                                messageInput.focus();
                                        }
                                        picker.remove();
                                        emojiPicker = null;
                                });
                        });
                        document.body.appendChild(picker);
                        emojiPicker = picker;

                        document.addEventListener('click', function closePicker(e) {
                                if (!picker.contains(e.target) && e.target !== emojiBtn) {
                                        picker.remove();
                                        emojiPicker = null;
                                        document.removeEventListener('click', closePicker);
                                }
                        });
                }
        });
}

// ========== AUTO-RESIZE TEXTAREA ==========
if (messageInput) {
        messageInput.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
}

// ========== TYPING INDICATOR ==========
let isUserTyping = false;
messageInput?.addEventListener('input', () => {
        if (!isUserTyping && messageInput.value.trim()) {
                isUserTyping = true;
                socket.emit('typing', true);
        }
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
                if (isUserTyping) {
                        isUserTyping = false;
                        socket.emit('typing', false);
                }
        }, 1000);
});

messageInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
        }
});

// ========== SIDEBAR TOGGLE ==========
function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');
        sidebar?.classList.toggle('active');
        overlay?.classList.toggle('active');
}

document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.querySelector('.menu-btn');
        const overlay = document.getElementById('overlay');
        if (overlay?.classList.contains('active') && !sidebar?.contains(e.target) && !menuBtn?.contains(e.target)) {
                toggleSidebar();
        }
});

// ========== ESCAPE HTML ==========
function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
}

// ========== FOCUS INPUT ==========
setTimeout(() => messageInput?.focus(), 100);

console.log('✅ WhatsApp Clone loaded with all features!');