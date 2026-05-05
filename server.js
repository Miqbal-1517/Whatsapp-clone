const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        maxHttpBufferSize: 50e6
});

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();
// NO previous messages storage - fresh chat for each session

io.on('connection', (socket) => {
        console.log('🟢 User connected:', socket.id);

        // ========== USER JOIN ==========
        socket.on('user-join', (username) => {
                if (!username || username.trim() === '') return;

                const cleanUsername = username.trim();
                users.set(socket.id, cleanUsername);
                socket.username = cleanUsername;

                // Send current users list to ALL
                const userList = Array.from(users.values());
                io.emit('users-list', userList);

                // Broadcast to OTHERS that user joined
                socket.broadcast.emit('user-joined', {
                        username: cleanUsername,
                        timestamp: new Date().toISOString()
                });

                // Update online count for ALL
                io.emit('user-count', users.size);

                console.log(`✅ ${cleanUsername} joined. Total: ${users.size}`);
        });

        // ========== TEXT MESSAGE ==========
        socket.on('send-message', (messageData) => {
                const senderUsername = users.get(socket.id);
                if (!senderUsername) return;

                const message = {
                        id: Date.now() + Math.random(),
                        type: 'text',
                        username: senderUsername,
                        content: messageData.content.trim(),
                        timestamp: new Date().toISOString(),
                        messageId: Date.now() + Math.random()
                };

                io.emit('receive-message', message);
        });

        // ========== VOICE MESSAGE ==========
        socket.on('voice-message', (data) => {
                const senderUsername = users.get(socket.id);
                if (!senderUsername) return;

                const voiceData = {
                        id: Date.now() + Math.random(),
                        type: 'voice',
                        username: senderUsername,
                        audio: data.audio,
                        timestamp: new Date().toISOString(),
                        messageId: Date.now() + Math.random()
                };

                io.emit('receive-voice', voiceData);
        });

        // ========== FILE ATTACHMENT ==========
        socket.on('file-attachment', (fileData) => {
                const senderUsername = users.get(socket.id);
                if (!senderUsername) return;

                const fileMsg = {
                        id: Date.now() + Math.random(),
                        type: 'file',
                        username: senderUsername,
                        filename: fileData.filename,
                        fileType: fileData.type,
                        fileSize: fileData.size,
                        fileData: fileData.data,
                        timestamp: new Date().toISOString(),
                        messageId: Date.now() + Math.random()
                };

                io.emit('receive-file', fileMsg);
        });

        // ========== DELETE MESSAGE (WhatsApp style) ==========
        socket.on('delete-message', ({ messageId, deleteFor }) => {
                if (deleteFor === 'everyone') {
                        io.emit('message-deleted', { messageId, deleteFor: 'everyone' });
                } else {
                        socket.emit('message-deleted', { messageId, deleteFor: 'me' });
                }
        });

        // ========== TYPING INDICATOR ==========
        socket.on('typing', (isTyping) => {
                const username = users.get(socket.id);
                if (username) {
                        socket.broadcast.emit('user-typing', { username, isTyping });
                }
        });

        // ========== PRIVATE MESSAGE ==========
        socket.on('private-message', (data) => {
                const sender = users.get(socket.id);
                const targetEntry = Array.from(users.entries()).find(([_, name]) => name === data.to);

                if (targetEntry && targetEntry[0] !== socket.id) {
                        const privateMsg = {
                                from: sender,
                                to: data.to,
                                content: data.message.trim(),
                                timestamp: new Date().toISOString()
                        };
                        io.to(targetEntry[0]).emit('private-message', privateMsg);
                        socket.emit('private-message-sent', privateMsg);
                }
        });

        // ========== DISCONNECT ==========
        socket.on('disconnect', () => {
                const username = users.get(socket.id);
                if (username) {
                        users.delete(socket.id);

                        const userList = Array.from(users.values());
                        io.emit('users-list', userList);

                        socket.broadcast.emit('user-left', {
                                username: username,
                                timestamp: new Date().toISOString()
                        });

                        io.emit('user-count', users.size);
                        console.log(`🔴 ${username} left. Total: ${users.size}`);
                }
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 WhatsApp Clone running on port ${PORT}`);
});