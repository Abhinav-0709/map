import socketio
import time
import random
import math
import uuid # NEW IMPORT

sio = socketio.Client()

# --- CONFIGURATION ---
BOT_SPEED = 0.002
RESCUE_TIME = 8
BATTERY_DRAIN_MOVE = 0.5 
BATTERY_DRAIN_IDLE = 0.05 
BATTERY_RECHARGE = 5.0    

# --- SESSION MANAGEMENT ---
# Generate a unique ID for this run
SESSION_ID = str(uuid.uuid4())[:8] # Short UUID (e.g., "a1b2c3d4")

CHARGING_STATIONS = [
    {'id': 'Dock-Civil', 'lat': 29.8650, 'lng': 77.8950}, 
    {'id': 'Dock-IIT',   'lat': 29.8600, 'lng': 77.8800}  
]

pending_tasks = []
bots = [
    {'id': 'Bot-Alpha', 'lat': 29.8543, 'lng': 77.8880, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
    {'id': 'Bot-Beta',  'lat': 29.8520, 'lng': 77.8900, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
    {'id': 'Bot-Gamma', 'lat': 29.8560, 'lng': 77.8850, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
]

# --- HELPER: LOGGING ---
def log_event(event_type, agent_id, details={}):
    if sio.connected:
        try:
            sio.emit('log_event', {
                'sessionId': SESSION_ID,
                'eventType': event_type,
                'agentId': agent_id,
                'details': details
            })
        except:
            pass

# --- CONNECTION ---
def connect_to_server():
    while not sio.connected:
        try:
            sio.connect('http://localhost:5000', transports=['websocket'])
            print(f"✅ Connected to Brain [Session: {SESSION_ID}]")
            
            # Register Session
            sio.emit('init_session', {'sessionId': SESSION_ID, 'agentCount': len(bots)})
            
        except Exception as e:
            print(f"Connection Fail: {e}")
            time.sleep(2)

connect_to_server()

# --- LOGIC ---
def find_best_bot(task_data):
    best_bot = None
    min_dist = float('inf')
    for bot in bots:
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
        print(f"🚀 Assigned {bot['id']}")
        bot['status'] = 'BUSY'
        bot['target'] = data
        # LOG: Task Assigned
        log_event("TASK_ASSIGNED", bot['id'], data)
    else:
        print("⚠️ Queued task")
        pending_tasks.append(data)
        # LOG: Queue
        log_event("TASK_QUEUED", "SYSTEM", data)

def move_towards(current, target, speed):
    dx = target['lat'] - current['lat']
    dy = target['lng'] - current['lng']
    dist = math.sqrt(dx**2 + dy**2)
    if dist < speed:
        return target['lat'], target['lng'], True
    else:
        return current['lat'] + (dx/dist)*speed, current['lng'] + (dy/dist)*speed, False

# --- MAIN LOOP ---
while True:
    if not sio.connected:
        connect_to_server()

    current_time = time.time()

    # 1. Queue
    if len(pending_tasks) > 0:
        next_task = pending_tasks[0]
        available_bot = find_best_bot(next_task)
        if available_bot:
            pending_tasks.pop(0)
            available_bot['status'] = 'BUSY'
            available_bot['target'] = next_task
            log_event("TASK_ASSIGNED_FROM_QUEUE", available_bot['id'], next_task)

    # 2. Bots
    for bot in bots:
        
        # Low Battery
        if bot['battery'] < 20 and bot['status'] == 'IDLE':
            print(f"🔋 {bot['id']} Low Battery")
            bot['status'] = 'RETURNING'
            bot['target'] = find_nearest_dock(bot)
            log_event("LOW_BATTERY", bot['id'], {'battery': bot['battery']})

        # Movement
        if bot['status'] in ['BUSY', 'RETURNING'] and bot['target']:
            new_lat, new_lng, arrived = move_towards(bot, bot['target'], BOT_SPEED)
            bot['lat'] = new_lat
            bot['lng'] = new_lng
            bot['battery'] -= BATTERY_DRAIN_MOVE
            
            if arrived:
                if bot['status'] == 'BUSY':
                    bot['status'] = 'RESCUING'
                    bot['rescue_until'] = current_time + RESCUE_TIME
                    log_event("ARRIVED_AT_SITE", bot['id'])
                elif bot['status'] == 'RETURNING':
                    bot['status'] = 'CHARGING'
                    bot['target'] = None
                    log_event("DOCKED_FOR_CHARGING", bot['id'])

        # Rescuing
        elif bot['status'] == 'RESCUING':
            bot['battery'] -= BATTERY_DRAIN_MOVE
            if current_time >= bot['rescue_until']:
                if bot['target']: sio.emit('mission_complete', bot['target'])
                bot['status'] = 'IDLE'
                bot['target'] = None
                log_event("MISSION_COMPLETE", bot['id'])
            else:
                bot['lat'] += random.uniform(-0.00001, 0.00001)

        # Charging
        elif bot['status'] == 'CHARGING':
            bot['battery'] += BATTERY_RECHARGE
            if bot['battery'] >= 100:
                bot['battery'] = 100
                bot['status'] = 'IDLE'
                log_event("FULLY_CHARGED", bot['id'])

        # Idle
        elif bot['status'] == 'IDLE':
            bot['battery'] -= BATTERY_DRAIN_IDLE
            bot['lat'] += random.uniform(-0.0001, 0.0001)

        if bot['battery'] < 0: bot['battery'] = 0

        try:
            sio.emit('agent_movement', {
                'agentId': bot['id'], 'lat': bot['lat'], 'lng': bot['lng'], 
                'status': bot['status'], 'battery': bot['battery']
            })
        except:
            pass

    time.sleep(0.1)