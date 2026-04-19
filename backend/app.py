import eventlet
eventlet.monkey_patch()

from flask import Flask
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import os
import numpy as np
from faster_whisper import WhisperModel

app = Flask(__name__)
# Enable CORS for the React frontend (running on Vite's default port or elsewhere)
CORS(app, resources={r"/*": {"origins": "*"}})
# Configure SocketIO with CORS, eventlet async mode, and larger payload limits for audio
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet", 
                    max_http_buffer_size=100000000, max_decode_packets=500,
                    ping_timeout=120, ping_interval=25)

# Setup Whisper Model
print("Loading Distil-Whisper model... this may take a moment.")
model_size = "distil-large-v3"
whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
print("Whisper model loaded successfully.")

client_audio_buffers = {}

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

@socketio.on('audio-pcm')
def handle_audio_pcm(data):
    try:
        room = data['room']
        user_name = data['userName']
        client_id = f"{room}_{user_name}"
        audio_bytes = data['audio']
        
        # Convert raw bytes back to a numpy float32 array
        audio_np = np.frombuffer(audio_bytes, dtype=np.float32)
        
        if client_id not in client_audio_buffers:
            client_audio_buffers[client_id] = []
        
        client_audio_buffers[client_id].append(audio_np)
        
        # When we have ~3.0 seconds of audio (12 chunks of 4096 samples at 16kHz)
        if len(client_audio_buffers[client_id]) >= 12:
            # Concatenate chunks
            combined_audio = np.concatenate(client_audio_buffers[client_id])
            # Keep a sliding window, retain the last 4 chunks for overlap
            client_audio_buffers[client_id] = client_audio_buffers[client_id][-4:]
            
            # Spawn a background task to process Whisper inference so we don't block sockets
            socketio.start_background_task(run_whisper, combined_audio, room, user_name)

    except Exception as e:
        print(f"Error processing audio: {e}")

def run_whisper(audio_data, room, user_name):
    try:
        # Running inference with VAD filtering, specifying language to 'en' avoids max() errors on language auto-detection for silence
        segments, info = whisper_model.transcribe(
            audio_data, 
            beam_size=1, 
            language="en", 
            vad_filter=True, 
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        text = "".join([segment.text for segment in segments]).strip()
        
        if text:
            socketio.emit('caption', {'userName': user_name, 'text': text}, to=room)
    except Exception as e:
        print(f"Error in Whisper transcription: {e}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"Starting server on port {port}")
    socketio.run(app, debug=True, host='0.0.0.0', port=port)
