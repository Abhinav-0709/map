import socketio
import time
import random
import math

sio = socketio.Client()

# --- CONFIGURATION ---
BOT_SPEED = 0.002
RESCUE_TIME = 8
BATTERY_DRAIN_MOVE = 0.5  # % lost per tick moving
BATTERY_DRAIN_IDLE = 0.05 # % lost per tick doing nothing
BATTERY_RECHARGE = 5.0    # % gained per tick at dock

# Define 2 Charging Stations (Fixed locations)
CHARGING_STATIONS = [
    {'id': 'Dock-Civil', 'lat': 29.8650, 'lng': 77.8950}, # North East
    {'id': 'Dock-IIT',   'lat': 29.8600, 'lng': 77.8800}  # Near IIT Campus
]

pending_tasks = []
bots = [
    # 2. Move Bots to Roorkee Center
    {'id': 'Bot-Alpha', 'lat': 29.8543, 'lng': 77.8880, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
    {'id': 'Bot-Beta',  'lat': 29.8520, 'lng': 77.8900, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
    {'id': 'Bot-Gamma', 'lat': 29.8560, 'lng': 77.8850, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
]

try:
    sio.connect('http://localhost:5000')
    print("✅ Connected to Brain")
except Exception as e:
    print("Connection Fail")

def find_best_bot(task_data):
    best_bot = None
    min_dist = float('inf')
    for bot in bots:
        # STRICT: Only IDLE bots with > 25% battery can take tasks
        if bot['status'] == 'IDLE' and bot['battery'] > 25:
            dist = math.sqrt((bot['lat'] - task_data['lat'])**2 + (bot['lng'] - task_data['lng'])**2)
            if dist < min_dist:
                min_dist = dist
                best_bot = bot
    return best_bot

def find_nearest_dock(bot):
    nearest_dock = None
    min_dist = float('inf')
    for dock in CHARGING_STATIONS:
        dist = math.sqrt((bot['lat'] - dock['lat'])**2 + (bot['lng'] - dock['lng'])**2)
        if dist < min_dist:
            min_dist = dist
            nearest_dock = dock
    return nearest_dock

@sio.on('new_task')
def handle_task(data):
    bot = find_best_bot(data)
    if bot:
        print(f"🚀 Assigned {bot['id']} (Bat: {bot['battery']:.1f}%)")
        bot['status'] = 'BUSY'
        bot['target'] = data
    else:
        print("⚠️ Queued task (Bots busy or Low Battery)")
        pending_tasks.append(data)

def move_towards(current, target, speed):
    dx = target['lat'] - current['lat']
    dy = target['lng'] - current['lng']
    dist = math.sqrt(dx**2 + dy**2)
    if dist < speed:
        return target['lat'], target['lng'], True
    else:
        return current['lat'] + (dx/dist)*speed, current['lng'] + (dy/dist)*speed, False

while True:
    current_time = time.time()

    # 1. Check Queue (Only assign if battery is healthy)
    if len(pending_tasks) > 0:
        next_task = pending_tasks[0]
        available_bot = find_best_bot(next_task)
        if available_bot:
            pending_tasks.pop(0)
            available_bot['status'] = 'BUSY'
            available_bot['target'] = next_task

    # 2. Update Bots
    for bot in bots:
        
        # --- CRITICAL BATTERY CHECK ---
        # If battery drops below 20% and not already charging/rescuing, go to dock
        if bot['battery'] < 20 and bot['status'] == 'IDLE':
            print(f"🔋 LOW BATTERY: {bot['id']} returning to base.")
            bot['status'] = 'RETURNING'
            bot['target'] = find_nearest_dock(bot)

        # --- STATE: BUSY / RETURNING (Moving) ---
        if bot['status'] in ['BUSY', 'RETURNING'] and bot['target']:
            new_lat, new_lng, arrived = move_towards(bot, bot['target'], BOT_SPEED)
            bot['lat'] = new_lat
            bot['lng'] = new_lng
            bot['battery'] -= BATTERY_DRAIN_MOVE # Drain while moving
            
            if arrived:
                if bot['status'] == 'BUSY':
                    print(f"✅ {bot['id']} Arrived at Disaster.")
                    bot['status'] = 'RESCUING'
                    bot['rescue_until'] = current_time + RESCUE_TIME
                elif bot['status'] == 'RETURNING':
                    print(f"🔌 {bot['id']} Docked. Charging...")
                    bot['status'] = 'CHARGING'
                    bot['target'] = None

        # --- STATE: RESCUING (Working) ---
        elif bot['status'] == 'RESCUING':
            bot['battery'] -= BATTERY_DRAIN_MOVE # Heavy drain while working
            if current_time >= bot['rescue_until']:
                print(f"🏁 {bot['id']} Task Done.")
                if bot['target']: sio.emit('mission_complete', bot['target'])
                bot['status'] = 'IDLE'
                bot['target'] = None
            else:
                bot['lat'] += random.uniform(-0.00001, 0.00001)

        # --- STATE: CHARGING (Regenerating) ---
        elif bot['status'] == 'CHARGING':
            bot['battery'] += BATTERY_RECHARGE
            if bot['battery'] >= 100:
                bot['battery'] = 100
                print(f"⚡ {bot['id']} Fully Charged. Back to IDLE.")
                bot['status'] = 'IDLE'

        # --- STATE: IDLE ---
        elif bot['status'] == 'IDLE':
            bot['battery'] -= BATTERY_DRAIN_IDLE # Slow drain
            bot['lat'] += random.uniform(-0.0001, 0.0001)

        # Clamp Battery to 0
        if bot['battery'] < 0: bot['battery'] = 0

        sio.emit('agent_movement', {
            'agentId': bot['id'], 'lat': bot['lat'], 'lng': bot['lng'], 
            'status': bot['status'], 'battery': bot['battery']
        })

    time.sleep(0.1)