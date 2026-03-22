from flask import Flask
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import os

app = Flask(__name__)
# Enable CORS for the React frontend (running on Vite's default port or elsewhere)
CORS(app, resources={r"/*": {"origins": "*"}})
# Configure SocketIO with CORS and eventlet async mode
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

@app.route('/')
def index():
    return "WebRTC Signaling Server is running!"

@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    print(f"Client joined room: {room}")
    # Notify others in the room that someone has joined
    emit('ready', data, broadcast=True, to=room, include_self=False)

@socketio.on('offer')
def on_offer(data):
    room = data['room']
    # Relay the offer to the other peer in the room
    emit('offer', data, to=room, include_self=False)

@socketio.on('answer')
def on_answer(data):
    room = data['room']
    # Relay the answer to the other peer
    emit('answer', data, to=room, include_self=False)

@socketio.on('ice-candidate')
def on_ice_candidate(data):
    room = data['room']
    # Relay the ICE candidate to the other peer
    emit('ice-candidate', data, to=room, include_self=False)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting server on port {port}")
    socketio.run(app, debug=True, host='0.0.0.0', port=port)
