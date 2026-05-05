const socket = io();
let currentUser = '';
let mediaRecorder, audioChunks = [], isRecording = false;
let currentMessageToDelete = null;
let longPressTimer = null;
let typingTimer = null;
let messageCount = 0;

const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages-container');
const messagesArea = document.getElementById('messages-area');

function joinChat() {
        const username = document.getElementById('username').value.trim();
        if (!username) return alert('Enter username');
        currentUser = username;
        socket.emit('user-join', username);
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        document.getElementById('current-user-name').textContent = currentUser;
        setTimeout(() => messageInput?.focus(), 100);
}

socket.on('users-list', (users) => {
        const container = document.getElementById('users-list');
        const others = users.filter(u => u !== currentUser);
        if (others.length === 0) {
                container.innerHTML = '<div class="no-users">No others online</div>';
        } else {
                container.innerHTML = others.map(u => `<div class="user-item" onclick="sendPrivateMessage('${escapeHtml(u)}')"><i class="fas fa-user-circle"></i><span class="user-name">${escapeHtml(u)}</span><i class="fas fa-envelope private-icon"></i></div>`).join('');
        }
});

socket.on('user-count', (count) => document.getElementById('online-count').textContent = count);
socket.on('user-joined', (data) => addSystemMessage(`${escapeHtml(data.username)} joined`));
socket.on('user-left', (data) => addSystemMessage(`${escapeHtml(data.username)} left`));
socket.on('receive-message', (msg) => renderMessage(msg));
socket.on('receive-voice', (data) => renderMessage(data));
socket.on('receive-file', (data) => renderMessage(data));

socket.on('message-deleted', ({ messageId, deleteFor }) => {
        const el = document.querySelector(`[data-id="${messageId}"]`);
        if (el) {
                if (deleteFor === 'everyone') {
                        const bubble = el.querySelector('.message-bubble');
                        if (bubble) { bubble.innerHTML = '<span class="deleted-text"><i class="fas fa-trash-alt"></i> Deleted</span>'; bubble.classList.add('deleted'); }
                } else { el.remove(); }
        }
});

socket.on('user-typing', ({ username, isTyping }) => {
        const indicator = document.getElementById('typing-indicator');
        indicator.innerHTML = (isTyping && username !== currentUser) ? `${username} typing...` : '';
});

socket.on('private-message', ({ from, content, timestamp }) => addPrivateMessage(from, content, timestamp));
socket.on('private-message-sent', ({ to }) => addSystemMessage(`🔒 Private to ${to}`));

function sendMessage() {
        const msg = messageInput?.value.trim();
        if (!msg) return;
        socket.emit('send-message', { content: msg });
        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();
}

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
                if (msg.fileType?.startsWith('image/')) {
                        contentHtml = `<img src="${msg.fileData}" class="file-preview" onclick="window.open(this.src)">`;
                } else if (msg.fileType?.startsWith('video/')) {
                        contentHtml = `<video controls src="${msg.fileData}" class="file-preview"></video>`;
                } else {
                        contentHtml = `<div class="file-attach"><i class="fas fa-file"></i><span>${escapeHtml(msg.filename)} (${(msg.fileSize / 1024).toFixed(1)} KB)</span><button onclick="downloadFile('${msg.fileData}', '${msg.filename}')" class="download-btn">Download</button></div>`;
                }
        } else {
                contentHtml = `<span>${escapeHtml(msg.content)}</span>`;
        }

        div.innerHTML = `<div class="message-bubble ${isSent ? 'sent-bubble' : 'received-bubble'}"><div class="message-header"><span class="msg-username">${escapeHtml(msg.username)}</span><span class="msg-time">${time}</span></div><div class="msg-content">${contentHtml}</div></div>`;

        // Mobile long press delete
        div.addEventListener('touchstart', () => { longPressTimer = setTimeout(() => showDeleteModal(msg.messageId, isSent), 500); });
        div.addEventListener('touchend', () => clearTimeout(longPressTimer));
        div.addEventListener('touchmove', () => clearTimeout(longPressTimer));
        div.addEventListener('contextmenu', (e) => { e.preventDefault(); showDeleteModal(msg.messageId, isSent); });

        messagesContainer.appendChild(div);
        setTimeout(() => messagesArea.scrollTop = messagesArea.scrollHeight, 50);

        const welcome = messagesContainer.querySelector('.welcome-chat');
        if (welcome && messagesContainer.children.length > 1) welcome.remove();
        if (++messageCount > 50) { while (messagesContainer.children.length > 40) messagesContainer.removeChild(messagesContainer.firstChild); }
}

function downloadFile(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }

function showDeleteModal(messageId, isSent) {
        currentMessageToDelete = { messageId, isSent };
        const modal = document.getElementById('delete-modal');
        modal.querySelector('.delete-option:first-child').style.display = isSent ? 'flex' : 'none';
        modal.classList.add('show');
}

