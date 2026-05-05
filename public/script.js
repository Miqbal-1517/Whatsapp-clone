// DOM Elements
const socket = io();
let currentUser = '';
let currentMessageId = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Get elements
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');
const micBtn = document.getElementById('micBtn');
const recordingStatus = document.getElementById('recordingStatus');

// ========== JOIN CHAT ==========
function joinChat() {
        const username = document.getElementById('usernameInput').value.trim();
        if (!username) {
                alert('Please enter username');
                return;
        }
        currentUser = username;
        socket.emit('user-join', username);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        document.getElementById('currentUserName').textContent = currentUser;
        messageInput.focus();
}

// ========== SOCKET EVENTS ==========
socket.on('users-list', (users) => {
        const container = document.getElementById('usersList');
        const others = users.filter(u => u !== currentUser);
        if (others.length === 0) {
                container.innerHTML = '<div class="no-users">No other users online</div>';
        } else {
                container.innerHTML = others.map(u => `
            <div class="user-item" onclick="sendPrivate('${escapeHtml(u)}')">
                <i class="fas fa-user-circle"></i>
                <span>${escapeHtml(u)}</span>
                <i class="fas fa-envelope"></i>
            </div>
        `).join('');
        }
});

socket.on('user-count', (count) => {
        document.getElementById('onlineCount').textContent = count;
});

