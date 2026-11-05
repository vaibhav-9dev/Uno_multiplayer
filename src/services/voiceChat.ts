/**
 * WebRTC Mesh Voice Chat Service for UNO Multiplayer.
 * Zero-latency peer-to-peer audio with echo cancellation, noise suppression,
 * speech volume detection, individual mute, and deafen controls.
 */

import { getSocket } from './socket.ts';

export interface VoicePeerState {
  socketId: string;
  stream: MediaStream;
  isMuted: boolean;
  isSpeaking: boolean;
}

type VoiceEventCallback = () => void;

class VoiceChatService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private speakingPeers: Set<string> = new Set();
  private mutedPeers: Set<string> = new Set();
  private locallyMutedRemotePeers: Set<string> = new Set(); // Mute specific noisy peer locally

  private isMicMuted: boolean = false;
  private isDeafened: boolean = false;
  private isConnected: boolean = false;
  private isLocallySpeaking: boolean = false;
  private currentRoomCode: string | null = null;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private speechCheckInterval: any = null;

  private listeners: Set<VoiceEventCallback> = new Set();

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };

  constructor() {
    this.setupSignalingListeners();
  }

  public subscribe(cb: VoiceEventCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore callback error
      }
    });
  }

  private setupSignalingListeners() {
    const socket = getSocket();

    // Another user joined voice chat in our room -> initiate WebRTC offer
    socket.on('voice:user-joined', async ({ socketId }: { socketId: string }) => {
      if (!this.localStream || socketId === socket.id) return;
      await this.createPeerConnection(socketId, true);
    });

    // Received WebRTC signaling data (offer, answer, or ICE candidate)
    socket.on('voice:signal', async ({ from, signal }: { from: string; signal: any }) => {
      if (!this.localStream) return;

      let pc = this.peerConnections.get(from);
      if (!pc) {
        pc = await this.createPeerConnection(from, false);
      }

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', {
            to: from,
            signal: answer,
          });
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          }
        } else if (signal.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
          } catch {
            // candidate might be received before remoteDescription
          }
        }
      } catch (err) {
        console.warn('WebRTC signal handling warning:', err);
      }
    });

    // Peer mute status changed
    socket.on('voice:mute-status', ({ socketId, isMuted }: { socketId: string; isMuted: boolean }) => {
      if (isMuted) {
        this.mutedPeers.add(socketId);
      } else {
        this.mutedPeers.delete(socketId);
      }
      this.notify();
    });

    // Peer speaking state changed
    socket.on('voice:speaking', ({ socketId, isSpeaking }: { socketId: string; isSpeaking: boolean }) => {
      if (isSpeaking) {
        this.speakingPeers.add(socketId);
      } else {
        this.speakingPeers.delete(socketId);
      }
      this.notify();
    });

    // Peer left voice chat
    socket.on('voice:user-left', ({ socketId }: { socketId: string }) => {
      this.removePeer(socketId);
      this.notify();
    });
  }

  public async startVoice(roomCode: string): Promise<boolean> {
    if (this.isConnected && this.currentRoomCode === roomCode) {
      return true;
    }

    this.currentRoomCode = roomCode;

    try {
      // Capture high-quality microphone audio with automatic noise reduction
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      this.isConnected = true;
      this.setupVolumeDetection(stream);

      const socket = getSocket();

      // Join room's voice mesh and get existing peer sockets
      socket.emit('voice:join', { roomCode }, async (res: { users?: string[] }) => {
        if (res && res.users) {
          for (const socketId of res.users) {
            if (socketId !== socket.id) {
              await this.createPeerConnection(socketId, true);
            }
          }
        }
        this.notify();
      });

      this.notify();
      return true;
    } catch (err) {
      console.warn('Microphone permission denied or not available:', err);
      this.isConnected = false;
      this.notify();
      return false;
    }
  }

  private async createPeerConnection(remoteSocketId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    // Clean existing if any
    const existingPc = this.peerConnections.get(remoteSocketId);
    if (existingPc) {
      existingPc.close();
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(remoteSocketId, pc);

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Send ICE candidates to remote peer via socket
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
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStreams.set(remoteSocketId, remoteStream);

      // Play remote audio
      let audio = this.audioElements.get(remoteSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        this.audioElements.set(remoteSocketId, audio);
      }
      audio.srcObject = remoteStream;
      audio.muted = this.isDeafened || this.locallyMutedRemotePeers.has(remoteSocketId);
      audio.play().catch(() => {
        // Audio autoplay policy
      });

      this.notify();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(remoteSocketId);
      }
    };

    // If initiator, generate offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        getSocket().emit('voice:signal', {
          to: remoteSocketId,
          signal: offer,
        });
      } catch (err) {
        console.warn('Error creating WebRTC offer:', err);
      }
    }

    return pc;
  }

  private removePeer(socketId: string) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }
    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      this.audioElements.delete(socketId);
    }
    this.remoteStreams.delete(socketId);
    this.speakingPeers.delete(socketId);
    this.mutedPeers.delete(socketId);
    this.locallyMutedRemotePeers.delete(socketId);
  }

  private setupVolumeDetection(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      let wasSpeaking = false;

      this.speechCheckInterval = setInterval(() => {
        if (!this.analyser || this.isMicMuted || !this.isConnected) {
          if (wasSpeaking) {
            wasSpeaking = false;
            this.isLocallySpeaking = false;
            getSocket().emit('voice:speaking', { isSpeaking: false });
            this.notify();
          }
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const average = sum / buffer.length;
        const isSpeaking = average > 14; // voice volume threshold

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          this.isLocallySpeaking = isSpeaking;
          getSocket().emit('voice:speaking', { isSpeaking });
          this.notify();
        }
      }, 100);
    } catch {
      // AudioContext not supported or permission issue
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
    this.audioElements.forEach((audio, socketId) => {
      audio.muted = this.isDeafened || this.locallyMutedRemotePeers.has(socketId);
    });

    // If deafened, also mute microphone
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

    const audio = this.audioElements.get(remoteSocketId);
    if (audio) {
      audio.muted = this.isDeafened || !isMuted;
    }

    this.notify();
    return !isMuted;
  }

  public stopVoice() {
    if (this.speechCheckInterval) {
      clearInterval(this.speechCheckInterval);
      this.speechCheckInterval = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
    });
    this.audioElements.clear();

    this.remoteStreams.clear();
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
    return this.peerConnections.size;
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
