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
  hasRtcAudio?: boolean;
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

  // Local mic processing
  private micContext: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private speechCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Audio Playback Engine (Web Audio API)
  // Bypasses browser autoplay restrictions and guarantees loud output over phone loudspeaker
  private playbackContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private peerNextPlayTime = new Map<string, number>();
  private peerGains = new Map<string, GainNode>();
  private peerSpeechTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    iceCandidatePoolSize: 4,
  };

  constructor() {
    this.setupSignalingListeners();
    this.setupUserUnlockHandlers();
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

  /**
   * Initializes or resumes the playback AudioContext on user interaction.
   * Browsers (iOS Safari, Android Chrome, Desktop) require a user gesture
   * before audio can be played aloud.
   */
  private ensurePlaybackContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.playbackContext || this.playbackContext.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.playbackContext = new AudioCtxClass();
        this.masterGain = this.playbackContext.createGain();
        this.masterGain.gain.value = 1.6; // Clear voice boost for phone loudspeaker
        this.masterGain.connect(this.playbackContext.destination);
      }
    }

    if (this.playbackContext && this.playbackContext.state === 'suspended') {
      this.playbackContext.resume().catch(() => {});
    }

    return this.playbackContext;
  }

  private setupUserUnlockHandlers(): void {
    if (typeof window === 'undefined' || this.unlockInstalled) return;
    this.unlockInstalled = true;

    const unlock = () => {
      this.ensurePlaybackContext();

      // Also unlock all peer <audio> tags
      this.peers.forEach((peer) => {
        const audio = peer.audioElement;
        if (audio && audio.srcObject) {
          audio.play().catch(() => {});
        }
      });
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private setupSignalingListeners(): void {
    const socket = getSocket();

    // Direct relayed audio chunk packet (guaranteed zero-packet-loss fallback)
    socket.on('voice:audio-chunk', (data: { socketId: string; audio: ArrayBuffer; sampleRate?: number }) => {
      if (!this.isConnected || !data?.audio || !data?.socketId || data.socketId === socket.id) return;
      this.playReceivedAudioChunk(data.socketId, data.audio, data.sampleRate || 24000);
    });

    socket.on('voice:user-joined', async ({ socketId }: { socketId: string }) => {
      if (!this.isConnected || !socket.id || socketId === socket.id) return;
      const shouldOffer = socket.id > socketId;
      await this.getOrCreatePeer(socketId, shouldOffer);
    });

    socket.on('voice:signal', ({ from, signal }: { from: string; signal: any }) => {
      if (!this.isConnected || !from || from === socket.id || !signal) return;
      void this.processSignal(from, signal);
    });

    socket.on('voice:mute-status', ({ socketId, isMuted }: { socketId: string; isMuted: boolean }) => {
      if (isMuted) this.mutedPeers.add(socketId);
      else this.mutedPeers.delete(socketId);
      this.notify();
    });

    socket.on('voice:speaking', ({ socketId, isSpeaking }: { socketId: string; isSpeaking: boolean }) => {
      if (isSpeaking) this.speakingPeers.add(socketId);
      else this.speakingPeers.delete(socketId);
      this.notify();
    });

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

  /**
   * Plays a received audio chunk through the Web Audio destination.
   * Completely immune to WebRTC NAT traversal errors or iOS/Android call-mode silencing.
   */
  private playReceivedAudioChunk(remoteSocketId: string, arrayBuffer: ArrayBuffer, senderSampleRate: number): void {
    if (this.isDeafened || this.locallyMutedRemotePeers.has(remoteSocketId)) {
      return;
    }

    const ctx = this.ensurePlaybackContext();
    if (!ctx) return;

    try {
      const int16Data = new Int16Array(arrayBuffer);
      if (int16Data.length === 0) return;

      // Convert 16-bit PCM to Float32Array [-1.0, 1.0]
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
      }

      // Create an audio buffer
      const audioBuffer = ctx.createBuffer(1, float32Data.length, senderSampleRate);
      audioBuffer.copyToChannel(float32Data, 0);

      // Get or create individual gain node for this peer
      let peerGain = this.peerGains.get(remoteSocketId);
      if (!peerGain) {
        peerGain = ctx.createGain();
        peerGain.gain.value = 1.5;
        if (this.masterGain) {
          peerGain.connect(this.masterGain);
        } else {
          peerGain.connect(ctx.destination);
        }
        this.peerGains.set(remoteSocketId, peerGain);
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(peerGain);

      // Schedule seamless gapless audio playback
      const currentTime = ctx.currentTime;
      let nextTime = this.peerNextPlayTime.get(remoteSocketId) || currentTime;
      if (nextTime < currentTime) {
        nextTime = currentTime;
      }

      source.start(nextTime);
      this.peerNextPlayTime.set(remoteSocketId, nextTime + audioBuffer.duration);

      // Mark peer as speaking visually
      this.speakingPeers.add(remoteSocketId);
      this.notify();

      const existingTimer = this.peerSpeechTimers.get(remoteSocketId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        this.speakingPeers.delete(remoteSocketId);
        this.notify();
      }, 350);
      this.peerSpeechTimers.set(remoteSocketId, timer);
    } catch (err) {
      console.warn('[Voice] Error playing audio chunk:', err);
    }
  }

  private async processSignal(from: string, signal: any): Promise<void> {
    const peer = await this.getOrCreatePeer(from, false);

    peer.signalQueue = peer.signalQueue
      .then(async () => {
        const pc = peer.pc;
        if (pc.signalingState === 'closed') return;

        try {
          if (signal.type === 'offer') {
            const collision = peer.makingOffer || pc.signalingState !== 'stable';
            peer.ignoreOffer = !peer.isPolite && collision;
            if (peer.ignoreOffer) return;

            if (collision && peer.isPolite) {
              await pc.setLocalDescription({ type: 'rollback' });
            }

            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            await this.drainPendingCandidates(from, pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            getSocket().emit('voice:signal', {
              to: from,
              signal: pc.localDescription,
            });
          } else if (signal.type === 'answer') {
            if (pc.signalingState !== 'have-local-offer') return;
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            await this.drainPendingCandidates(from, pc);
          } else if (signal.candidate !== undefined) {
            if (peer.ignoreOffer) return;

            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(signal));
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

  private async drainPendingCandidates(socketId: string, pc: RTCPeerConnection): Promise<void> {
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

    // Ensure audio output is initialized and unlocked right as user clicks Voice
    this.ensurePlaybackContext();

    if (this.isConnected && this.currentRoomCode === roomCode && this.localStream) {
      return true;
    }

    if (this.isConnected && this.currentRoomCode !== roomCode) {
      this.stopVoice();
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      console.error('[Voice] Microphone access is unavailable. HTTPS required.');
      return false;
    }

    this.joining = true;
    this.currentRoomCode = roomCode;

    try {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        this.setupAudioProcessing(this.localStream);
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
          const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 10000);
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

        setTimeout(() => {}, 10000);
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
    socket.emit('voice:join', { roomCode: this.currentRoomCode }, async (response: VoiceJoinResponse) => {
      if (!response?.users || !socket.id) return;

      for (const socketId of response.users) {
        if (socketId === socket.id) continue;
        await this.getOrCreatePeer(socketId, socket.id > socketId);
      }

      this.notify();
    });
  }

  private async getOrCreatePeer(remoteSocketId: string, initiateOffer: boolean): Promise<PeerData> {
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
      const stream = event.streams[0] || new MediaStream([event.track]);
      peer.stream = stream;
      peer.hasRtcAudio = true;
      this.attachRemoteAudio(remoteSocketId, peer, stream);
      this.notify();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(remoteSocketId);
        this.notify();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce();
          if (pc.signalingState === 'stable') {
            void this.makeOffer(peer, remoteSocketId);
          }
        } catch (error) {
          console.warn('[Voice] ICE restart error:', error);
        }
      }
    };

    if (initiateOffer) {
      await this.makeOffer(peer, remoteSocketId);
    }

    return peer;
  }

  private attachRemoteAudio(socketId: string, peer: PeerData, stream: MediaStream): void {
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
    audio.muted = this.isDeafened || this.locallyMutedRemotePeers.has(socketId);

    audio.play().catch(() => {});
  }

  private async makeOffer(peer: PeerData, remoteSocketId: string): Promise<void> {
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

  /**
   * Sets up real-time audio volume detection AND continuous PCM audio chunk streaming.
   * Transmits audio over WebSocket relay so voice NEVER drops even behind severe firewalls.
   */
  private setupAudioProcessing(stream: MediaStream): void {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.micContext = new AudioCtxClass();
      this.micSource = this.micContext.createMediaStreamSource(stream);
      this.micAnalyser = this.micContext.createAnalyser();

      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.3;

      // Connect to volume analyser
      this.micSource.connect(this.micAnalyser);

      // Connect to ScriptProcessor to stream PCM audio packets
      const bufferSize = 2048;
      this.micProcessor = this.micContext.createScriptProcessor(bufferSize, 1, 1);

      this.micProcessor.onaudioprocess = (event) => {
        if (!this.isConnected || this.isMicMuted || !this.currentRoomCode) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);

        // Convert Float32Array to 16-bit PCM Int16Array
        const int16Array = new Int16Array(inputData.length);
        let hasSound = false;

        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]));
          int16Array[i] = sample < 0 ? sample * 32768 : sample * 32767;
          if (Math.abs(sample) > 0.02) {
            hasSound = true;
          }
        }

        // Only emit packet if voice is active to save bandwidth
        if (hasSound || this.isLocallySpeaking) {
          const socket = getSocket();
          socket.emit('voice:audio-chunk', {
            roomCode: this.currentRoomCode,
            audio: int16Array.buffer,
            sampleRate: this.micContext?.sampleRate || 24000,
          });
        }
      };

      this.micSource.connect(this.micProcessor);
      // Connect to destination to ensure onaudioprocess continues in all browsers
      const dummyGain = this.micContext.createGain();
      dummyGain.gain.value = 0; // Mute dummy to avoid feedback
      this.micProcessor.connect(dummyGain);
      dummyGain.connect(this.micContext.destination);

      const freqData = new Uint8Array(this.micAnalyser.frequencyBinCount);
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

        this.micAnalyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }

        const average = sum / freqData.length;
        const speaking = average > 8; // Sensitive threshold for speaking

        if (speaking !== wasSpeaking) {
          wasSpeaking = speaking;
          this.isLocallySpeaking = speaking;

          getSocket().emit('voice:speaking', { isSpeaking: speaking });
          this.notify();
        }
      }, 100);
    } catch (error) {
      console.warn('[Voice] Audio processing setup error:', error);
    }
  }

  private removePeer(socketId: string): void {
    const peer = this.peers.get(socketId);
    if (peer) {
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
    }

    const timer = this.peerSpeechTimers.get(socketId);
    if (timer) clearTimeout(timer);
    this.peerSpeechTimers.delete(socketId);

    const gain = this.peerGains.get(socketId);
    if (gain) {
      try {
        gain.disconnect();
      } catch {}
      this.peerGains.delete(socketId);
    }

    this.peers.delete(socketId);
    this.pendingCandidates.delete(socketId);
    this.speakingPeers.delete(socketId);
    this.mutedPeers.delete(socketId);
    this.locallyMutedRemotePeers.delete(socketId);
    this.peerNextPlayTime.delete(socketId);
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
    this.peerNextPlayTime.clear();
    this.notify();
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

  private setMicMuted(muted: boolean): void {
    if (!this.localStream || this.isMicMuted === muted) return;

    this.isMicMuted = muted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });

    getSocket().emit('voice:mute-status', { isMuted: muted });

    if (muted && this.isLocallySpeaking) {
      this.isLocallySpeaking = false;
      getSocket().emit('voice:speaking', { isSpeaking: false });
    }
  }

  public toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;

    // Mute all remote audio tags
    this.peers.forEach((peer, socketId) => {
      if (peer.audioElement) {
        peer.audioElement.muted = this.isDeafened || this.locallyMutedRemotePeers.has(socketId);
      }
    });

    // Mute Web Audio master gain
    if (this.masterGain) {
      this.masterGain.gain.value = this.isDeafened ? 0 : 1.6;
    }

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
    const currentlyMuted = this.locallyMutedRemotePeers.has(remoteSocketId);

    if (currentlyMuted) {
      this.locallyMutedRemotePeers.delete(remoteSocketId);
    } else {
      this.locallyMutedRemotePeers.add(remoteSocketId);
    }

    const peer = this.peers.get(remoteSocketId);
    if (peer?.audioElement) {
      peer.audioElement.muted = this.isDeafened || !currentlyMuted;
    }

    const gain = this.peerGains.get(remoteSocketId);
    if (gain) {
      gain.gain.value = !currentlyMuted ? 0 : 1.5;
    }

    this.notify();
    return !currentlyMuted;
  }

  public stopVoice(): void {
    if (this.speechCheckInterval) {
      clearInterval(this.speechCheckInterval);
      this.speechCheckInterval = null;
    }

    if (this.micProcessor) {
      try {
        this.micProcessor.disconnect();
      } catch {}
      this.micProcessor = null;
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
    this.peerNextPlayTime.clear();

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