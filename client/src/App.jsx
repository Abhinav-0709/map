import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Rectangle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import io from 'socket.io-client';
import { Activity, Battery, Wifi, AlertTriangle, ShieldCheck, Zap, Sun, Moon } from 'lucide-react';

const socket = io.connect("http://localhost:5000");

// Fixed Charging Station Coordinates (Must match Python)
const DOCKS = [
  { id: 'Dock-Civil', lat: 29.8650, lng: 77.8950 },
  { id: 'Dock-IIT', lat: 29.8600, lng: 77.8800 }
];

function ClickHandler({ spawnDisaster }) {
  useMapEvents({
    click(e) { spawnDisaster(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function App() {
  // --- STATE ---
  const [bots, setBots] = useState({});
  const [disasters, setDisasters] = useState([]);
  const [logs, setLogs] = useState([]);
  const [darkMode, setDarkMode] = useState(true); // THEME STATE

  // --- LISTENERS ---
  useEffect(() => {
    socket.on("connect", () => addLog("System Online: Neural Network Connected"));
    socket.on("map_update", (data) => setBots((prev) => ({ ...prev, [data.agentId]: data })));

    socket.on("disaster_spawned", (data) => {
      setDisasters((prev) => [...prev, { ...data, status: 'ACTIVE' }]);
      addLog(`⚠️ THREAT DETECTED at [${data.lat.toFixed(3)}]`);
    });

    socket.on("disaster_resolved", (coords) => {
      setDisasters((prev) => prev.map((d) => {
        const isMatch = Math.abs(d.lat - coords.lat) < 0.0005 && Math.abs(d.lng - coords.lng) < 0.0005;
        if (isMatch && d.status !== 'SAFE') {
          addLog(`✅ AREA SECURE: [${d.lat.toFixed(3)}]`);
          return { ...d, status: 'SAFE' };
        }
        return d;
      }));
    });

    return () => { socket.off("map_update"); socket.off("disaster_spawned"); socket.off("disaster_resolved"); };
  }, []);

  const addLog = (msg) => setLogs(prev => [`> ${msg}`, ...prev.slice(0, 6)]);
  const spawnDisaster = (lat, lng) => socket.emit("create_disaster", { lat, lng, type: "Fire" });

  // --- NETWORK LINES ---
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
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* === THEME TOGGLE (Top Right) === */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        style={{
          position: 'absolute', top: 20, right: 20, zIndex: 1000,
          background: darkMode ? 'rgba(255,255,255,0.2)' : 'white',
          color: darkMode ? 'white' : 'black',
          border: 'none', borderRadius: '50%', padding: '10px', cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)', backdropFilter: 'blur(5px)'
        }}
      >
        {darkMode ? <Sun size={24} /> : <Moon size={24} />}
      </button>

      {/* === HUD: STATS === */}
      <div style={{
        position: 'absolute', top: 20, left: 20, zIndex: 1000,
        background: darkMode ? 'rgba(17, 24, 39, 0.8)' : 'rgba(255, 255, 255, 0.9)', // Adaptive BG
        padding: '15px', borderRadius: '12px',
        color: darkMode ? 'white' : 'black', // Adaptive Text
        border: `1px solid ${darkMode ? '#34d399' : '#ccc'}`,
        backdropFilter: 'blur(8px)', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
      }}>
        <h2 style={{ margin: 0, fontSize: '16px', color: darkMode ? '#34d399' : '#059669', display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'monospace' }}>
          <Activity size={18} /> COMMAND CENTER
        </h2>
        <div style={{ marginTop: '12px', fontSize: '13px', fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', gap: '20px' }}>
            <span>AGENTS:</span> <strong>{Object.keys(bots).length}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>THREATS:</span> <strong style={{ color: '#ef4444' }}>{disasters.filter(d => d.status !== 'SAFE').length}</strong>
          </div>
        </div>
      </div>

      {/* === HUD: LOGS === */}
      <div style={{
        position: 'absolute', bottom: 20, left: 20, zIndex: 1000,
        background: darkMode ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
        padding: '12px', borderRadius: '8px',
        color: darkMode ? '#34d399' : '#1f2937',
        fontFamily: 'monospace', fontSize: '11px', width: '350px',
        borderLeft: `4px solid ${darkMode ? '#34d399' : '#059669'}`, pointerEvents: 'none'
      }}>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '4px', opacity: 1 - (i * 0.1) }}>{log}</div>
        ))}
      </div>

      {/* === MAP === */}
      <MapContainer center={[29.8543, 77.8880]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        {/* DYNAMIC TILE LAYER (Switches based on toggle) */}
        <TileLayer
          attribution='&copy; CartoDB / OSM'
          url={darkMode
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />

        <ClickHandler spawnDisaster={spawnDisaster} />

        <Polyline positions={connections} pathOptions={{ color: darkMode ? 'cyan' : 'blue', weight: 1, opacity: 0.3, dashArray: '5, 10' }} />

        {/* RENDER CHARGING STATIONS */}
        {DOCKS.map(dock => (
          <Rectangle
            key={dock.id}
            bounds={[[dock.lat - 0.001, dock.lng - 0.001], [dock.lat + 0.001, dock.lng + 0.001]]}
            pathOptions={{ color: darkMode ? 'cyan' : 'blue', fillColor: darkMode ? 'cyan' : 'blue', fillOpacity: 0.3 }}
          >
            <Popup>⚡ CHARGING STATION</Popup>
          </Rectangle>
        ))}

        {/* RENDER DISASTERS */}
        {disasters.map((d, i) => {
          const isSafe = d.status === 'SAFE';
          return (
            <CircleMarker key={i} center={[d.lat, d.lng]} radius={isSafe ? 12 : 18} pathOptions={{ color: isSafe ? '#22c55e' : '#ef4444', fillColor: isSafe ? '#22c55e' : '#ef4444' }}>
              <Popup>{isSafe ? "✅ SAFE" : "🔥 THREAT"}</Popup>
            </CircleMarker>
          )
        })}

        {/* RENDER BOTS */}
        {Object.values(bots).map((bot) => {
          let color = '#34d399'; // Green
          let statusText = 'PATROLLING';

          // Priority Colors
          if (bot.battery < 20) color = '#ef4444'; // RED (Low Bat)

          if (bot.status === 'BUSY') { color = '#fbbf24'; statusText = 'EN ROUTE'; }
          else if (bot.status === 'RESCUING') { color = '#a855f7'; statusText = 'OPERATING'; }
          else if (bot.status === 'RETURNING') { color = '#9ca3af'; statusText = 'LOW BATTERY'; } // Grey
          else if (bot.status === 'CHARGING') { color = '#3b82f6'; statusText = 'CHARGING'; } // Blue

          return (
            <CircleMarker key={bot.agentId} center={[bot.lat, bot.lng]} radius={12} pathOptions={{ color: color, fillColor: color, fillOpacity: 0.8 }}>
              <Popup>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{bot.agentId}</div>

                {/* BATTERY BAR VISUAL */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                  <Battery size={12} color={bot.battery < 20 ? 'red' : 'green'} />
                  {Math.round(bot.battery)}%
                </div>
                <div style={{ width: '100px', height: '4px', background: '#333', marginTop: '2px' }}>
                  <div style={{ width: `${bot.battery}%`, height: '100%', background: bot.battery < 20 ? 'red' : '#34d399' }}></div>
                </div>

                <div style={{ marginTop: '5px', padding: '2px 6px', borderRadius: '4px', background: color, color: 'white', fontSize: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                  {statusText}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      </MapContainer>
    </div>
  );
}

export default App;