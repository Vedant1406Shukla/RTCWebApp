import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';


const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL; // Flask backend URL

const VideoCall = ({ roomId, onLeave }) => {
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isReady, setIsReady] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  const STUN_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    // 1. Initialize Socket
    socketRef.current = io(SOCKET_SERVER_URL);

    // 2. Request Media Permissions
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        localStreamRef.current = currentStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = currentStream;
        }

        // Join the socket room
        socketRef.current.emit('join', { room: roomId });
      })
      .catch((err) => {
        console.error("Error accessing media devices.", err);
        alert("Microphone & Camera permission required.");
      });

    // 3. Socket event listeners
    socketRef.current.on('ready', () => {
      // Another peer joined, I should create an offer
      setIsReady(true);
      createOffer();
    });

    socketRef.current.on('offer', async (offer) => {
      // Received an offer, let's answer
      setIsReady(true);
      await createAnswer(offer);
    });

    socketRef.current.on('answer', async (answer) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socketRef.current.on('ice-candidate', (candidate) => {
      if (peerConnectionRef.current && candidate) {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
          .catch(e => console.error("Error adding ice candidate:", e));
      }
    });

    return () => {
      // Cleanup
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socketRef.current) socketRef.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const initPeerConnection = () => {
    if (peerConnectionRef.current) return;

    peerConnectionRef.current = new RTCPeerConnection(STUN_SERVERS);

    // Listen for remote tracks
    peerConnectionRef.current.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Send local ICE candidates to remote peer via socket
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          room: roomId,
          candidate: event.candidate
        });
      }
    };

    // Add local stream tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });
    }
  };

  const createOffer = async () => {
    initPeerConnection();
    try {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      socketRef.current.emit('offer', {
        room: roomId,
        offer: offer
      });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  const createAnswer = async (offerParams) => {
    initPeerConnection();
    try {
      if (peerConnectionRef.current.signalingState !== "stable") {
        console.warn("Signaling state is not stable, ignoring offer");
        return;
      }

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offerParams));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      socketRef.current.emit('answer', {
        room: roomId,
        answer: answer
      });
    } catch (error) {
      console.error("Error creating answer:", error);
    }
  };

  const handleEndCall = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    onLeave();
  };

  return (
    <div className="video-call-container">
      <div className="video-header">
        <div className="room-badge">Room: {roomId}</div>
        <div className="status-text">
          {remoteStream ? (
            <><span style={{ color: '#10B981' }}>●</span> Connected</>
          ) : (
            <span className="status-text waiting">Waiting for caller...</span>
          )}
        </div>
      </div>

      <div className="video-grid">
        {/* Local Video */}
        <div className="video-wrapper">
          <video ref={localVideoRef} autoPlay playsInline muted />
          <div className="video-label">You</div>
        </div>

        {/* Remote Video */}
        <div className="video-wrapper remote-video">
          {!remoteStream && (
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div className="spinner"></div>
              <div style={{ color: 'var(--text-secondary)' }}>Waiting for connection...</div>
            </div>
          )}
          <video ref={remoteVideoRef} autoPlay playsInline />
          {remoteStream && <div className="video-label">Remote Peer</div>}
        </div>
      </div>

      <div className="controls">
        <button className="danger" onClick={handleEndCall}>
          End Call
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
