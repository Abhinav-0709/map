import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Rectangle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import io from 'socket.io-client';
import { Activity, Battery, Wifi, Sun, Moon, Map as MapIcon, BarChart3, Trophy, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Legend, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LineChart, Line, CartesianGrid } from 'recharts';

const socket = io.connect("http://localhost:5000");

// Roorkee Coordinates (Must match Python)
const DOCKS = [
  { id: 'Dock-Civil', lat: 29.8650, lng: 77.8950 },
  { id: 'Dock-IIT', lat: 29.8600, lng: 77.8800 }
];

function ClickHandler({ spawnDisaster }) {
  useMapEvents({ click(e) { spawnDisaster(e.latlng.lat, e.latlng.lng); }, });
  return null;
}

// --- COMPONENT: LEADERBOARD DASHBOARD ---
const Leaderboard = ({ darkMode }) => {
  const [data, setData] = useState([]);
  const [missionData, setMissionData] = useState([]);
  const [responseTimeData, setResponseTimeData] = useState([]);

  const PIE_COLORS = ['#ef4444', '#22c55e'];

  // Fetch data hook
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/benchmarks');
        const json = await res.json();
        setData(json);

        const resTimeRes = await fetch('http://localhost:5000/api/response-time-trend');
        const resTimeJson = await resTimeRes.json();
        setResponseTimeData(resTimeJson);

        const missionsCompleted = json.reduce((sum, d) => sum + d.missions, 0);
        const activeAgents = json.filter(d => d.status !== 'IDLE').length;

        setMissionData([
          { name: 'Total Missions Solved', value: missionsCompleted },
          { name: 'Total Agents Active', value: activeAgents }
        ]);

      } catch (err) { console.error(err); }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  if (data.length === 0) return <div style={{ height: '100%', padding: '40px', background: darkMode ? '#111827' : '#f3f4f6', color: darkMode ? 'white' : 'black', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'monospace' }}>Loading Analytics...</div>;

  return (
    <div style={{
      height: '100%', width: '100%', padding: '40px', boxSizing: 'border-box',
      background: darkMode ? '#111827' : '#f3f4f6', color: darkMode ? 'white' : 'black',
      overflowY: 'auto', fontFamily: 'monospace'
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '30px', borderBottom: `1px solid ${darkMode ? '#34d399' : '#059669'}`, paddingBottom: '10px' }}>
        <Trophy style={{ color: '#fbbf24' }} /> AGENT PERFORMANCE RANKING
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '30px', height: '80%' }}>

        {/* LEFT: LEADERBOARD CARDS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {data.map((agent, index) => (
            <div key={agent.id} style={{
              background: darkMode ? '#1f2937' : 'white', padding: '20px', borderRadius: '12px',
              border: index === 0 ? '2px solid #fbbf24' : `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: index === 0 ? '#fbbf24' : '#9ca3af', width: '40px', textAlign: 'center' }}>#{index + 1}</div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{agent.id}</div>
                    <div style={{ fontSize: '12px', color: agent.status === 'IDLE' ? '#9ca3af' : '#34d399' }}>Status: {agent.status}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '20px', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>MISSIONS</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#34d399' }}>{agent.missions}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>SCORE</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#60a5fa' }}>{Math.round(agent.score)}</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', fontSize: '12px', color: '#9ca3af' }}>
                <Battery size={16} style={{ marginRight: '5px', color: agent.currentBattery < 20 ? '#ef4444' : '#34d399' }} />
                {Math.round(agent.currentBattery)}%
                <div style={{ width: '100%', height: '8px', background: '#374151', borderRadius: '4px', marginLeft: '10px' }}>
                  <div style={{ width: `${agent.currentBattery}%`, height: '100%', background: agent.currentBattery < 20 ? '#ef4444' : '#34d399', borderRadius: '4px' }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* MIDDLE: PIE & RADAR CHARTS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ background: darkMode ? '#1f2937' : 'white', padding: '20px', borderRadius: '12px', height: '50%' }}>
            <h3 style={{ marginBottom: '15px', fontFamily: 'monospace' }}>🎯 MISSION OUTCOMES</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={missionData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value" label>
                  {missionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />))}
                </Pie>
                <Tooltip />
                <Legend formatter={(value) => <span style={{ color: darkMode ? '#9ca3af' : '#374151' }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: darkMode ? '#1f2937' : 'white', padding: '20px', borderRadius: '12px', height: '50%' }}>
            <h3 style={{ marginBottom: '15px', fontFamily: 'monospace' }}>⚖️ EFFICIENCY COMPARISON</h3>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={data}>
                <PolarGrid stroke={darkMode ? "#374151" : "#e5e7eb"} />
                <PolarAngleAxis dataKey="id" tick={{ fill: darkMode ? '#9ca3af' : '#374151' }} />
                <Tooltip />
                <Radar name="Battery" dataKey="currentBattery" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.4} />
                <Radar name="Score" dataKey="score" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RIGHT: TIME-SERIES AND ALLOCATION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ background: darkMode ? '#1f2937' : 'white', padding: '20px', borderRadius: '12px', height: '50%' }}>
            <h3 style={{ marginBottom: '15px', fontFamily: 'monospace' }}>⏱️ RESPONSE TIME TREND</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={responseTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                <XAxis dataKey="time" stroke={darkMode ? "#9ca3af" : "#374151"} />
                <YAxis stroke={darkMode ? "#9ca3af" : "#374151"} label={{ value: 'Seconds', angle: -90, position: 'insideLeft', fill: darkMode ? '#9ca3af' : '#374151' }} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#34d399', color: 'white' }} />
                <Line type="monotone" dataKey="duration" stroke="#8884d8" strokeWidth={2} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: darkMode ? '#1f2937' : 'white', padding: '20px', borderRadius: '12px', height: '50%' }}>
            <h3 style={{ marginBottom: '15px', fontFamily: 'monospace' }}>⚙️ AGENT TIME ALLOCATION</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[{ name: 'Fleet', Rescuing: 40, Charging: 15, Idling: 45 }]}>
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fill: darkMode ? '#9ca3af' : '#374151' }} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#34d399', color: 'white' }} />
                <Legend />
                <Bar dataKey="Rescuing" stackId="a" fill="#34d399" />
                <Bar dataKey="Charging" stackId="a" fill="#60a5fa" />
                <Bar dataKey="Idling" stackId="a" fill="#9ca3af" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- MAIN APP COMPONENT ---
function App() {
  const [bots, setBots] = useState({});
  const [disasters, setDisasters] = useState([]);
  const [logs, setLogs] = useState([]);
  const [darkMode, setDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState('MAP');

  useEffect(() => {
    socket.on("connect", () => addLog("System Online: Connected to Roorkee Grid"));
    socket.on("map_update", (data) => setBots((prev) => ({ ...prev, [data.agentId]: data })));

    socket.on("disaster_spawned", (data) => {
      setDisasters((prev) => [...prev, { ...data, status: 'ACTIVE' }]);
      addLog(`⚠️ ALERT: Incident at [${data.lat.toFixed(3)}]`);
    });

    socket.on("disaster_resolved", (coords) => {
      setDisasters((prev) => prev.map((d) => {
        const isMatch = Math.abs(d.lat - coords.lat) < 0.0005 && Math.abs(d.lng - coords.lng) < 0.0005;
        if (isMatch && d.status !== 'SAFE') {
          addLog(`✅ SECURED: Area Safe [${d.lat.toFixed(3)}]`);
          return { ...d, status: 'SAFE' };
        }
        return d;
      }));
    });

    return () => { socket.off("map_update"); socket.off("disaster_spawned"); socket.off("disaster_resolved"); };
  }, []);

  const addLog = (msg) => setLogs(prev => [`> ${msg}`, ...prev.slice(0, 6)]);
  const spawnDisaster = (lat, lng) => socket.emit("create_disaster", { lat, lng, type: "Fire" });

  const connections = useMemo(() => {
    const botList = Object.values(bots);
    const lines = [];
    for (let i = 0; i < botList.length; i++) {
      for (let j = i + 1; j < botList.length; j++) {
        const dist = Math.sqrt(Math.pow(botList[i].lat - botList[j].lat, 2) + Math.pow(botList[i].lng - botList[j].lng, 2));
        if (dist < 0.01) lines.push([[botList[i].lat, botList[i].lng], [botList[j].lat, botList[j].lng]]);
      }
    }
    return lines;
  }, [bots]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: darkMode ? '#111827' : 'white' }}>

      {/* --- CONTROLS (Top Right) --- */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000, display: 'flex', gap: '10px' }}>
        {/* View Switcher */}
        <button onClick={() => setViewMode(viewMode === 'MAP' ? 'LEADERBOARD' : 'MAP')} style={{
          background: darkMode ? 'rgba(52, 211, 153, 0.2)' : '#e5e7eb', color: darkMode ? '#34d399' : 'black',
          border: `1px solid ${darkMode ? '#34d399' : '#9ca3af'}`, borderRadius: '8px', padding: '10px 15px',
          cursor: 'pointer', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'
        }}>
          {viewMode === 'MAP' ? <><BarChart3 size={18} /> RANKINGS</> : <><MapIcon size={18} /> LIVE MAP</>}
        </button>

        {/* Theme Toggle */}
        <button onClick={() => setDarkMode(!darkMode)} style={{
          background: darkMode ? 'rgba(255,255,255,0.2)' : 'white', color: darkMode ? 'white' : 'black',
          border: 'none', borderRadius: '50%', padding: '10px', cursor: 'pointer', backdropFilter: 'blur(5px)'
        }}>
          {darkMode ? <Sun size={24} /> : <Moon size={24} />}
        </button>
      </div>

      {/* --- CONDITIONAL RENDERING --- */}
      {viewMode === 'LEADERBOARD' ? (
        <Leaderboard darkMode={darkMode} />
      ) : (
        <>
          {/* HUD Stats */}
          <div style={{
            position: 'absolute', top: 20, left: 20, zIndex: 1000,
            background: darkMode ? 'rgba(17, 24, 39, 0.8)' : 'rgba(255, 255, 255, 0.9)',
            padding: '15px', borderRadius: '12px', color: darkMode ? 'white' : 'black',
            border: `1px solid ${darkMode ? '#34d399' : '#ccc'}`, backdropFilter: 'blur(8px)'
          }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: darkMode ? '#34d399' : '#059669', display: 'flex', gap: '10px' }}>
              <Activity size={18} /> ROORKEE OPS
            </h2>
            <div style={{ marginTop: '10px', fontSize: '13px', fontFamily: 'monospace' }}>
              <div>AGENTS: <strong>{Object.keys(bots).length}</strong></div>
              <div>THREATS: <strong style={{ color: '#ef4444' }}>{disasters.filter(d => d.status !== 'SAFE').length}</strong></div>
            </div>
          </div>

          {/* HUD Logs */}
          <div style={{
            position: 'absolute', bottom: 20, left: 20, zIndex: 1000,
            background: darkMode ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
            padding: '10px', borderRadius: '8px', color: darkMode ? '#34d399' : '#1f2937',
            width: '350px', borderLeft: `4px solid ${darkMode ? '#34d399' : '#059669'}`, fontFamily: 'monospace', fontSize: '11px'
          }}>
            {logs.map((log, i) => <div key={i} style={{ opacity: 1 - (i * 0.15) }}>{log}</div>)}
          </div>

          <MapContainer center={[29.8543, 77.8880]} zoom={14} zoomControl={false} style={{ height: '100%', width: '100%' }}>
            <TileLayer url={darkMode ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
            <ClickHandler spawnDisaster={spawnDisaster} />
            <Polyline positions={connections} pathOptions={{ color: darkMode ? 'cyan' : 'blue', weight: 1, opacity: 0.3, dashArray: '5, 10' }} />

            {/* Docks */}
            {DOCKS.map(dock => (
              <Rectangle key={dock.id} bounds={[[dock.lat - 0.001, dock.lng - 0.001], [dock.lat + 0.001, dock.lng + 0.001]]}
                pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.3 }}><Popup>⚡ CHARGING</Popup>
              </Rectangle>
            ))}

            {/* Disasters */}
            {disasters.map((d, i) => {
              const isSafe = d.status === 'SAFE';
              return <CircleMarker key={i} center={[d.lat, d.lng]} radius={isSafe ? 12 : 18}
                pathOptions={{ color: isSafe ? '#22c55e' : '#ef4444', fillColor: isSafe ? '#22c55e' : '#ef4444' }}>
                <Popup>{isSafe ? "✅ SAFE" : "🔥 INCIDENT"}</Popup>
              </CircleMarker>
            })}

            {/* Bots */}
            {Object.values(bots).map((bot) => {
              let color = '#34d399';
              if (bot.battery < 20) color = '#ef4444';
              if (bot.status === 'BUSY') color = '#fbbf24';
              if (bot.status === 'RESCUING') color = '#a855f7';
              if (bot.status === 'RETURNING' || bot.status === 'CHARGING') color = '#9ca3af';

              return (
                <CircleMarker key={bot.agentId} center={[bot.lat, bot.lng]} radius={12} pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}>
                  <Popup>
                    <strong>{bot.agentId}</strong><br />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Battery size={12} /> {Math.round(bot.battery)}%
                    </div>
                    <div style={{ width: '100%', height: '4px', background: '#333' }}>
                      <div style={{ width: `${bot.battery}%`, height: '100%', background: bot.battery < 20 ? 'red' : '#34d399' }}></div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </>
      )}
    </div>
  );
}
export default App;