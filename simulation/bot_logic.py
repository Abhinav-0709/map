import socketio
import time
import random
import math
import uuid
import numpy as np

# --- Q-LEARNING CONFIGURATION ---
ALPHA = 0.1     # Learning Rate
GAMMA = 0.9     # Discount Factor
EPSILON = 1.0   # Exploration Rate
EPSILON_DECAY = 0.9995 
NUM_ACTIONS = 3 # 0: RESCUE, 1: CHARGE, 2: WANDER
Q_TABLE = np.zeros((6, NUM_ACTIONS)) # 6 States x 3 Actions

# --- ENVIRONMENT CONFIGURATION (ROORKEE) ---
BOT_SPEED = 0.002
RESCUE_TIME = 8
BATTERY_DRAIN_MOVE = 0.5
BATTERY_DRAIN_IDLE = 0.05
BATTERY_RECHARGE = 5.0
IDLE_JITTER_SPEED = 0.0003

CHARGING_STATIONS = [
    {'id': 'Dock-Civil', 'lat': 29.8650, 'lng': 77.8950}, 
    {'id': 'Dock-IIT',   'lat': 29.8600, 'lng': 77.8800}  
]

# --- STATE MANAGEMENT ---
SESSION_ID = str(uuid.uuid4())[:8]
pending_tasks = []

