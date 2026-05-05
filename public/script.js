const socket = io();
let currentUser = '';
let currentDeleteId = null;
let currentDeleteIsSent = false;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');
const messagesArea = document.getElementById('messagesArea');
const micBtn = document.getElementById('micBtn');
const recordingStatus = document.getElementById('recordingStatus');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');

function joinChat() {
        const username = document.getElementById('usernameInput').value.trim();
        if (!username) return alert('Enter username');
        currentUser = username;
        socket.emit('user-join', username);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        document.getElementById('currentUserName').textContent = currentUser;
        setTimeout(() => messageInput.focus(), 100);
}

// Socket events
socket.on('users-list', (users) => {
        const container = document.getElementById('usersList');
        const others = users.filter(u => u !== currentUser);
        if (others.length === 0) {
                container.innerHTML = '<div class="no-users">No others online</div>';
        } else {
                container.innerHTML = others.map(u => `
            <div class="user-item" data-username="${escapeHtml(u)}">
                <i class="fas fa-user-circle"></i>
                <span>${escapeHtml(u)}</span>
                <i class="fas fa-envelope private-icon"></i>
            </div>
        `).join('');

                document.querySelectorAll('.user-item').forEach(item => {
                        item.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const username = item.getAttribute('data-username');
                                sendPrivateMessage(username);
                        });
                });
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
        addMessage(msg.username, msg.content, msg.time, msg.id);
});

socket.on('receive-voice', (data) => {
        addVoiceMessage(data.username, data.audio, data.time, data.id);
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
                indicator.textContent = `${username} typing...`;
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

function sendMessage() {
        const msg = messageInput.value.trim();
        if (!msg) return;
        socket.emit('send-message', { content: msg });
        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();
}

function sendPrivateMessage(to) {
        const msg = prompt(`Send private message to ${to}:`);
        if (msg && msg.trim()) {
                socket.emit('private-message', { to, message: msg.trim() });
        }
}

function addMessage(username, content, time, msgId) {
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

        addDeleteEvent(div, msgId, isSent);
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
                <span class="msg-name">${escapeHtml(username)} 🎤</span>
                <span class="msg-time">${time}</span>
            </div>
            <audio controls src="${audio}"></audio>
        </div>
    `;

        addDeleteEvent(div, msgId, isSent);
        messagesContainer.appendChild(div);
        scrollToBottom();
        removeWelcome();
}

function addFileMessage(file) {
        const isSent = file.username === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.setAttribute('data-id', file.id);

        let content = '';
        if (file.fileType?.startsWith('image/')) {
                content = `<img src="${file.fileData}" class="file-preview" onclick="window.open(this.src)">`;
        } else if (file.fileType?.startsWith('video/')) {
                content = `<video controls src="${file.fileData}" class="file-preview"></video>`;
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
                <span class="msg-name">${escapeHtml(file.username)} 📎</span>
                <span class="msg-time">${file.time}</span>
            </div>
            ${content}
        </div>
    `;

        addDeleteEvent(div, file.id, isSent);
        messagesContainer.appendChild(div);
        scrollToBottom();
        removeWelcome();
}

function addDeleteEvent(div, msgId, isSent) {
        let timer;
        div.addEventListener('touchstart', () => { timer = setTimeout(() => showDeleteModal(msgId, isSent), 500); });
        div.addEventListener('touchend', () => clearTimeout(timer));
        div.addEventListener('touchmove', () => clearTimeout(timer));
        div.addEventListener('contextmenu', (e) => { e.preventDefault(); showDeleteModal(msgId, isSent); });
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

function showDeleteModal(msgId, isSent) {
        currentDeleteId = msgId;
        currentDeleteIsSent = isSent;
        const modal = document.getElementById('deleteModal');
        const forEveryoneOption = modal.querySelector('.delete-option:first-child');
        forEveryoneOption.style.display = isSent ? 'flex' : 'none';
        modal.classList.add('show');
}

function deleteForEveryone() {
        if (currentDeleteId && currentDeleteIsSent) {
                socket.emit('delete-message', { messageId: currentDeleteId });
        }
        closeDeleteModal();
}

function deleteForMe() {
        if (currentDeleteId) {
                socket.emit('delete-message', { messageId: currentDeleteId });
        }
        closeDeleteModal();
}

function closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        currentDeleteId = null;
}

// Voice Recording
micBtn.addEventListener('touchstart', startRecord);
micBtn.addEventListener('mousedown', startRecord);
micBtn.addEventListener('touchend', stopRecord);
micBtn.addEventListener('mouseup', stopRecord);
micBtn.addEventListener('mouseleave', stopRecord);

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
                                reader.onloadend = () => socket.emit('voice-message', { audio: reader.result });
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

function stopRecord() {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
}

// File Attach
document.getElementById('attachBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
});
document.getElementById('fileInput').addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
                if (file.size > 25e6) return alert(`${file.name} too large`);
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

// Emoji Picker
let emojiOpen = false;
document.getElementById('emojiBtn').addEventListener('click', () => {
        if (emojiOpen) return;
        const existing = document.querySelector('.emoji-picker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.className = 'emoji-picker';
        const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤩', '🥳', '😎', '🤓', '🧐', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👊', '💪', '🖕', '👆', '👇', '👈', '👉', '🖐️', '🤙'];

        picker.innerHTML = `<div class="emoji-grid">${emojis.map(e => `<span class="emoji">${e}</span>`).join('')}</div>`;
        document.body.appendChild(picker);
        emojiOpen = true;

        picker.querySelectorAll('.emoji').forEach(emoji => {
                emoji.addEventListener('click', () => {
                        messageInput.value += emoji.textContent;
                        messageInput.focus();
                        picker.remove();
                        emojiOpen = false;
                });
        });

        setTimeout(() => {
                document.addEventListener('click', function close(e) {
                        if (!picker.contains(e.target) && e.target !== document.getElementById('emojiBtn')) {
                                picker.remove();
                                emojiOpen = false;
                                document.removeEventListener('click', close);
                        }
                });
        }, 100);
});

// Input handlers
messageInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 80) + 'px';
        socket.emit('typing', true);
        clearTimeout(window.typingTimer);
        window.typingTimer = setTimeout(() => socket.emit('typing', false), 1000);
});

messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
        }
});

document.getElementById('sendBtn').addEventListener('click', sendMessage);

// Search users
document.getElementById('searchUsers').addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();
        const userItems = document.querySelectorAll('.user-item');
        userItems.forEach(item => {
                const nameSpan = item.querySelector('span');
                if (nameSpan) {
                        const userName = nameSpan.textContent.toLowerCase();
                        if (userName.includes(searchTerm)) {
                                item.style.display = 'flex';
                        } else {
                                item.style.display = 'none';
                        }
                }
        });
});

// Sidebar functions
function openSidebar() {
        sidebar.classList.add('open');
}

function closeSidebar() {
        sidebar.classList.remove('open');
}

menuToggle.addEventListener('click', openSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);

// Close sidebar when clicking outside on overlay? No overlay now - only close button closes it
// But we want it to close when clicking outside? Let's not - only close button

function scrollToBottom() {
        setTimeout(() => {
                messagesArea.scrollTop = messagesArea.scrollHeight;
        }, 50);
}

function removeWelcome() {
        const welcome = document.querySelector('.welcome-screen');
        if (welcome && messagesContainer.children.length > 1) welcome.remove();
}

function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
}

setTimeout(() => messageInput.focus(), 100);
console.log('App loaded - Mobile optimized');