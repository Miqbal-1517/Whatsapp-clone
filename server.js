const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        maxHttpBufferSize: 50e6,
        pingTimeout: 60000,
        pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();

io.on('connection', (socket) => {
        console.log('🟢 User connected:', socket.id);

        socket.on('user-join', (username) => {
                if (!username || username.trim() === '') return;

                const cleanUsername = username.trim();
                users.set(socket.id, cleanUsername);
                socket.username = cleanUsername;

                const userList = Array.from(users.values());
                io.emit('users-list', userList);
                socket.broadcast.emit('user-joined', { username: cleanUsername, timestamp: new Date().toISOString() });
                io.emit('user-count', users.size);
        });

        socket.on('send-message', (messageData) => {
                const senderUsername = users.get(socket.id);
                if (!senderUsername) return;

                io.emit('receive-message', {
                        id: Date.now() + Math.random(),
                        type: 'text',
                        username: senderUsername,
                        content: messageData.content.trim(),
                        timestamp: new Date().toISOString(),
                        messageId: Date.now() + Math.random()
                });
        });

        socket.on('voice-message', (data) => {
                const senderUsername = users.get(socket.id);
                if (!senderUsername) return;

                io.emit('receive-voice', {
                        id: Date.now() + Math.random(),
                        type: 'voice',
                        username: senderUsername,
                        audio: data.audio,
                        timestamp: new Date().toISOString(),
                        messageId: Date.now() + Math.random()
                });
        });

        socket.on('file-attachment', (fileData) => {
                const senderUsername = users.get(socket.id);
                if (!senderUsername) return;

                io.emit('receive-file', {
                        id: Date.now() + Math.random(),
                        type: 'file',
                        username: senderUsername,
                        filename: fileData.filename,
                        fileType: fileData.type,
                        fileSize: fileData.size,
                        fileData: fileData.data,
                        timestamp: new Date().toISOString(),
                        messageId: Date.now() + Math.random()
                });
        });

        socket.on('delete-message', ({ messageId, deleteFor }) => {
                if (deleteFor === 'everyone') {
                        io.emit('message-deleted', { messageId, deleteFor: 'everyone' });
                } else {
                        socket.emit('message-deleted', { messageId, deleteFor: 'me' });
                }
        });

        socket.on('typing', (isTyping) => {
                const username = users.get(socket.id);
                if (username) {
                        socket.broadcast.emit('user-typing', { username, isTyping });
                }
        });

        socket.on('private-message', (data) => {
                const sender = users.get(socket.id);
                const targetEntry = Array.from(users.entries()).find(([_, name]) => name === data.to);

                if (targetEntry && targetEntry[0] !== socket.id) {
                        io.to(targetEntry[0]).emit('private-message', {
                                from: sender, to: data.to, content: data.message.trim(), timestamp: new Date().toISOString()
                        });
                        socket.emit('private-message-sent', { to: data.to });
                }
        });

        socket.on('disconnect', () => {
                const username = users.get(socket.id);
                if (username) {
                        users.delete(socket.id);
                        io.emit('users-list', Array.from(users.values()));
                        socket.broadcast.emit('user-left', { username, timestamp: new Date().toISOString() });
                        io.emit('user-count', users.size);
                }
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 WhatsApp Clone running on port ${PORT}`);
});