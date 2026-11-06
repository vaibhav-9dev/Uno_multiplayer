import { getSocket } from './socket.ts';

type VoiceEventCallback = () => void;

interface PeerData {
  pc: RTCPeerConnection;
  audioElement?: HTMLAudioElement;
  stream?: MediaStream;
  isPolite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  signalQueue: Promise<void>;
}

interface VoiceJoinResponse {
  users?: string[];
  error?: string;
}

class VoiceChatService {
  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerData>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  private speakingPeers = new Set<string>();
  private mutedPeers = new Set<string>();
  private locallyMutedRemotePeers = new Set<string>();
  private listeners = new Set<VoiceEventCallback>();

  private isConnected = false;
  private isMicMuted = false;
  private isDeafened = false;
  private isLocallySpeaking = false;
  private micWasMutedBeforeDeafen = false;
  private currentRoomCode: string | null = null;
  private joining = false;
  private unlockInstalled = false;

  private micContext: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private speechCheckInterval: ReturnType<typeof setInterval> | null = null;

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },

      // Optional TURN configuration. Set these in your Vite environment.
      ...this.getTurnServers(),
    ],
    iceCandidatePoolSize: 4,
  };

  constructor() {
    this.setupSignalingListeners();
    this.setupUserUnlockHandlers();
  }

  private getTurnServers(): RTCIceServer[] {
    const env = (import.meta as any).env || {};
    const urls = env.VITE_TURN_URL;
    const username = env.VITE_TURN_USERNAME;
    const credential = env.VITE_TURN_CREDENTIAL;

    if (!urls || !username || !credential) return [];

    return [{
      urls: String(urls).split(',').map((url: string) => url.trim()),
      username,
      credential,
    }];
  }

  public subscribe(callback: VoiceEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.warn('[Voice] Listener error:', error);
      }
    });
  }

  /*
   * Mobile browsers require audio playback to be unlocked by a real
   * user gesture. The user should tap the voice button to start voice.
   */
  private setupUserUnlockHandlers(): void {
    if (typeof window === 'undefined' || this.unlockInstalled) return;

    this.unlockInstalled = true;

    const unlock = () => {
      this.peers.forEach((peer) => {
        const audio = peer.audioElement;
        if (!audio || !audio.srcObject) return;

        audio.play().catch((error) => {
          console.warn('[Voice] Playback still blocked:', error);
        });
      });
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private setupSignalingListeners(): void {
    const socket = getSocket();

    socket.on('voice:user-joined', async ({ socketId }: { socketId: string }) => {
      if (!this.isConnected || !socket.id || socketId === socket.id) return;

      const shouldOffer = socket.id > socketId;
      await this.getOrCreatePeer(socketId, shouldOffer);
    });

    socket.on(
      'voice:signal',
      ({ from, signal }: { from: string; signal: any }) => {
        if (!this.isConnected || !from || from === socket.id || !signal) return;

        void this.processSignal(from, signal);
      }
    );

    socket.on(
      'voice:mute-status',
      ({ socketId, isMuted }: { socketId: string; isMuted: boolean }) => {
        if (isMuted) this.mutedPeers.add(socketId);
        else this.mutedPeers.delete(socketId);
        this.notify();
      }
    );

    socket.on(
      'voice:speaking',
      ({ socketId, isSpeaking }: { socketId: string; isSpeaking: boolean }) => {
        if (isSpeaking) this.speakingPeers.add(socketId);
        else this.speakingPeers.delete(socketId);
        this.notify();
      }
    );

    socket.on('voice:user-left', ({ socketId }: { socketId: string }) => {
      this.removePeer(socketId);
      this.notify();
    });

    socket.on('disconnect', () => {
      this.handleSocketDisconnect();
    });

    socket.on('connect', () => {
      if (this.isConnected && this.currentRoomCode) {
        void this.rejoinAfterReconnect();
      }
    });
  }

  private async processSignal(from: string, signal: any): Promise<void> {
    const peer = await this.getOrCreatePeer(from, false);

    // Serialize signaling messages for each peer to avoid race conditions.
    peer.signalQueue = peer.signalQueue
      .then(async () => {
        const pc = peer.pc;

        if (pc.signalingState === 'closed') return;

        try {
          if (signal.type === 'offer') {
            const collision =
              peer.makingOffer || pc.signalingState !== 'stable';

            peer.ignoreOffer = !peer.isPolite && collision;

            if (peer.ignoreOffer) return;

            if (collision && peer.isPolite) {
              await pc.setLocalDescription({ type: 'rollback' });
            }

            await pc.setRemoteDescription(
              new RTCSessionDescription(signal)
            );

            await this.drainPendingCandidates(from, pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            getSocket().emit('voice:signal', {
              to: from,
              signal: pc.localDescription,
            });
          } else if (signal.type === 'answer') {
            if (pc.signalingState !== 'have-local-offer') return;

            await pc.setRemoteDescription(
              new RTCSessionDescription(signal)
            );

            await this.drainPendingCandidates(from, pc);
          } else if (signal.candidate) {
            if (peer.ignoreOffer) return;

            if (pc.remoteDescription) {
              await pc.addIceCandidate(
                new RTCIceCandidate(signal)
              );
            } else {
              const queue = this.pendingCandidates.get(from) || [];
              queue.push(signal);
              this.pendingCandidates.set(from, queue);
            }
          }
        } catch (error) {
          console.warn('[Voice] Signal processing error:', error);
        }
      })
      .catch((error) => {
        console.warn('[Voice] Signal queue error:', error);
      });

    await peer.signalQueue;
  }

  private async drainPendingCandidates(
    socketId: string,
    pc: RTCPeerConnection
  ): Promise<void> {
    const candidates = this.pendingCandidates.get(socketId);
    if (!candidates?.length) return;

    this.pendingCandidates.delete(socketId);

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn('[Voice] ICE candidate error:', error);
      }
    }
  }

  public async startVoice(roomCode: string): Promise<boolean> {
    if (this.joining) return false;

    if (
      this.isConnected &&
      this.currentRoomCode === roomCode &&
      this.localStream
    ) {
      return true;
    }

    if (this.isConnected && this.currentRoomCode !== roomCode) {
      this.stopVoice();
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      console.error('[Voice] Microphone access is unavailable. Use HTTPS.');
      return false;
    }

    this.joining = true;
    this.currentRoomCode = roomCode;

    try {
      if (!this.localStream) {
        // Avoid forcing a sample rate or channel count on mobile devices.
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        this.setupVolumeDetection(this.localStream);
      }

      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      this.isMicMuted = false;
      this.isDeafened = false;
      this.isConnected = true;

      const socket = getSocket();

      if (!socket.connected) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Socket connection timed out')),
            10000
          );

          socket.once('connect', () => {
            clearTimeout(timeout);
            resolve();
          });

          socket.connect();
        });
      }

      const response = await new Promise<VoiceJoinResponse>((resolve, reject) => {
        socket.emit('voice:join', { roomCode }, (res: VoiceJoinResponse) => {
          if (res?.error) reject(new Error(res.error));
          else resolve(res || {});
        });

        setTimeout(() => {
          // Do not reject here: the server callback may still arrive.
        }, 10000);
      });

      if (response.users && socket.id) {
        for (const socketId of response.users) {
          if (socketId === socket.id) continue;

          const shouldOffer = socket.id > socketId;
          await this.getOrCreatePeer(socketId, shouldOffer);
        }
      }

      this.notify();
      return true;
    } catch (error) {
      console.error('[Voice] Could not start voice:', error);

      this.isConnected = false;
      this.currentRoomCode = null;

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = null;
      }

      this.notify();
      return false;
    } finally {
      this.joining = false;
    }
  }

  private async rejoinAfterReconnect(): Promise<void> {
    if (!this.currentRoomCode || !this.localStream) return;

    const socket = getSocket();

    socket.emit(
      'voice:join',
      { roomCode: this.currentRoomCode },
      async (response: VoiceJoinResponse) => {
        if (!response?.users || !socket.id) return;

        for (const socketId of response.users) {
          if (socketId === socket.id) continue;

          await this.getOrCreatePeer(
            socketId,
            socket.id > socketId
          );
        }

        this.notify();
      }
    );
  }

  private async getOrCreatePeer(
    remoteSocketId: string,
    initiateOffer: boolean
  ): Promise<PeerData> {
    const existing = this.peers.get(remoteSocketId);

    if (existing) {
      if (initiateOffer && existing.pc.signalingState === 'stable') {
        await this.makeOffer(existing, remoteSocketId);
      }
      return existing;
    }

    const myId = getSocket().id || '';

    const pc = new RTCPeerConnection(this.rtcConfig);

    const peer: PeerData = {
      pc,
      isPolite: myId < remoteSocketId,
      makingOffer: false,
      ignoreOffer: false,
      signalQueue: Promise.resolve(),
    };

    this.peers.set(remoteSocketId, peer);

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;

      getSocket().emit('voice:signal', {
        to: remoteSocketId,
        signal: event.candidate,
      });
    };

    pc.ontrack = (event) => {
      const stream =
        event.streams[0] || new MediaStream([event.track]);

      peer.stream = stream;
      this.attachRemoteAudio(remoteSocketId, peer, stream);
      this.notify();
    };

    pc.onconnectionstatechange = () => {
      console.log(
        `[Voice] ${remoteSocketId} connection:`,
        pc.connectionState
      );

      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        this.removePeer(remoteSocketId);
        this.notify();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(
        `[Voice] ${remoteSocketId} ICE:`,
        pc.iceConnectionState
      );

      if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce();
          if (pc.signalingState === 'stable') {
            void this.makeOffer(peer, remoteSocketId);
          }
        } catch (error) {
          console.warn('[Voice] ICE restart failed:', error);
        }
      }
    };

    if (initiateOffer) {
      await this.makeOffer(peer, remoteSocketId);
    }

    return peer;
  }

  private attachRemoteAudio(
    socketId: string,
    peer: PeerData,
    stream: MediaStream
  ): void {
    let audio = peer.audioElement;

    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `uno-voice-${socketId}`;
      audio.autoplay = true;
      audio.controls = false;
      audio.muted = false;
      audio.volume = 1;
      audio.preload = 'auto';

      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');

      // Keep it in the document; display:none can cause mobile playback issues.
      audio.style.position = 'fixed';
      audio.style.width = '1px';
      audio.style.height = '1px';
      audio.style.opacity = '0';
      audio.style.pointerEvents = 'none';
      audio.style.left = '-10px';
      audio.style.bottom = '0';

      document.body.appendChild(audio);
      peer.audioElement = audio;
    }

    audio.srcObject = stream;
    audio.muted =
      this.isDeafened ||
      this.locallyMutedRemotePeers.has(socketId);

    // This must be attempted after the user has tapped the voice button.
    audio.play().catch((error) => {
      console.warn(
        '[Voice] Mobile browser blocked playback; tap the screen:',
        error
      );
    });
  }

  private async makeOffer(
    peer: PeerData,
    remoteSocketId: string
  ): Promise<void> {
    const pc = peer.pc;

    if (pc.signalingState !== 'stable') return;

    try {
      peer.makingOffer = true;

      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;

      await pc.setLocalDescription(offer);

      getSocket().emit('voice:signal', {
        to: remoteSocketId,
        signal: pc.localDescription,
      });
    } catch (error) {
      console.warn('[Voice] Could not create offer:', error);
    } finally {
      peer.makingOffer = false;
    }
  }

  private setupVolumeDetection(stream: MediaStream): void {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as any).webkitAudioContext;

      if (!AudioContextClass) return;

      this.micContext = new AudioContextClass();
      this.micSource =
        this.micContext.createMediaStreamSource(stream);
      this.micAnalyser = this.micContext.createAnalyser();

      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.4;

      this.micSource.connect(this.micAnalyser);

      const data = new Uint8Array(
        this.micAnalyser.frequencyBinCount
      );

      let wasSpeaking = false;

      if (this.speechCheckInterval) {
        clearInterval(this.speechCheckInterval);
      }

      this.speechCheckInterval = setInterval(() => {
        if (
          !this.micAnalyser ||
          this.isMicMuted ||
          !this.isConnected
        ) {
          if (wasSpeaking) {
            wasSpeaking = false;
            this.isLocallySpeaking = false;
            getSocket().emit('voice:speaking', {
              isSpeaking: false,
            });
            this.notify();
          }
          return;
        }

        this.micAnalyser.getByteFrequencyData(data);

        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i];
        }

        const average = sum / data.length;
        const speaking = average > 10;

        if (speaking !== wasSpeaking) {
          wasSpeaking = speaking;
          this.isLocallySpeaking = speaking;

          getSocket().emit('voice:speaking', {
            isSpeaking: speaking,
          });

          this.notify();
        }
      }, 100);
    } catch (error) {
      console.warn('[Voice] Microphone level detection error:', error);
    }
  }

  private removePeer(socketId: string): void {
    const peer = this.peers.get(socketId);
    if (!peer) return;

    try {
      peer.pc.ontrack = null;
      peer.pc.onicecandidate = null;
      peer.pc.close();
    } catch {}

    if (peer.audioElement) {
      peer.audioElement.pause();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
    }

    this.peers.delete(socketId);
    this.pendingCandidates.delete(socketId);
    this.speakingPeers.delete(socketId);
    this.mutedPeers.delete(socketId);
    this.locallyMutedRemotePeers.delete(socketId);
  }

  private handleSocketDisconnect(): void {
    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch {}

      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
        peer.audioElement.remove();
      }
    });

    this.peers.clear();
    this.pendingCandidates.clear();
    this.speakingPeers.clear();
    this.notify();
  }

  public toggleMic(): boolean {
    if (!this.localStream) return false;

    this.isMicMuted = !this.isMicMuted;

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMicMuted;
    });

    getSocket().emit('voice:mute-status', {
      isMuted: this.isMicMuted,
    });

    if (this.isMicMuted && this.isLocallySpeaking) {
      this.isLocallySpeaking = false;
      getSocket().emit('voice:speaking', {
        isSpeaking: false,
      });
    }

    this.notify();
    return this.isMicMuted;
  }

  private setMicMuted(muted: boolean): void {
    if (!this.localStream || this.isMicMuted === muted) return;

    this.isMicMuted = muted;

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });

    getSocket().emit('voice:mute-status', {
      isMuted: muted,
    });

    if (muted && this.isLocallySpeaking) {
      this.isLocallySpeaking = false;
      getSocket().emit('voice:speaking', {
        isSpeaking: false,
      });
    }
  }

  public toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;

    this.peers.forEach((peer, socketId) => {
      if (peer.audioElement) {
        peer.audioElement.muted =
          this.isDeafened ||
          this.locallyMutedRemotePeers.has(socketId);
      }
    });

    if (this.isDeafened) {
      this.micWasMutedBeforeDeafen = this.isMicMuted;
      this.setMicMuted(true);
    } else {
      this.setMicMuted(this.micWasMutedBeforeDeafen);
    }

    this.notify();
    return this.isDeafened;
  }

  public toggleMutePeerLocally(remoteSocketId: string): boolean {
    const currentlyMuted =
      this.locallyMutedRemotePeers.has(remoteSocketId);

    if (currentlyMuted) {
      this.locallyMutedRemotePeers.delete(remoteSocketId);
    } else {
      this.locallyMutedRemotePeers.add(remoteSocketId);
    }

    const peer = this.peers.get(remoteSocketId);

    if (peer?.audioElement) {
      peer.audioElement.muted =
        this.isDeafened || !currentlyMuted;
    }

    this.notify();
    return !currentlyMuted;
  }

  public stopVoice(): void {
    if (this.speechCheckInterval) {
      clearInterval(this.speechCheckInterval);
      this.speechCheckInterval = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}
      this.micSource = null;
    }

    if (this.micContext && this.micContext.state !== 'closed') {
      this.micContext.close().catch(() => {});
    }

    this.micContext = null;
    this.micAnalyser = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch {}

      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
        peer.audioElement.remove();
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
    this.isMicMuted = false;
    this.isDeafened = false;
    this.isLocallySpeaking = false;
    this.micWasMutedBeforeDeafen = false;
    this.currentRoomCode = null;
    this.joining = false;

    this.notify();
  }

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