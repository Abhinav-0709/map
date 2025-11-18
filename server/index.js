require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. MONGODB CONNECTION ---
// Make sure your .env file has MONGO_URI or use the string below
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/disaster_relief";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 2. SCHEMA DEFINITION ---
const AgentSchema = new mongoose.Schema({
    agentId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['IDLE', 'BUSY'], default: 'IDLE' },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number] // [longitude, latitude]
    },
    lastUpdated: { type: Date, default: Date.now }
});
// Geospatial Index for "Find Nearest" queries
AgentSchema.index({ location: '2dsphere' });

const Agent = mongoose.model('Agent', AgentSchema);

// --- 3. SOCKET SERVER SETUP ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow React (port 5173) and Python to connect
        methods: ["GET", "POST"]
    }
});

// --- 4. SOCKET EVENT LISTENERS ---
io.on('connection', (socket) => {
    console.log('🔗 New Client Connected:', socket.id);

    // --- HANDLING AGENT MOVEMENT (From Python) ---
    socket.on('agent_movement', async (data) => {
        // Log occasionally or just process silently to keep console clean
        // console.log(`📡 Update from ${data.agentId}`);

        // 1. Update DB (Upsert)
        await Agent.findOneAndUpdate(
            { agentId: data.agentId },
            {
                location: { type: 'Point', coordinates: [data.lng, data.lat] },
                status: data.status,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        // 2. Broadcast to React (Update the Map)
        io.emit('map_update', data);
    });

    // --- HANDLING DISASTERS (From React Clicks) ---
    socket.on('create_disaster', (data) => {
        console.log('🔥 Disaster Reported at:', data);

        // 1. Tell React to draw the red circle (Visual)
        io.emit('disaster_spawned', data);

        // 2. Tell Python Simulation to calculate path & assign a bot (Logic)
        io.emit('new_task', data);
    });

    socket.on('disconnect', () => {
        console.log('❌ Client Disconnected:', socket.id);
    });
});

// --- 5. START SERVER ---
const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on PORT ${PORT}`);
});