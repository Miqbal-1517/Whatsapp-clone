const socket = io();
let currentUser = '';
let mediaRecorder, audioChunks = [], isRecording = false;
let currentMessageToDelete = null;
let longPressTimer = null;

// DOM Elements
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages-container');
const messagesArea = document.getElementById('messages-area');

// ========== JOIN CHAT ==========
function joinChat() {
        const username = document.getElementById('username').value.trim();
        if (!username) return alert('Please enter username');

        currentUser = username;
        socket.emit('user-join', username);

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        document.getElementById('current-user-name').textContent = currentUser;
        messageInput?.focus();
}

// ========== USER LIST ==========
socket.on('users-list', (users) => {
        const container = document.getElementById('users-list');
        const others = users.filter(u => u !== currentUser);

        if (others.length === 0) {
                container.innerHTML = '<div class="no-users">No other users online</div>';
        } else {
                container.innerHTML = others.map(u => `
            <div class="user-item" onclick="sendPrivateMessage('${escapeHtml(u)}')">
                <i class="fas fa-user-circle"></i>
                <span class="user-name">${escapeHtml(u)}</span>
                <i class="fas fa-envelope private-icon"></i>
            </div>
        `).join('');
        }
});

socket.on('user-count', (count) => {
        document.getElementById('online-count').textContent = count;
});

socket.on('user-joined', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} joined`);
});

socket.on('user-left', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} left`);
});

// ========== MESSAGE HANDLERS ==========
socket.on('receive-message', (msg) => renderMessage(msg));
socket.on('receive-voice', (data) => renderMessage(data));
socket.on('receive-file', (data) => renderMessage(data));

// ========== DELETE MESSAGE ==========
socket.on('message-deleted', ({ messageId, deleteFor }) => {
        const el = document.querySelector(`[data-id="${messageId}"]`);
        if (el) {
                if (deleteFor === 'everyone') {
                        const contentDiv = el.querySelector('.message-bubble');
                        if (contentDiv) {
                                contentDiv.innerHTML = '<span class="deleted-text"><i class="fas fa-trash-alt"></i> This message was deleted</span>';
                                contentDiv.classList.add('deleted');
                        }
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
                indicator.innerHTML = `${username} is typing...`;
        } else {
                indicator.innerHTML = '';
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
        if (msg.type === 'voice') {
                contentHtml = `<audio controls src="${msg.audio}"></audio>`;
        } else if (msg.type === 'file') {
                contentHtml = getFileHtml(msg);
        } else {
                contentHtml = `<span>${escapeHtml(msg.content)}</span>`;
        }

        div.innerHTML = `
        <div class="message-bubble ${isSent ? 'sent-bubble' : 'received-bubble'}">
            <div class="message-header">
                <span class="msg-username">${escapeHtml(msg.username)}</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-content">${contentHtml}</div>
        </div>
    `;

        // Add delete on long press (mobile) / right click (desktop)
        div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showDeleteModal(msg.messageId, isSent);
        });

        // Long press for mobile
        div.addEventListener('touchstart', () => {
                longPressTimer = setTimeout(() => {
                        showDeleteModal(msg.messageId, isSent);
                }, 500);
        });
        div.addEventListener('touchend', () => clearTimeout(longPressTimer));
        div.addEventListener('touchmove', () => clearTimeout(longPressTimer));

        messagesContainer.appendChild(div);
        scrollToBottom();

        // Remove welcome
        const welcome = messagesContainer.querySelector('.welcome-chat');
        if (welcome && messagesContainer.children.length > 1) welcome.remove();
}

function getFileHtml(f) {
        if (f.fileType?.startsWith('image/')) {
                return `<img src="${f.fileData}" class="file-preview" onclick="window.open(this.src)">`;
        } else if (f.fileType?.startsWith('video/')) {
                return `<video controls src="${f.fileData}" class="file-preview"></video>`;
        } else {
                return `
            <div class="file-attach">
                <i class="fas fa-file"></i>
                <span>${escapeHtml(f.filename)} (${(f.fileSize / 1024).toFixed(1)} KB)</span>
                <button onclick="downloadFile('${f.fileData}', '${f.filename}')" class="download-btn">Download</button>
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

// ========== DELETE MODAL (WhatsApp Style) ==========
function showDeleteModal(messageId, isSent) {
        currentMessageToDelete = { messageId, isSent };
        const modal = document.getElementById('delete-modal');
        const options = modal.querySelectorAll('.delete-option');

        // Show/hide "delete for everyone" based on if user sent the message
        options[0].style.display = isSent ? 'flex' : 'none';

        modal.classList.add('show');
}

function deleteMessageConfirm(deleteFor) {
        if (deleteFor === 'everyone' && currentMessageToDelete?.isSent) {
                socket.emit('delete-message', { messageId: currentMessageToDelete.messageId, deleteFor: 'everyone' });
        } else if (deleteFor === 'me') {
                socket.emit('delete-message', { messageId: currentMessageToDelete.messageId, deleteFor: 'me' });
        }
        closeDeleteModal();
}

function closeDeleteModal() {
        document.getElementById('delete-modal').classList.remove('show');
        currentMessageToDelete = null;
}

function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
}

// ========== SYSTEM MESSAGES ==========
function addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'system-message';
        div.innerHTML = `<span>${escapeHtml(text)}</span>`;
        messagesContainer.appendChild(div);
        scrollToBottom();
        const welcome = messagesContainer.querySelector('.welcome-chat');
        if (welcome) welcome.remove();
}

function addPrivateMessage(from, msg, ts) {
        const div = document.createElement('div');
        div.className = 'message private';
        const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `
        <div class="message-bubble private-bubble">
            <div class="message-header">
                <span class="msg-username">🔒 ${escapeHtml(from)} (Private)</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-content">${escapeHtml(msg)}</div>
        </div>
    `;
        messagesContainer.appendChild(div);
        scrollToBottom();
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
                                        socket.emit('voice-message', { audio: reader.result });
                                };
                                reader.readAsDataURL(blob);
                                stream.getTracks().forEach(t => t.stop());
                                recordingStatus.style.display = 'none';
                                micBtn.classList.remove('recording');
                        };
                        mediaRecorder.start();
                        micBtn.classList.add('recording');
                        recordingStatus.style.display = 'block';
                }).catch(() => alert('Microphone access needed'));
}

function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
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
        picker.style.cssText = 'position:fixed;bottom:80px;left:70px;background:#fff;border-radius:12px;padding:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:1000;max-width:280px;max-height:200px;overflow-y:auto;';
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

// ========== AUTO RESIZE TEXTAREA ==========
messageInput?.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// ========== TYPING ==========
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

// ========== SEARCH USERS ==========
document.getElementById('search-users')?.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const users = document.querySelectorAll('.user-item');
        users.forEach(user => {
                const name = user.querySelector('.user-name')?.textContent.toLowerCase();
                user.style.display = name?.includes(search) ? 'flex' : 'none';
        });
});

// ========== SIDEBAR TOGGLE ==========
function toggleSidebar() {
        document.getElementById('sidebar')?.classList.toggle('open');
        document.getElementById('sidebar-overlay')?.classList.toggle('show');
}

function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
}

// Focus input on load
setTimeout(() => messageInput?.focus(), 100);

console.log('✅ WhatsApp Clone Fully Loaded');