bots = [
    {'id': 'Bot-Alpha', 'lat': 29.8543, 'lng': 77.8880, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
    {'id': 'Bot-Beta',  'lat': 29.8520, 'lng': 77.8900, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
    {'id': 'Bot-Gamma', 'lat': 29.8560, 'lng': 77.8850, 'status': 'IDLE', 'target': None, 'rescue_until': 0, 'battery': 100},
]

sio = socketio.Client()

# --- RL FUNCTIONS ---

def get_state(bot, pending_tasks):
    if bot['battery'] < 20: bat_state = 0
    elif bot['battery'] < 70: bat_state = 1
    else: bat_state = 2
    task_state = 1 if len(pending_tasks) > 0 else 0
    return bat_state * 2 + task_state

def get_reward(bot, old_status, new_status, action, target_status):
    R = -1
    if new_status == 'RESCUING' and old_status == 'BUSY': R += 100
    elif new_status == 'CHARGING' and old_status == 'RETURNING': R += 50
    elif new_status == 'IDLE' and old_status == 'CHARGING': R += 20
    elif bot['battery'] <= 0: R -= 100
    elif action == 2 and target_status == 1: R -= 10
    return R

def choose_action(state_index):
    global EPSILON 
    if random.random() < EPSILON:
        action = np.random.randint(0, NUM_ACTIONS) 
    else:
        action = np.argmax(Q_TABLE[state_index, :])
    if EPSILON > 0.01: 
        EPSILON *= EPSILON_DECAY
    return action

# --- CONNECTION AND HELPERS ---

def connect_to_server():
    """Attempts connection once. Returns control immediately."""
    print("--- 1. Attempting Socket Connection (localhost:5000) ---")
    try:
        sio.connect('http://localhost:5000', transports=['websocket'])
        print(f"✅ Connection successful!")
        sio.emit('init_session', {'sessionId': SESSION_ID, 'agentCount': len(bots)})
    except Exception as e:
        print(f"❌ Connection failed on first attempt. Error: {e}")
        # The main loop will handle subsequent retries.

# --- SCRIPT START ---
print("--- 0. Starting Python Simulation ---")
connect_to_server()

def log_event(event_type, agent_id, details={}):
    if sio.connected:
        try:
            sio.emit('log_event', {'sessionId': SESSION_ID, 'eventType': event_type, 'agentId': agent_id, 'details': details})
        except: pass

def find_nearest_dock(bot):
    nearest_dock = None
    min_dist = float('inf')
    for dock in CHARGING_STATIONS:
        dist = math.sqrt((bot['lat'] - dock['lat'])**2 + (bot['lng'] - dock['lng'])**2)
        if dist < min_dist:
            min_dist = dist
            nearest_dock = dock
    return nearest_dock

def assign_queued_task(bot):
    if len(pending_tasks) > 0:
        task_to_process = pending_tasks.pop(0)
        bot['status'] = 'BUSY'
        bot['target'] = task_to_process
        log_event("TASK_ASSIGNED_FROM_RL", bot['id'], task_to_process)
        return True
    return False

def move_towards(current, target, speed):
    dx = target['lat'] - current['lat']
    dy = target['lng'] - current['lng']
    dist = math.sqrt(dx**2 + dy**2)
    if dist < speed:
        return target['lat'], target['lng'], True
    else:
        return current['lat'] + (dx/dist)*speed, current['lng'] + (dy/dist)*speed, False

@sio.on('new_task')
def handle_task(data):
    pending_tasks.append(data)
    log_event("TASK_QUEUED", "SYSTEM", data)

# --- MAIN LEARNING LOOP ---
print("\n--- 2. Entering Main Simulation Loop ---")
connect_to_server()

while True:
    if not sio.connected:
        connect_to_server()
        continue

    current_time = time.time()
    
    for bot in bots:
        
        old_status = bot['status']
        
        # --- Q-LEARNING DECISION POINT ---
        if bot['status'] in ['IDLE', 'CHARGING']:
            
            state_index_t = get_state(bot, pending_tasks)
            action_t = choose_action(state_index_t)

            # Execution Logic: Priority check for low battery overrides random exploration
            if bot['battery'] < 10 and bot['status'] != 'CHARGING':
                action_t = 1
                log_event("LOW_BATTERY_FORCED", bot['id'], {'battery': bot['battery']})
            
            if action_t == 0: # GO_RESCUE
                assign_queued_task(bot)
            elif action_t == 1: # GO_CHARGE
                if bot['status'] != 'CHARGING':
                    bot['status'] = 'RETURNING'
                    bot['target'] = find_nearest_dock(bot)
        
        # --- PHYSICS & STATE TRANSITIONS (Execution Logic) ---
        
        # A. Moving (BUSY / RETURNING)
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

        # B. Rescuing, Charging, Idle (Rest of the original logic)
        elif bot['status'] == 'RESCUING':
            bot['battery'] -= BATTERY_DRAIN_MOVE
            if current_time >= bot['rescue_until']:
                if bot['target']: sio.emit('mission_complete', bot['target'])
                bot['status'] = 'IDLE'
                bot['target'] = None
                log_event("MISSION_COMPLETE", bot['id'])
            else:
                bot['lat'] += random.uniform(-0.00001, 0.00001)

        elif bot['status'] == 'CHARGING':
            bot['battery'] += BATTERY_RECHARGE
            if bot['battery'] >= 100:
                bot['battery'] = 100
                bot['status'] = 'IDLE'
                log_event("FULLY_CHARGED", bot['id'])

        elif bot['status'] == 'IDLE':
            bot['battery'] -= BATTERY_DRAIN_IDLE
            bot['lat'] += random.uniform(-IDLE_JITTER_SPEED, IDLE_JITTER_SPEED)
            bot['lng'] += random.uniform(-IDLE_JITTER_SPEED, IDLE_JITTER_SPEED)

        if bot['battery'] < 0: bot['battery'] = 0

        # --- Q-TABLE UPDATE (Bellman Equation) ---
        try:
            state_index_t1 = get_state(bot, pending_tasks)
            reward_t1 = get_reward(bot, old_status, bot['status'], action_t, len(pending_tasks))
            
            old_q_value = Q_TABLE[state_index_t, action_t]
            max_future_q = np.max(Q_TABLE[state_index_t1, :])
            
            new_q_value = (1 - ALPHA) * old_q_value + ALPHA * (reward_t1 + GAMMA * max_future_q)
            Q_TABLE[state_index_t, action_t] = new_q_value
            
            del state_index_t, action_t
        except (NameError, UnboundLocalError):
             # Occurs only when the bot was in a movement state (not making a decision this iteration)
             pass 

        # --- EMIT LIVE DATA ---
        try:
            sio.emit('agent_movement', {
                'agentId': bot['id'], 'lat': bot['lat'], 'lng': bot['lng'], 
                'status': bot['status'], 'battery': bot['battery']
            })
        except:
            pass

    time.sleep(0.1)