socket.on('user-joined', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} joined`);
});

socket.on('user-left', (data) => {
        addSystemMessage(`${escapeHtml(data.username)} left`);
});

socket.on('receive-message', (msg) => {
        addMessage(msg.type, msg.username, msg.content, msg.time, msg.messageId);
});

socket.on('receive-voice', (data) => {
        addVoiceMessage(data.username, data.audio, data.time, data.messageId);
});

socket.on('receive-file', (file) => {
        addFileMessage(file);
});

socket.on('message-deleted', ({ messageId }) => {
        const el = document.querySelector(`[data-id="${messageId}"]`);
        if (el) el.remove();
});

socket.on('user-typing', ({ username, isTyping }) => {
        const indicator = document.getElementById('typingIndicator');
        if (isTyping && username !== currentUser) {
                indicator.textContent = `${username} is typing...`;
        } else {
                indicator.textContent = '';
        }
});

socket.on('private-message', ({ from, content, time }) => {
        addPrivateMessage(from, content, time);
});

socket.on('private-message-sent', ({ to }) => {
        addSystemMessage(`Private message sent to ${to}`);
});

// ========== SEND TEXT ==========
function sendMessage() {
        const msg = messageInput.value.trim();
        if (!msg) return;
        socket.emit('send-message', { content: msg });
        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();
}

// ========== ADD MESSAGE ==========
function addMessage(type, username, content, time, msgId) {
        const isSent = username === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.setAttribute('data-id', msgId);

        div.innerHTML = `
        <div class="bubble ${isSent ? 'sent-bubble' : 'received-bubble'}">
            <div class="msg-header">
                <span class="msg-name">${escapeHtml(username)}</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-text">${escapeHtml(content)}</div>
        </div>
    `;

        // Add delete on long press
        div.addEventListener('touchstart', () => {
                let timer = setTimeout(() => showDeleteModal(msgId, isSent), 500);
                div.addEventListener('touchend', () => clearTimeout(timer));
                div.addEventListener('touchmove', () => clearTimeout(timer));
        });

        div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showDeleteModal(msgId, isSent);
        });

        messagesContainer.appendChild(div);
        scrollToBottom();
        removeWelcome();
}

function addVoiceMessage(username, audio, time, msgId) {
        const isSent = username === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.setAttribute('data-id', msgId);

        div.innerHTML = `
        <div class="bubble ${isSent ? 'sent-bubble' : 'received-bubble'}">
            <div class="msg-header">
                <span class="msg-name">${escapeHtml(username)} <i class="fas fa-microphone"></i></span>
                <span class="msg-time">${time}</span>
            </div>
            <audio controls src="${audio}"></audio>
        </div>
    `;

        div.addEventListener('touchstart', () => {
                let timer = setTimeout(() => showDeleteModal(msgId, isSent), 500);
                div.addEventListener('touchend', () => clearTimeout(timer));
                div.addEventListener('touchmove', () => clearTimeout(timer));
        });

        messagesContainer.appendChild(div);
        scrollToBottom();
        removeWelcome();
}

function addFileMessage(file) {
        const isSent = file.username === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.setAttribute('data-id', file.messageId);

        let content = '';
        if (file.fileType?.startsWith('image/')) {
                content = `<img src="${file.fileData}" class="file-img" onclick="window.open(this.src)">`;
        } else if (file.fileType?.startsWith('video/')) {
                content = `<video controls src="${file.fileData}" class="file-video"></video>`;
        } else {
                content = `
            <div class="file-attach">
                <i class="fas fa-file"></i>
                <span>${escapeHtml(file.filename)} (${(file.fileSize / 1024).toFixed(1)} KB)</span>
                <button onclick="downloadFile('${file.fileData}', '${file.filename}')">Download</button>
            </div>
        `;
        }

        div.innerHTML = `
        <div class="bubble ${isSent ? 'sent-bubble' : 'received-bubble'}">
            <div class="msg-header">
                <span class="msg-name">${escapeHtml(file.username)} <i class="fas fa-paperclip"></i></span>
                <span class="msg-time">${file.time}</span>
            </div>
            ${content}
        </div>
    `;

        messagesContainer.appendChild(div);
        scrollToBottom();
        removeWelcome();
}

function addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'system-msg';
        div.innerHTML = `<span>${text}</span>`;
        messagesContainer.appendChild(div);
        scrollToBottom();
        removeWelcome();
}

function addPrivateMessage(from, content, time) {
        const div = document.createElement('div');
        div.className = 'message received';
        div.innerHTML = `
        <div class="bubble private-bubble">
            <div class="msg-header">
                <span class="msg-name">🔒 ${escapeHtml(from)} (Private)</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-text">${escapeHtml(content)}</div>
        </div>
    `;
        messagesContainer.appendChild(div);
        scrollToBottom();
}

// ========== DELETE ==========
function showDeleteModal(msgId, isSent) {
        currentMessageId = msgId;
        const modal = document.getElementById('deleteModal');
        const options = modal.querySelectorAll('.delete-option');
        options[0].style.display = isSent ? 'flex' : 'none';
        modal.classList.add('show');
}

function deleteForEveryone() {
        if (currentMessageId) {
                socket.emit('delete-message', { messageId: currentMessageId, deleteFor: 'everyone' });
        }
        closeDeleteModal();
}

function deleteForMe() {
        if (currentMessageId) {
                socket.emit('delete-message', { messageId: currentMessageId, deleteFor: 'me' });
        }
        closeDeleteModal();
}

function closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        currentMessageId = null;
}

// ========== VOICE RECORDING ==========
micBtn.addEventListener('mousedown', startRecord);
micBtn.addEventListener('mouseup', stopRecord);
micBtn.addEventListener('mouseleave', stopRecord);
micBtn.addEventListener('touchstart', startRecord);
micBtn.addEventListener('touchend', stopRecord);

function startRecord(e) {
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
                })
                .catch(() => alert('Microphone access required'));
}

function stopRecord() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
        }
}

// ========== FILE ATTACH ==========
document.getElementById('attachBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
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

function downloadFile(url, name) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
}

// ========== EMOJI PICKER ==========
let emojiPickerOpen = false;
document.getElementById('emojiBtn').addEventListener('click', () => {
        if (emojiPickerOpen) return;

        const existing = document.querySelector('.emoji-picker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        const emojis = '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😍🥰😘😗😙😚😋😛😜🤪😝🤑🤗🤩🥳😎🤓🧐😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄❤️🧡💛💚💙💜🖤🤍🤎👍👎👌✌️🤞🤟🤘👊💪🖕👆👇👈👉';

        picker.innerHTML = `<div class="emoji-grid">${emojis.split('').map(e => `<span class="emoji">${e}</span>`).join('')}</div>`;
        document.body.appendChild(picker);
        emojiPickerOpen = true;

        picker.querySelectorAll('.emoji').forEach(emoji => {
                emoji.addEventListener('click', () => {
                        messageInput.value += emoji.textContent;
                        messageInput.focus();
                        picker.remove();
                        emojiPickerOpen = false;
                });
        });

        setTimeout(() => {
                document.addEventListener('click', function closePicker(e) {
                        if (!picker.contains(e.target) && e.target !== document.getElementById('emojiBtn')) {
                                picker.remove();
                                emojiPickerOpen = false;
                                document.removeEventListener('click', closePicker);
                        }
                });
        }, 100);
});

// ========== TYPING ==========
let typingTimer;
messageInput.addEventListener('input', () => {
        socket.emit('typing', true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => socket.emit('typing', false), 1000);

        // Auto resize
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
});

messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
        }
});

// ========== PRIVATE MESSAGE ==========
function sendPrivate(to) {
        const msg = prompt(`Send private message to ${to}:`);
        if (msg && msg.trim()) {
                socket.emit('private-message', { to, message: msg.trim() });
        }
}

// ========== SIDEBAR ==========
function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('overlay').classList.toggle('show');
}

function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('show');
}

document.getElementById('menuToggle').addEventListener('click', toggleSidebar);

// Search users
document.getElementById('searchUsers').addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        document.querySelectorAll('.user-item').forEach(user => {
                const name = user.querySelector('span')?.textContent.toLowerCase();
                user.style.display = name?.includes(search) ? 'flex' : 'none';
        });
});

// ========== UTILITIES ==========
function scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        setTimeout(() => {
                container.scrollTop = container.scrollHeight;
        }, 50);
}

function removeWelcome() {
        const welcome = document.querySelector('.welcome-screen');
        if (welcome && messagesContainer.children.length > 1) {
                welcome.remove();
        }
}

function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
}

// Send message on send button click
document.getElementById('sendBtn').addEventListener('click', sendMessage);

console.log('App loaded successfully');