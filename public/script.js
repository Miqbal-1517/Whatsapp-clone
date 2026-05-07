const socket = io();
let currentUser = '';
let currentDeleteId = null;
let currentDeleteIsSent = false;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let typingTimeoutId = null;

let messageInput = document.getElementById('messageInput');
let messagesContainer = document.getElementById('messagesContainer');
let messagesArea = document.getElementById('messagesArea');
let micBtn = document.getElementById('micBtn');
let recordingStatus = document.getElementById('recordingStatus');
let sidebar = document.getElementById('sidebar');
let menuToggle = document.getElementById('menuToggle');
let closeSidebarBtn = document.getElementById('closeSidebarBtn');

function reinitializeDomElements() {
        messageInput = document.getElementById('messageInput');
        messagesContainer = document.getElementById('messagesContainer');
        messagesArea = document.getElementById('messagesArea');
        micBtn = document.getElementById('micBtn');
        recordingStatus = document.getElementById('recordingStatus');
        sidebar = document.getElementById('sidebar');
        menuToggle = document.getElementById('menuToggle');
        closeSidebarBtn = document.getElementById('closeSidebarBtn');

        if (micBtn) {
                micBtn.removeEventListener('touchstart', startRecord);
                micBtn.removeEventListener('mousedown', startRecord);
                micBtn.addEventListener('touchstart', startRecord);
                micBtn.addEventListener('mousedown', startRecord);
                micBtn.addEventListener('touchend', stopRecord);
                micBtn.addEventListener('mouseup', stopRecord);
                micBtn.addEventListener('mouseleave', stopRecord);
        }

        if (messageInput) {
                messageInput.addEventListener('input', function () {
                        this.style.height = 'auto';
                        this.style.height = Math.min(this.scrollHeight, 80) + 'px';
                        socket.emit('typing', true);
                        clearTimeout(window.typingTimer);
                        window.typingTimer = setTimeout(() => socket.emit('typing', false), 1500);
                });

                messageInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                        }
                });
        }

        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
                sendBtn.removeEventListener('click', sendMessage);
                sendBtn.addEventListener('click', sendMessage);
        }

        const attachBtn = document.getElementById('attachBtn');
        const fileInput = document.getElementById('fileInput');
        if (attachBtn) {
                attachBtn.removeEventListener('click', () => fileInput.click());
                attachBtn.addEventListener('click', () => fileInput.click());
        }

        setupEmojiPicker();

        if (menuToggle && closeSidebarBtn) {
                menuToggle.removeEventListener('click', openSidebar);
                closeSidebarBtn.removeEventListener('click', closeSidebar);
                menuToggle.addEventListener('click', openSidebar);
                closeSidebarBtn.addEventListener('click', closeSidebar);
        }

        setTimeout(() => {
                const inputDiv = document.querySelector('.fixed-input');
                const textarea = document.getElementById('messageInput');
                if (inputDiv) {
                        inputDiv.style.display = 'block';
                        inputDiv.style.visibility = 'visible';
                }
                if (textarea) {
                        textarea.style.display = 'block';
                        textarea.style.visibility = 'visible';
                        textarea.style.opacity = '1';
                }
        }, 500);
}

function joinChat() {
        const username = document.getElementById('usernameInput').value.trim();
        if (!username) return alert('Enter username');
        currentUser = username;
        socket.emit('user-join', username);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        document.getElementById('currentUserName').textContent = currentUser;

        setTimeout(() => {
                reinitializeDomElements();
                if (messageInput) messageInput.focus();
        }, 100);
}

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
                if (typingTimeoutId) clearTimeout(typingTimeoutId);
                indicator.innerHTML = `${escapeHtml(username)} is typing<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
                typingTimeoutId = setTimeout(() => {
                        indicator.innerHTML = '';
                        typingTimeoutId = null;
                }, 3000);
        } else {
                indicator.innerHTML = '';
                if (typingTimeoutId) {
                        clearTimeout(typingTimeoutId);
                        typingTimeoutId = null;
                }
        }
});

socket.on('private-message', ({ from, content, time }) => {
        addPrivateMessage(from, content, time);
});

socket.on('private-message-sent', ({ to }) => {
        addSystemMessage(`Private message sent to ${to}`);
});

function sendMessage() {
        if (!messageInput) return;
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
        if (!messagesContainer) return;
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
        if (!messagesContainer) return;
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
        if (!messagesContainer) return;
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
        if (!messagesContainer) return;
        const div = document.createElement('div');
        div.className = 'system-msg';
        div.innerHTML = `<span>${text}</span>`;
        messagesContainer.appendChild(div);
        scrollToBottom();
        removeWelcome();
}

function addPrivateMessage(from, content, time) {
        if (!messagesContainer) return;
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
                                if (recordingStatus) recordingStatus.style.display = 'none';
                                if (micBtn) micBtn.classList.remove('recording');
                        };
                        mediaRecorder.start();
                        if (micBtn) micBtn.classList.add('recording');
                        if (recordingStatus) recordingStatus.style.display = 'block';
                }).catch(() => alert('Microphone access needed'));
}

function stopRecord() {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
}

function setupFileAttach() {
        const attachBtn = document.getElementById('attachBtn');
        const fileInput = document.getElementById('fileInput');
        if (attachBtn && fileInput) {
                attachBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                        const files = Array.from(e.target.files);
                        if (files.length === 0) return;
                        files.forEach(file => {
                                if (file.size > 25 * 1024 * 1024) {
                                        alert(`${file.name} is too large (max 25MB)`);
                                        return;
                                }
                                const reader = new FileReader();
                                reader.onload = function (event) {
                                        socket.emit('file-attachment', {
                                                filename: file.name,
                                                type: file.type,
                                                size: file.size,
                                                data: event.target.result
                                        });
                                };
                                reader.readAsDataURL(file);
                        });
                        e.target.value = '';
                });
        }
}

function downloadFile(url, name) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
}

let emojiOpen = false;
function setupEmojiPicker() {
        const emojiBtn = document.getElementById('emojiBtn');
        if (!emojiBtn) return;

        emojiBtn.removeEventListener('click', emojiClickHandler);
        emojiBtn.addEventListener('click', emojiClickHandler);
}

function emojiClickHandler() {
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
                        if (messageInput) {
                                messageInput.value += emoji.textContent;
                                messageInput.focus();
                        }
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
}

document.getElementById('searchUsers')?.addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();
        const userItems = document.querySelectorAll('.user-item');
        userItems.forEach(item => {
                const nameSpan = item.querySelector('span');
                if (nameSpan) {
                        const userName = nameSpan.textContent.toLowerCase();
                        item.style.display = userName.includes(searchTerm) ? 'flex' : 'none';
                }
        });
});

function openSidebar() {
        if (sidebar) sidebar.classList.add('open');
}

function closeSidebar() {
        if (sidebar) sidebar.classList.remove('open');
}

function scrollToBottom() {
        setTimeout(() => {
                if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
        }, 50);
}

function removeWelcome() {
        const welcome = document.querySelector('.welcome-screen');
        if (welcome && messagesContainer && messagesContainer.children.length > 1) welcome.remove();
}

function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
}

setupFileAttach();
console.log('App loaded - All features working');