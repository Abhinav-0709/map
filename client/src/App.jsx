import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css'; // <--- VITAL IMPORT
import io from 'socket.io-client';

// Connect to your Node Server on Port 5000
const socket = io.connect("http://localhost:5000");

function ClickHandler({ spawnDisaster }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      spawnDisaster(lat, lng);
    },
  });
  return null;
}

function App() {
  const [bots, setBots] = useState({});
  const [disasters, setDisasters] = useState([]); // Store disaster locations

  useEffect(() => {
    socket.on("connect", () => console.log("✅ Connected"));

    socket.on("map_update", (data) => {
      setBots((prev) => ({ ...prev, [data.agentId]: data }));
    });

    // NEW: Listen for new disasters from server
    socket.on("disaster_spawned", (data) => {
      setDisasters((prev) => [...prev, data]);
    });

    return () => {
      socket.off("map_update");
      socket.off("disaster_spawned");
    };
  }, []);

  // Function to send click to server
  const spawnDisaster = (lat, lng) => {
    console.log("Boom! Disaster at:", lat, lng);
    socket.emit("create_disaster", { lat, lng, type: "Fire" });
  };

  return (
    <MapContainer center={[40.7128, -74.0060]} zoom={15} scrollWheelZoom={true}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {/* Capture Clicks */}
      <ClickHandler spawnDisaster={spawnDisaster} />

      {/* Render Disasters (Red Circles) */}
      {disasters.map((d, i) => (
        <CircleMarker key={i} center={[d.lat, d.lng]} radius={15} pathOptions={{ color: 'red', fillColor: 'red' }}>
          <Popup>DISASTER!</Popup>
        </CircleMarker>
      ))}

      {/* Render Bots (Blue Circles) */}
      {Object.values(bots).map((bot) => (
        <CircleMarker
          key={bot.agentId}
          center={[bot.lat, bot.lng]}
          radius={12}
          pathOptions={{ color: bot.status === 'BUSY' ? 'orange' : 'blue' }} // Orange if BUSY
        >
          <Popup>{bot.agentId}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default App;