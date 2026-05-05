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
        },
        maxHttpBufferSize: 50e6 // 50MB for file uploads
});

app.use(express.static(path.join(__dirname, 'public')));

// Store users and messages
const users = new Map();
const messages = []; // Store last 100 messages for new users
const MAX_MESSAGES = 100;

io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        // User join
        socket.on('user-join', (username) => {
                if (!username || username.trim() === '') return;

                users.set(socket.id, username.trim());
                socket.username = username.trim();

                // Send previous messages to new user
                socket.emit('previous-messages', messages.slice(-MAX_MESSAGES));

                // Send current users list
                const userList = Array.from(users.values());
                io.emit('users-list', userList);

                // Broadcast user joined to EVERYONE including sender?
                // No - sender doesn't need to see their own join message
                socket.broadcast.emit('user-joined', {
                        username: username.trim(),
                        timestamp: new Date().toISOString(),
                        id: Date.now()
                });

                io.emit('user-count', users.size);

                console.log(`${username} joined. Total users: ${users.size}`);
        });

        // Text message handler
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

                messages.push(message);
                if (messages.length > MAX_MESSAGES) messages.shift();

                // Broadcast to all clients
                io.emit('receive-message', message);
                console.log(`📨 ${senderUsername}: ${message.content}`);
        });

        // Voice message handler
        socket.on('voice-message', (data) => {
                const senderUsername = users.get(socket.id);
                if (!senderUsername) return;

                const voiceData = {
                        id: Date.now() + Math.random(),
                        type: 'voice',
                        username: senderUsername,
                        audio: data.audio,
                        duration: data.duration || 0,
                        timestamp: new Date().toISOString(),
                        messageId: Date.now() + Math.random()
                };

                messages.push(voiceData);
                if (messages.length > MAX_MESSAGES) messages.shift();

                io.emit('receive-voice', voiceData);
                console.log(`🎙️ Voice from: ${senderUsername}`);
        });

        // File attachment handler
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

                messages.push(fileMsg);
                if (messages.length > MAX_MESSAGES) messages.shift();

                io.emit('receive-file', fileMsg);
                console.log(`📎 File from: ${senderUsername} - ${fileData.filename}`);
        });

        // Delete message handler
        socket.on('delete-message', (messageId) => {
                const messageIndex = messages.findIndex(m => m.messageId === messageId);
                if (messageIndex !== -1) {
                        messages[messageIndex].deleted = true;
                        messages[messageIndex].deletedFor = 'everyone';
                }

                io.emit('message-deleted', {
                        messageId: messageId,
                        deletedFor: 'everyone'
                });

                console.log(`🗑️ Message deleted: ${messageId}`);
        });

        // Delete for me only
        socket.on('delete-for-me', (messageId) => {
                socket.emit('message-deleted', {
                        messageId: messageId,
                        deletedFor: 'me'
                });
        });

        // Typing indicator
        socket.on('typing', (isTyping) => {
                socket.broadcast.emit('user-typing', {
                        username: users.get(socket.id),
                        isTyping: isTyping
                });
        });

        // Private message
        socket.on('private-message', (data) => {
                const targetSocket = Array.from(users.entries()).find(
                        ([_, name]) => name === data.to
                );

                if (targetSocket && targetSocket[0] !== socket.id) {
                        const privateMsg = {
                                id: Date.now() + Math.random(),
                                type: 'private',
                                from: users.get(socket.id),
                                to: data.to,
                                content: data.message.trim(),
                                timestamp: new Date().toISOString()
                        };

                        io.to(targetSocket[0]).emit('private-message', privateMsg);
                        socket.emit('private-message-sent', privateMsg);
                }
        });

        // Disconnect
        socket.on('disconnect', () => {
                const username = users.get(socket.id);
                if (username) {
                        users.delete(socket.id);
                        io.emit('user-left', {
                                username: username,
                                timestamp: new Date().toISOString(),
                                id: Date.now()
                        });
                        io.emit('user-count', users.size);

                        const userList = Array.from(users.values());
                        io.emit('users-list', userList);

                        console.log(`${username} left. Total users: ${users.size}`);
                }
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`✅ WhatsApp Clone with ALL features is ready!`);
});