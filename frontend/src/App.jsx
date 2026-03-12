import React, { useState } from 'react';
import VideoCall from './components/VideoCall';

function App() {
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('');

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      setInCall(true);
    }
  };

  return (
    <div className="app-container">
      {!inCall ? (
        <div className="glass-panel">
          <h1>Connect RTC</h1>
          <p>Real-time high quality video meetings.</p>
          
          <form onSubmit={handleJoinRoom}>
            <div className="input-group">
              <input 
                type="text" 
                placeholder="Enter Meeting Room ID..." 
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              />
            </div>
            <button type="submit">
              Join Meeting
            </button>
          </form>
        </div>
      ) : (
        <VideoCall roomId={roomId} onLeave={() => setInCall(false)} />
      )}
    </div>
  );
}

export default App;
