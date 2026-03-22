import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// const SOCKET_SERVER_URL = 'http://localhost:5001'; // Flask backend URL
const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:5001';
const VideoCall = ({ roomId, userName, onLeave }) => {
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteName, setRemoteName] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [maximizedVideo, setMaximizedVideo] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  const STUN_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        localStreamRef.current = currentStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = currentStream;
        }

        socketRef.current.emit('join', { room: roomId, userName });
      })
      .catch((err) => {
        console.error("Error accessing media devices.", err);
        alert("Microphone & Camera permission required.");
      });

    socketRef.current.on('ready', (data) => {
      if (data && data.userName) setRemoteName(data.userName);
      setIsReady(true);
      createOffer();
    });

    socketRef.current.on('offer', async (data) => {
      if (data && data.userName) setRemoteName(data.userName);
      setIsReady(true);
      await createAnswer(data.offer);
    });

    socketRef.current.on('answer', async (data) => {
      if (data && data.userName) setRemoteName(data.userName);
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socketRef.current.on('ice-candidate', (data) => {
      if (peerConnectionRef.current && data && data.candidate) {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch(e => console.error("Error adding ice candidate:", e));
      }
    });

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
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

    peerConnectionRef.current.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          room: roomId,
          candidate: event.candidate
        });
      }
    };

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
        offer: offer,
        userName
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
        answer: answer,
        userName
      });
    } catch (error) {
      console.error("Error creating answer:", error);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
      }
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    
    // Revert to camera track
    if (localStreamRef.current && peerConnectionRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && cameraTrack) {
        sender.replaceTrack(cameraTrack);
      }
    }
    
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    setIsScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Handle native browser "Stop sharing" button
        screenTrack.onended = () => {
          stopScreenShare();
        };

        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        
        setIsScreenSharing(true);
      } catch (error) {
        console.error("Error sharing screen:", error);
      }
    }
  };

  const handleEndCall = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
    onLeave();
  };

  const getWrapperClass = (type) => {
    let baseClass = `video-wrapper ${type === 'remote' ? 'remote-video' : ''}`;
    if (!maximizedVideo) return baseClass;
    if (maximizedVideo === type) return `${baseClass} maximized`;
    return `${baseClass} pip`;
  };

  const toggleMaximize = (e, type) => {
    e.stopPropagation();
    if (maximizedVideo === type) {
      setMaximizedVideo(null);
    } else {
      setMaximizedVideo(type);
    }
  };

  const handlePipClick = (type) => {
    if (maximizedVideo && maximizedVideo !== type) {
      setMaximizedVideo(type);
    }
  };

  const MaximizeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
    </svg>
  );

  const MinimizeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
    </svg>
  );

  return (
    <div className={`video-call-container ${maximizedVideo ? 'has-maximized' : ''}`}>
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

      <div className={`video-grid ${maximizedVideo ? 'has-maximized' : ''}`}>
        {/* Local Video */}
        <div 
          className={getWrapperClass('local')} 
          onClick={() => handlePipClick('local')}
        >
          <button 
            className="maximize-btn" 
            onClick={(e) => toggleMaximize(e, 'local')}
            title={maximizedVideo === 'local' ? "Restore" : "Maximize"}
          >
            {maximizedVideo === 'local' ? <MinimizeIcon /> : <MaximizeIcon />}
          </button>
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            style={isScreenSharing ? { transform: 'scaleX(1)' } : {}}
          />
          <div className="video-label">{userName || 'You'} {isScreenSharing ? '(Screen)' : ''}</div>
        </div>

        {/* Remote Video */}
        <div 
          className={getWrapperClass('remote')} 
          onClick={() => handlePipClick('remote')}
        >
          {remoteStream && (
            <button 
              className="maximize-btn" 
              onClick={(e) => toggleMaximize(e, 'remote')}
              title={maximizedVideo === 'remote' ? "Restore" : "Maximize"}
            >
              {maximizedVideo === 'remote' ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
          )}
          {!remoteStream && (
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div className="spinner"></div>
              <div style={{ color: 'var(--text-secondary)' }}>Waiting for connection...</div>
            </div>
          )}
          <video ref={remoteVideoRef} autoPlay playsInline />
          {remoteStream && <div className="video-label">{remoteName || 'Remote Peer'}</div>}
        </div>
      </div>

      <div className="controls">
        <button 
          className={isAudioMuted ? "danger" : ""} 
          onClick={toggleAudio}
        >
          {isAudioMuted ? "Unmute Mic" : "Mute Mic"}
        </button>
        <button 
          className={isVideoMuted ? "danger" : ""} 
          onClick={toggleVideo}
        >
          {isVideoMuted ? "Turn On Camera" : "Turn Off Camera"}
        </button>
        <button 
          className={isScreenSharing ? "danger" : ""} 
          onClick={toggleScreenShare}
        >
          {isScreenSharing ? "Stop Sharing" : "Share Screen"}
        </button>
        <button className="danger" onClick={handleEndCall}>
          End Call
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
