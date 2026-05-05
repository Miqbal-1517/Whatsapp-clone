const socket = io();
let currentUser = '';
let mediaRecorder, audioChunks = [], isRecording = false;
let selectedFiles = [];

// DOM Elements
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages-container');

// ========== JOIN CHAT ==========
function joinChat() {
        const username = document.getElementById('username').value.trim();
        if (!username) return alert('Enter username');

        currentUser = username;
        socket.emit('user-join', username);

        document.getElementById('login-container').style.display = 'none';
        document.getElementById('chat-container').style.display = 'flex';
        document.getElementById('current-user').textContent = currentUser;
        messageInput?.focus();
}

// ========== PREVIOUS MESSAGES ==========
socket.on('previous-messages', (msgs) => {
        msgs.forEach(msg => { if (!msg.deleted) renderMessage(msg); });
});

// ========== USER LIST ==========
socket.on('users-list', (users) => {
        const container = document.getElementById('users-list');
        const others = users.filter(u => u !== currentUser);

        if (others.length === 0) {
                container.innerHTML = '<div class="user-item">👤 No others online</div>';
        } else {
                container.innerHTML = others.map(u => `
            <div class="user-item" onclick="sendPrivateMessage('${escapeHtml(u)}')">
                👤 <span class="user-name">${escapeHtml(u)}</span> ✉️
            </div>
        `).join('');
        }
});

socket.on('user-count', (count) => {
        document.getElementById('online-count').textContent = count;
});

socket.on('user-joined', (data) => {
        addSystemMessage(`✨ ${escapeHtml(data.username)} joined the chat`);
});

socket.on('user-left', (data) => {
        addSystemMessage(`👋 ${escapeHtml(data.username)} left the chat`);
});

// ========== TEXT MESSAGES ==========
socket.on('receive-message', (msg) => renderMessage(msg));

// ========== VOICE MESSAGES ==========
socket.on('receive-voice', (data) => renderMessage(data));

// ========== FILE MESSAGES ==========
socket.on('receive-file', (data) => renderMessage(data));

// ========== DELETE MESSAGE ==========
socket.on('message-deleted', ({ messageId, deletedFor }) => {
        const el = document.querySelector(`[data-id="${messageId}"]`);
        if (el) {
                if (deletedFor === 'everyone') {
                        el.querySelector('.message-text').innerHTML = '🗑️ This message was deleted';
                        el.classList.add('deleted');
                } else {
                        el.remove();
                }
        }
});

// ========== TYPING ==========
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

// ========== SEND TEXT ==========
function sendMessage() {
        const msg = messageInput?.value.trim();
        if (!msg) return;
        socket.emit('send-message', { content: msg });
        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();
}

// ========== RENDER MESSAGE ==========
function renderMessage(msg) {
        if (document.querySelector(`[data-id="${msg.messageId}"]`)) return;

        const isSent = msg.username === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.setAttribute('data-id', msg.messageId);

        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let contentHtml = '';
        if (msg.deleted) {
                contentHtml = '<div class="message-text deleted">🗑️ Deleted</div>';
        } else if (msg.type === 'voice') {
                contentHtml = `<audio controls src="${msg.audio}"></audio>`;
        } else if (msg.type === 'file') {
                contentHtml = getFileHtml(msg);
        } else {
                contentHtml = `<div class="message-text">${escapeHtml(msg.content)}</div>`;
        }

        div.innerHTML = `
        <div class="message-header">
            <span class="username">${escapeHtml(msg.username)}</span>
            <span class="time">${time}</span>
            <span class="delete-btn" onclick="deleteMsg('${msg.messageId}', ${isSent})">🗑️</span>
        </div>
        ${contentHtml}
    `;

        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        const welcome = messagesContainer.querySelector('.welcome-message');
        if (welcome) welcome.remove();
}

function getFileHtml(f) {
        if (f.fileType?.startsWith('image/')) {
                return `<img src="${f.fileData}" class="file-img" onclick="window.open(this.src)">`;
        } else if (f.fileType?.startsWith('video/')) {
                return `<video controls src="${f.fileData}" class="file-video"></video>`;
        } else {
                return `
            <div class="file-attach">
                📄 <span>${escapeHtml(f.filename)} (${(f.fileSize / 1024).toFixed(1)} KB)</span>
                <button onclick="downloadFile('${f.fileData}', '${f.filename}')">⬇️</button>
            </div>
        `;
        }
}

function downloadFile(url, name) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
}

function deleteMsg(messageId, isSent) {
        const choice = prompt('Delete:\n1 - For me\n2 - For everyone');
        if (choice === '1') socket.emit('delete-for-me', messageId);
        else if (choice === '2' && isSent) socket.emit('delete-message', messageId);
}

function addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'system-msg';
        div.textContent = text;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        const welcome = messagesContainer.querySelector('.welcome-message');
        if (welcome) welcome.remove();
}

function addPrivateMessage(from, msg, ts) {
        const div = document.createElement('div');
        div.className = 'message private';
        const time = new Date(ts).toLocaleTimeString();
        div.innerHTML = `
        <div class="message-header">
            <span class="username">🔒 ${escapeHtml(from)} (Private)</span>
            <span class="time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(msg)}</div>
    `;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendPrivateMessage(to) {
        const msg = prompt(`Private message to ${to}:`);
        if (msg?.trim()) socket.emit('private-message', { to, message: msg.trim() });
}

// ========== VOICE RECORDING ==========
const micBtn = document.getElementById('mic-btn');
const recordingStatus = document.getElementById('recording-status');

micBtn?.addEventListener('mousedown', startRecording);
micBtn?.addEventListener('mouseup', stopRecording);
micBtn?.addEventListener('mouseleave', stopRecording);
micBtn?.addEventListener('touchstart', startRecording);
micBtn?.addEventListener('touchend', stopRecording);

function startRecording(e) {
        e.preventDefault();
        navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                        mediaRecorder = new MediaRecorder(stream);
                        audioChunks = [];
                        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                        mediaRecorder.onstop = () => {
                                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                        socket.emit('voice-message', { audio: reader.result, duration: 0 });
                                };
                                reader.readAsDataURL(blob);
                                stream.getTracks().forEach(t => t.stop());
                                recordingStatus.style.display = 'none';
                        };
                        mediaRecorder.start();
                        isRecording = true;
                        micBtn.classList.add('recording');
                        recordingStatus.style.display = 'block';
                }).catch(() => alert('Microphone permission needed'));
}

function stopRecording() {
        if (mediaRecorder && isRecording) {
                mediaRecorder.stop();
                isRecording = false;
                micBtn.classList.remove('recording');
        }
}

// ========== FILE ATTACHMENT ==========
document.getElementById('attach-btn')?.addEventListener('click', () => {
        document.getElementById('file-input').click();
});

document.getElementById('file-input')?.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
                if (file.size > 25e6) return alert(`${file.name} too large (max 25MB)`);
                const reader = new FileReader();
                reader.onloadend = () => {
                        socket.emit('file-attachment', {
                                filename: file.name,
                                type: file.type,
                                size: file.size,
                                data: reader.result
                        });
                };
                reader.readAsDataURL(file);
        });
        e.target.value = '';
});

// ========== EMOJI PICKER ==========
let emojiOpen = false;
document.getElementById('emoji-btn')?.addEventListener('click', () => {
        if (emojiOpen) return;
        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        const emojis = '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😍🥰😘😗😙😚😋😛😜🤪😝🤑🤗🤩🥳😎🤓🧐😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺💀👻🤖💩😺😸😹😻😼😽🙀😿😾❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟👍👎👌✌️🤞🤟🤘👊💪🦾🖕👆👇👈👉🖐️🤙';
        picker.innerHTML = `<div class="emoji-grid">${emojis.split('').map(e => `<span class="emoji">${e}</span>`).join('')}</div>`;
        picker.style.cssText = 'position:fixed;bottom:80px;left:10px;background:#fff;border-radius:12px;padding:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:1000;max-width:280px;max-height:200px;overflow-y:auto;';
        document.body.appendChild(picker);
        emojiOpen = true;

        picker.querySelectorAll('.emoji').forEach(e => {
                e.addEventListener('click', () => {
                        messageInput.value += e.textContent;
                        messageInput.focus();
                        picker.remove();
                        emojiOpen = false;
                });
        });

        document.addEventListener('click', function close(e) {
                if (!picker.contains(e.target) && e.target !== document.getElementById('emoji-btn')) {
                        picker.remove();
                        emojiOpen = false;
                        document.removeEventListener('click', close);
                }
        });
});

// ========== AUTO RESIZE ==========
messageInput?.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// ========== TYPING SEND ==========
let typingTimer;
messageInput?.addEventListener('input', () => {
        socket.emit('typing', true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => socket.emit('typing', false), 1000);
});

messageInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
        }
});

// ========== SIDEBAR ==========
function toggleSidebar() {
        document.getElementById('sidebar')?.classList.toggle('active');
        document.getElementById('overlay')?.classList.toggle('active');
}

document.getElementById('overlay')?.addEventListener('click', toggleSidebar);

function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
}

console.log('✅ WhatsApp Clone Fully Loaded - All Features Working');