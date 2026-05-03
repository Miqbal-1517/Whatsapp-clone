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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users
const users = new Map();

io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        // Handle user joining
        socket.on('user-join', (username) => {
                if (!username || username.trim() === '') return;

                users.set(socket.id, username.trim());
                socket.username = username.trim();

                // Send current users list to new user
                const userList = Array.from(users.values());
                socket.emit('users-list', userList);

                // Broadcast to all other users
                socket.broadcast.emit('user-joined', {
                        username: username.trim(),
                        timestamp: new Date().toISOString()
                });

                // Update user count for everyone
                io.emit('user-count', users.size);
        });

        // Handle sending messages - FIXED: Only broadcast once
        socket.on('send-message', (messageData) => {
                const message = {
                        id: Date.now() + Math.random(),
                        username: users.get(socket.id),
                        content: messageData.content.trim(),
                        timestamp: new Date().toISOString()
                };

                // Broadcast to ALL clients including sender
                io.emit('receive-message', message);
        });

        // Handle typing indicator
        socket.on('typing', (isTyping) => {
                socket.broadcast.emit('user-typing', {
                        username: users.get(socket.id),
                        isTyping: isTyping
                });
        });

        // Handle private message
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

                        // Send to target user
                        io.to(targetSocket[0]).emit('private-message', privateMsg);

                        // Send confirmation to sender
                        socket.emit('private-message-sent', privateMsg);
                }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
                const username = users.get(socket.id);
                if (username) {
                        users.delete(socket.id);
                        io.emit('user-left', {
                                username: username,
                                timestamp: new Date().toISOString()
                        });
                        io.emit('user-count', users.size);

                        // Update users list for everyone
                        const userList = Array.from(users.values());
                        io.emit('users-list', userList);
                }
                console.log('User disconnected:', socket.id);
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📱 Open this URL on multiple devices to test chat`);
});