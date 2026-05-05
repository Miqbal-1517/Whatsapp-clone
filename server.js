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
        console.log('User connected:', socket.id);

        socket.on('user-join', (username) => {
                if (!username || username.trim() === '') return;

                const cleanUsername = username.trim();
                users.set(socket.id, cleanUsername);
                socket.username = cleanUsername;

                io.emit('users-list', Array.from(users.values()));
                socket.broadcast.emit('user-joined', { username: cleanUsername });
                io.emit('user-count', users.size);
        });

        socket.on('send-message', (messageData) => {
                const sender = users.get(socket.id);
                if (!sender) return;

                io.emit('receive-message', {
                        messageId: Date.now() + Math.random(),
                        type: 'text',
                        username: sender,
                        content: messageData.content.trim(),
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
        });

        socket.on('voice-message', (data) => {
                const sender = users.get(socket.id);
                if (!sender) return;

                io.emit('receive-voice', {
                        messageId: Date.now() + Math.random(),
                        type: 'voice',
                        username: sender,
                        audio: data.audio,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
        });

        socket.on('file-attachment', (fileData) => {
                const sender = users.get(socket.id);
                if (!sender) return;

                io.emit('receive-file', {
                        messageId: Date.now() + Math.random(),
                        type: 'file',
                        username: sender,
                        filename: fileData.filename,
                        fileType: fileData.type,
                        fileSize: fileData.size,
                        fileData: fileData.data,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
        });

        socket.on('delete-message', ({ messageId, deleteFor }) => {
                if (deleteFor === 'everyone') {
                        io.emit('message-deleted', { messageId });
                } else {
                        socket.emit('message-deleted', { messageId });
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
                const target = Array.from(users.entries()).find(([_, name]) => name === data.to);

                if (target && target[0] !== socket.id) {
                        io.to(target[0]).emit('private-message', {
                                from: sender,
                                content: data.message.trim(),
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        });
                        socket.emit('private-message-sent', { to: data.to });
                }
        });

        socket.on('disconnect', () => {
                const username = users.get(socket.id);
                if (username) {
                        users.delete(socket.id);
                        io.emit('users-list', Array.from(users.values()));
                        socket.broadcast.emit('user-left', { username });
                        io.emit('user-count', users.size);
                }
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));