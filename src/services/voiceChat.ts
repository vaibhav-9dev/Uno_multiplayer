/**
 * WebRTC Mesh Voice Chat Service for UNO Multiplayer.
 * Robust peer-to-peer audio with:
 * - Proper ICE candidate queuing (prevents premature candidate dropping before remote description)
 * - Safe HTMLAudioElement attaching to DOM with explicit play() + catch
 * - AudioContext resume on user gesture (fixes Chrome/Safari autoplay policy blocking remote sound)
 * - Volume speech detection broadcasting
 * - Mic mute, deafen, and per-peer local mute
 */

import { getSocket } from './socket.ts';

type VoiceEventCallback = () => void;

class VoiceChatService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private audioContainer: HTMLDivElement | null = null;

  private speakingPeers: Set<string> = new Set();
  private mutedPeers: Set<string> = new Set();
  private locallyMutedRemotePeers: Set<string> = new Set();

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
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
  };

  constructor() {
    this.setupSignalingListeners();
    this.ensureAudioContainer();
    this.setupUserInteractionAudioUnlock();
  }

  private ensureAudioContainer() {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('uno-voice-audio-container') as HTMLDivElement;
    if (!container) {
      container = document.createElement('div');
      container.id = 'uno-voice-audio-container';
      container.style.position = 'absolute';
      container.style.width = '0';
      container.style.height = '0';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      container.style.overflow = 'hidden';
      document.body.appendChild(container);
    }
    this.audioContainer = container;
  }

  // Modern browsers block remote audio playback until user interacts with the page
  private setupUserInteractionAudioUnlock() {
    if (typeof window === 'undefined') return;
    const unlockAudio = () => {
      // Resume AudioContext if suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      // Re-trigger play on all remote audio elements
      this.audioElements.forEach((audio) => {
        if (audio.paused && audio.srcObject) {
          audio.play().catch(() => {});
        }
      });
    };

    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
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
        // ignore
      }
    });
  }

  private setupSignalingListeners() {
    const socket = getSocket();

    // Another user joined voice in this room -> initiate WebRTC call
    socket.on('voice:user-joined', async ({ socketId }: { socketId: string }) => {
      console.log('[Voice] Peer joined room:', socketId);
      if (socketId === socket.id) return;
      // We initiate connection to the new joiner
      await this.createPeerConnection(socketId, true);
    });

    // Received WebRTC signaling message
    socket.on('voice:signal', async ({ from, signal }: { from: string; signal: any }) => {
      if (from === socket.id) return;

      let pc = this.peerConnections.get(from);
      if (!pc) {
        pc = await this.createPeerConnection(from, false);
      }

      try {
        if (signal.type === 'offer') {
          console.log('[Voice] Received offer from:', from);
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          // Flush any ICE candidates received before the offer
          await this.flushPendingCandidates(from, pc);

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
            // Flush any ICE candidates received before the answer
            await this.flushPendingCandidates(from, pc);
          }
        } else if (signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
          } else {
            // Queue candidate until remote description is set
            const queue = this.pendingCandidates.get(from) || [];
            queue.push(signal);
            this.pendingCandidates.set(from, queue);
          }
        }
      } catch (err) {
        console.warn('[Voice] Signal error:', err);
      }
    });

    // Remote peer mute changed
    socket.on('voice:mute-status', ({ socketId, isMuted }: { socketId: string; isMuted: boolean }) => {
      if (isMuted) {
        this.mutedPeers.add(socketId);
      } else {
        this.mutedPeers.delete(socketId);
      }
      this.notify();
    });

    // Remote peer speaking changed
    socket.on('voice:speaking', ({ socketId, isSpeaking }: { socketId: string; isSpeaking: boolean }) => {
      if (isSpeaking) {
        this.speakingPeers.add(socketId);
      } else {
        this.speakingPeers.delete(socketId);
      }
      this.notify();
    });

    // Remote peer left voice
    socket.on('voice:user-left', ({ socketId }: { socketId: string }) => {
      console.log('[Voice] Peer left voice:', socketId);
      this.removePeer(socketId);
      this.notify();
    });
  }

  private async flushPendingCandidates(socketId: string, pc: RTCPeerConnection) {
    const queue = this.pendingCandidates.get(socketId);
    if (!queue || queue.length === 0) return;

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[Voice] Failed adding queued candidate:', err);
      }
    }
    this.pendingCandidates.delete(socketId);
  }

  public async startVoice(roomCode: string): Promise<boolean> {
    this.ensureAudioContainer();
    this.currentRoomCode = roomCode;

    // If already connected with local mic stream, just rejoin signaling room
    if (this.isConnected && this.localStream) {
      getSocket().emit('voice:join', { roomCode }, async (res: { users?: string[] }) => {
        if (res?.users) {
          for (const socketId of res.users) {
            if (socketId !== getSocket().id) {
              await this.createPeerConnection(socketId, true);
            }
          }
        }
        this.notify();
      });
      return true;
    }

    try {
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
      this.isMicMuted = false;
      this.setupVolumeDetection(stream);

      const socket = getSocket();

      // Join room voice mesh and negotiate with any peers already in the room
      socket.emit('voice:join', { roomCode }, async (res: { users?: string[] }) => {
        console.log('[Voice] Joined voice room, existing peers:', res?.users);
        if (res?.users) {
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
      console.warn('[Voice] getUserMedia error:', err);
      this.isConnected = false;
      this.notify();
      return false;
    }
  }

  private async createPeerConnection(remoteSocketId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    // If existing, close and recreate cleanly
    const existingPc = this.peerConnections.get(remoteSocketId);
    if (existingPc) {
      try {
        existingPc.close();
      } catch {}
      this.peerConnections.delete(remoteSocketId);
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(remoteSocketId, pc);

    // Add local mic audio tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch (e) {
          console.warn('[Voice] Error adding track:', e);
        }
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
      console.log('[Voice] ontrack received audio from:', remoteSocketId);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStreams.set(remoteSocketId, remoteStream);

      this.ensureAudioContainer();

      // Create or reuse DOM Audio element attached to document
      let audio = this.audioElements.get(remoteSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `uno-audio-peer-${remoteSocketId}`;
        audio.autoplay = true;
        // iOS Safari and modern browsers require playsinline
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        if (this.audioContainer) {
          this.audioContainer.appendChild(audio);
        }
        this.audioElements.set(remoteSocketId, audio);
      }

      audio.srcObject = remoteStream;
      audio.muted = this.isDeafened || this.locallyMutedRemotePeers.has(remoteSocketId);
      audio.volume = 1.0;

      // Explicitly call play and handle autoplay restrictions
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.log('[Voice] Autoplay deferred until user interaction:', err);
        });
      }

      this.notify();
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Voice] Connection state with ${remoteSocketId}:`, pc.connectionState);
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
        console.warn('[Voice] Error creating offer:', err);
      }
    }

    return pc;
  }

  private removePeer(socketId: string) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      this.peerConnections.delete(socketId);
    }

    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
      this.audioElements.delete(socketId);
    }

    this.pendingCandidates.delete(socketId);
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
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      let wasSpeaking = false;

      if (this.speechCheckInterval) {
        clearInterval(this.speechCheckInterval);
      }

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
        const isSpeaking = average > 12; // Sensitive volume threshold for speech

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
    this.audioElements.forEach((audio, socketId) => {
      audio.muted = this.isDeafened || this.locallyMutedRemotePeers.has(socketId);
    });

    // If deafened, also mute own mic
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
      } catch {}
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    this.peerConnections.clear();
    this.pendingCandidates.clear();

    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
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
