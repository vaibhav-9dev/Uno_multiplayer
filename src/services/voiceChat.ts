/**
 * WebRTC Mesh Voice Chat Service for UNO Multiplayer.
 * Production-ready WebRTC implementation:
 * - Deterministic polite-peer role assignment (prevents glare / simultaneous offers)
 * - Safe ontrack audio pipeline using AudioContext + MediaStreamSource directly to destination (bypasses browser <audio> tag autoplay quirks and background tab pausing)
 * - Fallback DOM <audio> element as backup
 * - Queued ICE candidates with delayed drain
 * - Comprehensive STUN servers
 * - Speech detection & volume broadcasting
 */

import { getSocket } from './socket.ts';

type VoiceEventCallback = () => void;

interface PeerData {
  pc: RTCPeerConnection;
  isPolite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  stream?: MediaStream;
  sourceNode?: MediaStreamAudioSourceNode;
  gainNode?: GainNode;
  audioElement?: HTMLAudioElement;
}

class VoiceChatService {
  private localStream: MediaStream | null = null;
  private peers: Map<string, PeerData> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  private speakingPeers: Set<string> = new Set();
  private mutedPeers: Set<string> = new Set();
  private locallyMutedRemotePeers: Set<string> = new Set();

  private isMicMuted: boolean = false;
  private isDeafened: boolean = false;
  private isConnected: boolean = false;
  private isLocallySpeaking: boolean = false;
  private currentRoomCode: string | null = null;

  // Master output AudioContext for playing remote peers smoothly
  private playbackContext: AudioContext | null = null;
  private micContext: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private speechCheckInterval: any = null;