function deleteMessageConfirm(deleteFor) {
        if (deleteFor === 'everyone' && currentMessageToDelete?.isSent) socket.emit('delete-message', { messageId: currentMessageToDelete.messageId, deleteFor: 'everyone' });
        else if (deleteFor === 'me') socket.emit('delete-message', { messageId: currentMessageToDelete.messageId, deleteFor: 'me' });
        closeDeleteModal();
}
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('show'); currentMessageToDelete = null; }

function addSystemMessage(text) {
        const div = document.createElement('div'); div.className = 'system-message'; div.innerHTML = `<span>${escapeHtml(text)}</span>`;
        messagesContainer.appendChild(div); messagesArea.scrollTop = messagesArea.scrollHeight;
        const welcome = messagesContainer.querySelector('.welcome-chat'); if (welcome) welcome.remove();
}
function addPrivateMessage(from, msg, ts) {
        const div = document.createElement('div'); div.className = 'message private';
        const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `<div class="message-bubble private-bubble"><div class="message-header"><span class="msg-username">🔒 ${escapeHtml(from)}</span><span class="msg-time">${time}</span></div><div class="msg-content">${escapeHtml(msg)}</div></div>`;
        messagesContainer.appendChild(div); messagesArea.scrollTop = messagesArea.scrollHeight;
}
function sendPrivateMessage(to) { const msg = prompt(`Private to ${to}:`); if (msg?.trim()) socket.emit('private-message', { to, message: msg.trim() }); }

// VOICE RECORDING
const micBtn = document.getElementById('mic-btn');
const recordingStatus = document.getElementById('recording-status');
micBtn?.addEventListener('mousedown', startRecording);
micBtn?.addEventListener('mouseup', stopRecording);
micBtn?.addEventListener('mouseleave', stopRecording);
micBtn?.addEventListener('touchstart', startRecording);
micBtn?.addEventListener('touchend', stopRecording);

function startRecording(e) {
        e.preventDefault();
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                mediaRecorder = new MediaRecorder(stream); audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                        const blob = new Blob(audioChunks, { type: 'audio/webm' });
                        const reader = new FileReader();
                        reader.onloadend = () => socket.emit('voice-message', { audio: reader.result });
                        reader.readAsDataURL(blob);
                        stream.getTracks().forEach(t => t.stop());
                        recordingStatus.style.display = 'none'; micBtn.classList.remove('recording');
                };
                mediaRecorder.start(); micBtn.classList.add('recording'); recordingStatus.style.display = 'block';
        }).catch(() => alert('Microphone access needed'));
}
function stopRecording() { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); }

// FILE ATTACHMENT
document.getElementById('attach-btn')?.addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('file-input')?.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
                if (file.size > 25e6) return alert(`${file.name} too large`);
                const reader = new FileReader();
                reader.onloadend = () => socket.emit('file-attachment', { filename: file.name, type: file.type, size: file.size, data: reader.result });
                reader.readAsDataURL(file);
        });
        e.target.value = '';
});

// EMOJI PICKER - SIMPLE & FAST
let emojiOpen = false;
document.getElementById('emoji-btn')?.addEventListener('click', () => {
        if (emojiOpen) return;
        const existing = document.querySelector('.emoji-picker');
        if (existing) existing.remove();

        const picker = document.createElement('div'); picker.className = 'emoji-picker';
        const emojis = '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😍🥰😘😗😙😚😋😛😜🤪😝🤑🤗🤩🥳😎🤓🧐😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝👍👎👌✌️🤞🤟🤘👊💪🖕👆👇👈👉🖐️🤙';
        picker.innerHTML = `<div class="emoji-grid">${emojis.split('').map(e => `<span class="emoji">${e}</span>`).join('')}</div>`;
        document.body.appendChild(picker); emojiOpen = true;

        picker.querySelectorAll('.emoji').forEach(e => e.addEventListener('click', () => { messageInput.value += e.textContent; messageInput.focus(); picker.remove(); emojiOpen = false; }));
        const closePicker = (e) => { if (!picker.contains(e.target) && e.target !== document.getElementById('emoji-btn')) { picker.remove(); emojiOpen = false; document.removeEventListener('click', closePicker); } };
        setTimeout(() => document.addEventListener('click', closePicker), 100);
});

// INPUT HANDLERS
messageInput?.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; });
messageInput?.addEventListener('input', () => { socket.emit('typing', true); clearTimeout(typingTimer); typingTimer = setTimeout(() => socket.emit('typing', false), 1000); });
messageInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

// SEARCH
document.getElementById('search-users')?.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        document.querySelectorAll('.user-item').forEach(user => { const name = user.querySelector('.user-name')?.textContent.toLowerCase(); user.style.display = name?.includes(search) ? 'flex' : 'none'; });
});

// SIDEBAR
function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); document.getElementById('sidebar-overlay')?.classList.toggle('show'); }
document.getElementById('sidebar-overlay')?.addEventListener('click', toggleSidebar);

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

setTimeout(() => messageInput?.focus(), 100);
console.log('✅ WhatsApp Clone Mobile Optimized');