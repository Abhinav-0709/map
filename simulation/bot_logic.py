import socketio
import time
import random
import math

sio = socketio.Client()

# State Management
bots = [
    {'id': 'Bot-Alpha', 'lat': 40.7128, 'lng': -74.0060, 'status': 'IDLE', 'target': None},
    {'id': 'Bot-Beta',  'lat': 40.7138, 'lng': -74.0050, 'status': 'IDLE', 'target': None},
    {'id': 'Bot-Gamma', 'lat': 40.7118, 'lng': -74.0070, 'status': 'IDLE', 'target': None},
]

# Connect
try:
    sio.connect('http://localhost:5000')
    print("✅ Connected to Brain")
except Exception as e:
    print("Connection Fail")

# LISTEN: New Task from Server
@sio.on('new_task')
def handle_task(data):
    print(f"🔥 New Task received at {data['lat']}, {data['lng']}")
    
    # LOGIC: Find nearest IDLE bot
    best_bot = None
    min_dist = float('inf')

    for bot in bots:
        if bot['status'] == 'IDLE':
            # Euclidean Distance (Simplified)
            dist = math.sqrt((bot['lat'] - data['lat'])**2 + (bot['lng'] - data['lng'])**2)
            if dist < min_dist:
                min_dist = dist
                best_bot = bot
    
    if best_bot:
        print(f"🚀 Assigning {best_bot['id']} to task!")
        best_bot['status'] = 'BUSY'
        best_bot['target'] = data # Set the target coordinates
    else:
        print("⚠️ All bots are busy!")

# MOVEMENT FUNCTION
def move_towards(current, target, speed=0.0002):
    # Vector Math: Calculate direction
    dx = target['lat'] - current['lat']
    dy = target['lng'] - current['lng']
    dist = math.sqrt(dx**2 + dy**2)

    if dist < speed:
        return target['lat'], target['lng'], True # Arrived
    else:
        # Normalize and move by speed
        new_lat = current['lat'] + (dx / dist) * speed
        new_lng = current['lng'] + (dy / dist) * speed
        return new_lat, new_lng, False

# --- MAIN LOOP ---
while True:
    for bot in bots:
        if bot['status'] == 'BUSY' and bot['target']:
            # Move towards target
            new_lat, new_lng, arrived = move_towards(bot, bot['target'])
            bot['lat'] = new_lat
            bot['lng'] = new_lng
            
            if arrived:
                print(f"✅ {bot['id']} Arrived at Disaster!")
                bot['status'] = 'IDLE' # Reset to IDLE after arriving (simplification)
                bot['target'] = None
        else:
            # Idle Logic: Just hover/jitter slightly
            bot['lat'] += random.uniform(-0.0001, 0.0001)
            bot['lng'] += random.uniform(-0.0001, 0.0001)

        # Send Update
        sio.emit('agent_movement', {
            'agentId': bot['id'],
            'lat': bot['lat'],
            'lng': bot['lng'],
            'status': bot['status']
        })

    time.sleep(0.5) # Faster updates (0.5s)