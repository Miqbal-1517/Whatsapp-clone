const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
        cors: {
                origin: "*",
                methods: ["GET", "POST"]
        }
});

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map();

io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.on('user-join', (username) => {
                if (!username || username.trim() === '') return;

                users.set(socket.id, username.trim());
                socket.username = username.trim();

                const userList = Array.from(users.values());
                socket.emit('users-list', userList);

                socket.broadcast.emit('user-joined', {
                        username: username.trim(),
                        timestamp: new Date().toISOString()
                });

                io.emit('user-count', users.size);
        });

        // Text Message Handler
        socket.on('send-message', (messageData) => {
                const senderUsername = users.get(socket.id);

                const message = {
                        id: Date.now() + Math.random(),
                        username: senderUsername,
                        content: messageData.content.trim(),
                        timestamp: new Date().toISOString()
                };

                console.log('📨 Text message from:', senderUsername);

                socket.broadcast.emit('receive-message', message);
                socket.emit('self-message', message);
        });

        // Voice Message Handler
        socket.on('voice-message', (data) => {
                const voiceData = {
                        ...data,
                        id: Date.now() + Math.random()
                };

                console.log('🎙️ Voice message from:', data.username);

                socket.broadcast.emit('receive-voice', voiceData);
                socket.emit('self-voice', voiceData);
        });

        socket.on('typing', (isTyping) => {
                socket.broadcast.emit('user-typing', {
                        username: users.get(socket.id),
                        isTyping: isTyping
                });
        });

        socket.on('private-message', (data) => {
                const targetSocket = Array.from(users.entries()).find(
                        ([_, name]) => name === data.to
                );

                if (targetSocket && targetSocket[0] !== socket.id) {
                        const privateMsg = {
                                from: users.get(socket.id),
                                to: data.to,
                                message: data.message.trim(),
                                timestamp: new Date().toISOString(),
                                isPrivate: true
                        };

                        io.to(targetSocket[0]).emit('private-message', privateMsg);
                        socket.emit('private-message-sent', privateMsg);
                }
        });

        socket.on('disconnect', () => {
                const username = users.get(socket.id);
                if (username) {
                        users.delete(socket.id);
                        io.emit('user-left', {
                                username: username,
                                timestamp: new Date().toISOString()
                        });
                        io.emit('user-count', users.size);

                        const userList = Array.from(users.values());
                        io.emit('users-list', userList);
                }
                console.log('User disconnected:', socket.id);
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`🎙️ Voice messages enabled!`);
});