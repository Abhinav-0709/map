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
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/roorkee_mission";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 2. SCHEMAS ---
const AgentSchema = new mongoose.Schema({
    agentId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['IDLE', 'BUSY', 'RETURNING', 'CHARGING', 'RESCUING'], default: 'IDLE' },
    battery: Number,
    location: { type: { type: String, default: 'Point' }, coordinates: [Number] },
    lastUpdated: { type: Date, default: Date.now }
});
AgentSchema.index({ location: '2dsphere' });
const Agent = mongoose.model('Agent', AgentSchema, 'roorkee_bots');

const SessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    startTime: { type: Date, default: Date.now },
    activeAgents: Number,
    status: { type: String, default: 'ACTIVE' }
});
const Session = mongoose.model('Session', SessionSchema, 'orchestra_sessions');

const AuditLogSchema = new mongoose.Schema({
    sessionId: String,
    timestamp: { type: Date, default: Date.now },
    eventType: String,
    agentId: String,
    details: Object
});
const AuditLog = mongoose.model('AuditLog', AuditLogSchema, 'orchestra_logs');

// --- 3. API ENDPOINTS ---

// A. Agent Benchmarks (Leaderboard data)
app.get('/api/benchmarks', async (req, res) => {
    try {
        const liveAgents = await Agent.find({});
        // Only fetch required log events for performance
        const missionLogs = await AuditLog.find({ eventType: "MISSION_COMPLETE" });

        const stats = {};

        // Initialize and safely count missions
        liveAgents.forEach(agent => {
            const agentMissions = missionLogs.filter(log => log.agentId === agent.agentId).length;

            stats[agent.agentId] = {
                id: agent.agentId,
                missions: agentMissions,
                currentBattery: agent.battery || 0, // Safe default
                status: agent.status,
                score: 0
            };
        });

        // Calculate Score
        Object.values(stats).forEach(agent => {
            agent.score = (agent.missions * 15) + (agent.currentBattery * 0.2);
            if (agent.status !== 'IDLE' && agent.status !== 'CHARGING') agent.score += 5;
        });

        const leaderboard = Object.values(stats).sort((a, b) => b.score - a.score);
        res.json(leaderboard);
    } catch (err) {
        // CRITICAL: Log the actual error that caused the crash
        console.error("MAJOR API CRASH IN BENCHMARKS:", err.message);
        // Respond with an empty array so the frontend doesn't crash on TypeError
        res.status(500).json([]);
    }
});

// B. Response Time Trend (New Line Chart Data)
// B. Response Time Trend (New Line Chart Data) - Now more forgiving on coordinates
app.get('/api/response-time-trend', async (req, res) => {
    try {
        const missionEvents = await AuditLog.find({
            eventType: { $in: ["TASK_ASSIGNED_FROM_RL", "MISSION_COMPLETE"] }
        }).sort({ timestamp: 1 });

        const missions = {};
        const responseTimes = [];

        missionEvents.forEach(log => {
            if (!log.agentId || !log.details) return; // Skip malformed logs

            const agentId = log.agentId;
            const eventType = log.eventType;

            // Use only the agentId and the rounded latitude as a mission key (less strict)
            const lat = log.details.lat || 0;
            const missionKey = `${agentId}-${Math.round(lat * 100)}`; // Using Math.round is more forgiving

            if (eventType === "TASK_ASSIGNED_FROM_RL") {
                missions[missionKey] = log.timestamp.getTime();
            } else if (eventType === "MISSION_COMPLETE") {
                const startTime = missions[missionKey];

                if (startTime) {
                    const durationMs = log.timestamp.getTime() - startTime;
                    responseTimes.push({
                        time: log.timestamp.toLocaleTimeString('en-US'),
                        duration: Math.round(durationMs / 1000)
                    });
                    delete missions[missionKey];
                }
            }
        });

        res.json(responseTimes.slice(-10));
    } catch (err) {
        console.error("MAJOR API CRASH IN RESPONSE TIME TREND:", err);
        res.status(500).json([]); // Return empty array to prevent frontend crash
    }
});


// --- 4. SOCKET SERVER ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
    // Session and Logging Handlers
    socket.on('init_session', async (data) => { await Session.create({ sessionId: data.sessionId, activeAgents: data.agentCount }); });
    socket.on('log_event', async (data) => { await AuditLog.create({ sessionId: data.sessionId, eventType: data.eventType, agentId: data.agentId, details: data.details }); });

    // Agent Movement and State Updates
    socket.on('agent_movement', async (data) => {
        await Agent.findOneAndUpdate(
            { agentId: data.agentId },
            { location: { type: 'Point', coordinates: [data.lng, data.lat] }, status: data.status, battery: data.battery, lastUpdated: new Date() },
            { upsert: true, new: true }
        );
        io.emit('map_update', data);
    });

    // Disaster Handlers
    socket.on('create_disaster', (data) => { io.emit('disaster_spawned', data); io.emit('new_task', data); });
    socket.on('mission_complete', (data) => { io.emit('disaster_resolved', data); });
});

const PORT = 5000;
server.listen(PORT, () => { console.log(`🚀 Server running on PORT ${PORT}`); });