  private listeners: Set<VoiceEventCallback> = new Set();

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.services.mozilla.com' },
    ],
  };

  constructor() {
    this.setupSignalingListeners();
    this.setupUserUnlockHandlers();
  }

  // Ensure AudioContext is active on user gestures
  private getPlaybackContext(): AudioContext {
    if (!this.playbackContext || this.playbackContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioCtx();
    }
    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume().catch(() => {});
    }
    return this.playbackContext;
  }

  private setupUserUnlockHandlers() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (this.playbackContext && this.playbackContext.state === 'suspended') {
        this.playbackContext.resume().catch(() => {});
      }
      if (this.micContext && this.micContext.state === 'suspended') {
        this.micContext.resume().catch(() => {});
      }
      // Also poke all backup audio elements
      this.peers.forEach((peer) => {
        if (peer.audioElement && peer.audioElement.paused && peer.audioElement.srcObject) {
          peer.audioElement.play().catch(() => {});
        }
      });
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public subscribe(cb: VoiceEventCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  private setupSignalingListeners() {
    const socket = getSocket();

    // Peer joined voice
    socket.on('voice:user-joined', async ({ socketId }: { socketId: string }) => {
      console.log('[Voice] Peer joined room:', socketId);
      if (!socket.id || socketId === socket.id) return;
      // Socket whose ID is alphabetically larger initiates the offer (prevents glare!)
      const isInitiator = socket.id > socketId;
      await this.getOrCreatePeer(socketId, isInitiator);
    });

    // Received WebRTC signal
    socket.on('voice:signal', async ({ from, signal }: { from: string; signal: any }) => {
      if (from === socket.id) return;

      const peer = await this.getOrCreatePeer(from, false);
      const pc = peer.pc;

      try {
        if (signal.type === 'offer') {
          console.log('[Voice] Received offer from:', from);
          const offerCollision = peer.makingOffer || pc.signalingState !== 'stable';
          peer.ignoreOffer = !peer.isPolite && offerCollision;

          if (peer.ignoreOffer) {
            console.log('[Voice] Impolite peer ignoring offer collision from:', from);
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          await this.drainPendingCandidates(from, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('voice:signal', {
            to: from,
            signal: answer,
          });
        } else if (signal.type === 'answer') {
          console.log('[Voice] Received answer from:', from);
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            await this.drainPendingCandidates(from, pc);
          }
        } else if (signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
          } else {
            const queue = this.pendingCandidates.get(from) || [];
            queue.push(signal);
            this.pendingCandidates.set(from, queue);
          }
        }
      } catch (err) {
        console.warn('[Voice] Signal processing warning:', err);
      }
    });

    socket.on('voice:mute-status', ({ socketId, isMuted }: { socketId: string; isMuted: boolean }) => {
      if (isMuted) {
        this.mutedPeers.add(socketId);
      } else {
        this.mutedPeers.delete(socketId);
      }
      this.notify();
    });

    socket.on('voice:speaking', ({ socketId, isSpeaking }: { socketId: string; isSpeaking: boolean }) => {
      if (isSpeaking) {
        this.speakingPeers.add(socketId);
      } else {
        this.speakingPeers.delete(socketId);
      }
      this.notify();
    });

    socket.on('voice:user-left', ({ socketId }: { socketId: string }) => {
      console.log('[Voice] Peer left room:', socketId);
      this.removePeer(socketId);
      this.notify();
    });
  }

  private async drainPendingCandidates(socketId: string, pc: RTCPeerConnection) {
    const queue = this.pendingCandidates.get(socketId);
    if (!queue || queue.length === 0) return;

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[Voice] Ice candidate drain warning:', err);
      }
    }
    this.pendingCandidates.delete(socketId);
  }

  public async startVoice(roomCode: string): Promise<boolean> {
    this.currentRoomCode = roomCode;
    const ctx = this.getPlaybackContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      if (!this.localStream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        this.localStream = stream;
        this.setupVolumeDetection(stream);
      }

      this.isConnected = true;
      this.isMicMuted = false;

      // Add local tracks to existing connections if needed
      this.peers.forEach((peer) => {
        this.localStream?.getAudioTracks().forEach((track) => {
          peer.pc.addTrack(track, this.localStream!);
        });
      });

      const socket = getSocket();
      socket.emit('voice:join', { roomCode }, async (res: { users?: string[] }) => {
        console.log('[Voice] voice:join response, other peers:', res?.users);
        if (res?.users && socket.id) {
          const myId = socket.id;
          for (const socketId of res.users) {
            if (socketId !== myId) {
              // Initiate offer if our socket ID is greater
              const isInitiator = myId > socketId;
              await this.getOrCreatePeer(socketId, isInitiator);
            }
          }
        }
        this.notify();
      });

      this.notify();
      return true;
    } catch (err) {
      console.warn('[Voice] getUserMedia failed or denied:', err);
      this.isConnected = false;
      this.notify();
      return false;
    }
  }

  private async getOrCreatePeer(remoteSocketId: string, initiateOffer: boolean): Promise<PeerData> {
    let peer = this.peers.get(remoteSocketId);
    if (peer) {
      if (initiateOffer && peer.pc.signalingState === 'stable') {
        await this.makeOffer(peer, remoteSocketId);
      }
      return peer;
    }

    // Determine polite role: socket.id < remoteSocketId is polite
    const mySocketId = getSocket().id || '';
    const isPolite = mySocketId < remoteSocketId;

    const pc = new RTCPeerConnection(this.rtcConfig);
    peer = {
      pc,
      isPolite,
      makingOffer: false,
      ignoreOffer: false,
    };
    this.peers.set(remoteSocketId, peer);

    // Add local mic track
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch (e) {
          console.warn('[Voice] Track add warning:', e);
        }
      });
    }

    // Send ICE candidates to peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('voice:signal', {
          to: remoteSocketId,
          signal: event.candidate,
        });
      }
    };

    // Receive remote audio track
    pc.ontrack = (event) => {
      console.log('[Voice] Received remote audio track from:', remoteSocketId);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      peer!.stream = remoteStream;

      // 1. Web Audio API direct routing: pipe stream -> GainNode -> destination
      // This is immune to standard HTML5 audio element autoplay blocks
      try {
        const audioCtx = this.getPlaybackContext();
        if (peer!.sourceNode) {
          try {
            peer!.sourceNode.disconnect();
          } catch {}
        }
        const sourceNode = audioCtx.createMediaStreamSource(remoteStream);
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = this.isDeafened || this.locallyMutedRemotePeers.has(remoteSocketId) ? 0 : 1;

        sourceNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        peer!.sourceNode = sourceNode;
        peer!.gainNode = gainNode;
        console.log('[Voice] Web Audio API routing attached for:', remoteSocketId);
      } catch (err) {
        console.warn('[Voice] Web Audio routing fallback warning:', err);
      }

      // 2. Backup DOM <audio> element attached to body
      try {
        let audio = peer!.audioElement;
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', 'true');
          audio.style.display = 'none';
          document.body.appendChild(audio);
          peer!.audioElement = audio;
        }
        audio.srcObject = remoteStream;
        audio.muted = this.isDeafened || this.locallyMutedRemotePeers.has(remoteSocketId);
        audio.volume = 1.0;
        audio.play().catch(() => {});
      } catch {}

      this.notify();
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Voice] Connection state with ${remoteSocketId}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(remoteSocketId);
      }
    };

    if (initiateOffer) {
      await this.makeOffer(peer, remoteSocketId);
    }

    return peer;
  }

  private async makeOffer(peer: PeerData, remoteSocketId: string) {
    try {
      peer.makingOffer = true;
      const offer = await peer.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await peer.pc.setLocalDescription(offer);
      getSocket().emit('voice:signal', {
        to: remoteSocketId,
        signal: peer.pc.localDescription,
      });
    } catch (err) {
      console.warn('[Voice] makeOffer error:', err);
    } finally {
      peer.makingOffer = false;
    }
  }

  private removePeer(socketId: string) {
    const peer = this.peers.get(socketId);
    if (peer) {
      try {
        peer.pc.close();
      } catch {}
      if (peer.sourceNode) {
        try {
          peer.sourceNode.disconnect();
        } catch {}
      }
      if (peer.gainNode) {
        try {
          peer.gainNode.disconnect();
        } catch {}
      }
      if (peer.audioElement) {
        peer.audioElement.srcObject = null;
        if (peer.audioElement.parentNode) {
          peer.audioElement.parentNode.removeChild(peer.audioElement);
        }
      }
      this.peers.delete(socketId);
    }

    this.pendingCandidates.delete(socketId);
    this.speakingPeers.delete(socketId);
    this.mutedPeers.delete(socketId);
    this.locallyMutedRemotePeers.delete(socketId);
  }

  private setupVolumeDetection(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.micContext = new AudioCtx();
      if (this.micContext.state === 'suspended') {
        this.micContext.resume().catch(() => {});
      }

      const source = this.micContext.createMediaStreamSource(stream);
      this.micAnalyser = this.micContext.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.4;
      source.connect(this.micAnalyser);

      const buffer = new Uint8Array(this.micAnalyser.frequencyBinCount);
      let wasSpeaking = false;

      if (this.speechCheckInterval) {
        clearInterval(this.speechCheckInterval);
      }

      this.speechCheckInterval = setInterval(() => {
        if (!this.micAnalyser || this.isMicMuted || !this.isConnected) {
          if (wasSpeaking) {
            wasSpeaking = false;
            this.isLocallySpeaking = false;
            getSocket().emit('voice:speaking', { isSpeaking: false });
            this.notify();
          }
          return;
        }

        this.micAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const average = sum / buffer.length;
        const isSpeaking = average > 10; // Active speaking detection threshold

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          this.isLocallySpeaking = isSpeaking;
          getSocket().emit('voice:speaking', { isSpeaking });
          this.notify();
        }
      }, 100);
    } catch (e) {
      console.warn('[Voice] Volume detection init warning:', e);
    }
  }

  public toggleMic(): boolean {
    if (!this.localStream) return false;
    this.isMicMuted = !this.isMicMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMicMuted;
    });

    getSocket().emit('voice:mute-status', { isMuted: this.isMicMuted });
    if (this.isMicMuted && this.isLocallySpeaking) {
      this.isLocallySpeaking = false;
      getSocket().emit('voice:speaking', { isSpeaking: false });
    }

    this.notify();
    return this.isMicMuted;
  }

  public toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;

    // Update gain nodes and audio elements for all peers
    this.peers.forEach((peer, socketId) => {
      const isMuted = this.isDeafened || this.locallyMutedRemotePeers.has(socketId);
      if (peer.gainNode) {
        peer.gainNode.gain.value = isMuted ? 0 : 1;
      }
      if (peer.audioElement) {
        peer.audioElement.muted = isMuted;
      }
    });

    // Also mute own mic if deafened
    if (this.isDeafened && !this.isMicMuted) {
      this.toggleMic();
    }

    this.notify();
    return this.isDeafened;
  }

  public toggleMutePeerLocally(remoteSocketId: string): boolean {
    const isMuted = this.locallyMutedRemotePeers.has(remoteSocketId);
    if (isMuted) {
      this.locallyMutedRemotePeers.delete(remoteSocketId);
    } else {
      this.locallyMutedRemotePeers.add(remoteSocketId);
    }

    const peer = this.peers.get(remoteSocketId);
    if (peer) {
      const mutedNow = this.isDeafened || !isMuted;
      if (peer.gainNode) {
        peer.gainNode.gain.value = mutedNow ? 0 : 1;
      }
      if (peer.audioElement) {
        peer.audioElement.muted = mutedNow;
      }
    }

    this.notify();
    return !isMuted;
  }

  public stopVoice() {
    if (this.speechCheckInterval) {
      clearInterval(this.speechCheckInterval);
      this.speechCheckInterval = null;
    }

    if (this.micContext && this.micContext.state !== 'closed') {
      try {
        this.micContext.close();
      } catch {}
      this.micContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch {}
      if (peer.sourceNode) {
        try {
          peer.sourceNode.disconnect();
        } catch {}
      }
      if (peer.gainNode) {
        try {
          peer.gainNode.disconnect();
        } catch {}
      }
      if (peer.audioElement && peer.audioElement.parentNode) {
        peer.audioElement.parentNode.removeChild(peer.audioElement);
      }
    });
    this.peers.clear();
    this.pendingCandidates.clear();

    this.speakingPeers.clear();
    this.mutedPeers.clear();
    this.locallyMutedRemotePeers.clear();

    if (this.isConnected) {
      getSocket().emit('voice:leave');
    }

    this.isConnected = false;
    this.isLocallySpeaking = false;
    this.currentRoomCode = null;
    this.notify();
  }

  // Getters
  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getIsMicMuted(): boolean {
    return this.isMicMuted;
  }

  public getIsDeafened(): boolean {
    return this.isDeafened;
  }

  public getIsLocallySpeaking(): boolean {
    return this.isLocallySpeaking;
  }

  public getConnectedPeerCount(): number {
    return this.peers.size;
  }

  public isPeerSpeaking(socketId: string): boolean {
    return this.speakingPeers.has(socketId);
  }

  public isPeerMuted(socketId: string): boolean {
    return this.mutedPeers.has(socketId);
  }

  public isPeerLocallyMuted(socketId: string): boolean {
    return this.locallyMutedRemotePeers.has(socketId);
  }
}

export const voiceChatService = new VoiceChatService();
