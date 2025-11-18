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
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/disaster_relief";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 2. EXISTING SCHEMA (The Live State) ---
const AgentSchema = new mongoose.Schema({
    agentId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['IDLE', 'BUSY', 'RETURNING', 'CHARGING', 'RESCUING'], default: 'IDLE' },
    battery: Number,
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number]
    },
    lastUpdated: { type: Date, default: Date.now }
});
AgentSchema.index({ location: '2dsphere' });
// Forces collection name to be 'roorkee_bots'
const Agent = mongoose.model('Agent', AgentSchema, 'roorkee_bots');

// --- 3. NEW SCHEMAS (The Orchestra Layer) ---

// A. SESSION: Tracks a specific "Run" of the simulation
const SessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    startTime: { type: Date, default: Date.now },
    activeAgents: Number,
    status: { type: String, default: 'ACTIVE' }
});
const Session = mongoose.model('Session', SessionSchema, 'orchestra_sessions');

// B. AUDIT LOG: Tracks every decision made
const AuditLogSchema = new mongoose.Schema({
    sessionId: String,
    timestamp: { type: Date, default: Date.now },
    eventType: String, // e.g., "TASK_ASSIGNED", "BATTERY_LOW", "MISSION_COMPLETE"
    agentId: String,
    details: Object
});
const AuditLog = mongoose.model('AuditLog', AuditLogSchema, 'orchestra_logs');


// --- 4. SOCKET SERVER ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
    console.log('🔗 New Client Connected:', socket.id);

    // --- A. NEW: HANDLE SESSION START ---
    socket.on('init_session', async (data) => {
        console.log(`🎬 New Session Started: ${data.sessionId}`);
        await Session.create({
            sessionId: data.sessionId,
            activeAgents: data.agentCount
        });
    });

    // --- B. NEW: HANDLE LOGS ---
    socket.on('log_event', async (data) => {
        // Save history to MongoDB for analytics later
        await AuditLog.create({
            sessionId: data.sessionId,
            eventType: data.eventType,
            agentId: data.agentId,
            details: data.details
        });
    });

    // --- C. EXISTING: AGENT MOVEMENT ---
    socket.on('agent_movement', async (data) => {
        await Agent.findOneAndUpdate(
            { agentId: data.agentId },
            {
                location: { type: 'Point', coordinates: [data.lng, data.lat] },
                status: data.status,
                battery: data.battery,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        io.emit('map_update', data);
    });

    // --- D. EXISTING: DISASTERS ---
    socket.on('create_disaster', (data) => {
        console.log('🔥 Disaster Reported at:', data);
        io.emit('disaster_spawned', data);
        io.emit('new_task', data);

        // Optional: Log this as a system event
        // AuditLog.create({ eventType: "DISASTER_SPAWN", details: data });
    });

    socket.on('mission_complete', (data) => {
        console.log('✅ Mission Complete at:', data);
        io.emit('disaster_resolved', data);
    });

    socket.on('disconnect', () => {
        console.log('❌ Client Disconnected:', socket.id);
    });
});

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on PORT ${PORT}`);
});