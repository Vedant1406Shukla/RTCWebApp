import React, { useState, useEffect } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import VideoCall from './components/VideoCall';

function App() {
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (isSignedIn && user) {
      setUserName(user.fullName || user.firstName || 'Anonymous');
    }
  }, [isSignedIn, user]);

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim() && userName.trim()) {
      setInCall(true);
    }
  };

  return (
    <div className="app-container">
      {!inCall ? (
        <div className="glass-panel" style={{ position: 'relative' }}>
          <h1>Connect RTC</h1>
          <p>Real-time high quality video meetings.</p>
          
          <SignedOut>
            <div style={{ marginTop: '2.5rem', textAlign: 'center' }}>
              <SignInButton mode="modal">
                <button>Sign In to Join</button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
              <UserButton />
            </div>
            <form onSubmit={handleJoinRoom}>
              <div className="input-group">
                <input 
                  type="text" 
                  value={userName}
                  disabled
                  placeholder="Authenticated User"
                />
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
          </SignedIn>
        </div>
      ) : (
        <VideoCall roomId={roomId} userName={userName} onLeave={() => setInCall(false)} />
      )}
    </div>
  );
}

export default App;
