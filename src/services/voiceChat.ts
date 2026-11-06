
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
  private peers = new Map<string, PeerData>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  private speakingPeers = new Set<string>();
  private mutedPeers = new Set<string>();
  private locallyMutedRemotePeers = new Set<string>();

  private isMicMuted = false;
  private isDeafened = false;
  private isConnected = false;
  private isLocallySpeaking = false;

  private micWasMutedBeforeDeafen = false;
  private currentRoomCode: string | null = null;

  private playbackContext: AudioContext | null = null;
  private micContext: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private speechCheckInterval: ReturnType<typeof setInterval> | null = null;

  private listeners = new Set<VoiceEventCallback>();

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },

      // Configure a real TURN server using backend-provided credentials.
      // Never expose permanent TURN credentials in frontend code.
      // {
      //   urls: 'turn:YOUR_TURN_SERVER:3478',
      //   username: 'TEMP_USERNAME',
      //   credential: 'TEMP_PASSWORD',
      // },
    ],
    iceCandidatePoolSize: 10,
  };

  constructor() {
    this.setupSignalingListeners();
    this.setupUserUnlockHandlers();
  }

  private getPlaybackContext(): AudioContext {
    if (
      !this.playbackContext ||
      this.playbackContext.state === 'closed'
    ) {
      const AudioCtx =
        window.AudioContext ||
        (window as any).webkitAudioContext;

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
      if (this.playbackContext?.state === 'suspended') {
        this.playbackContext.resume().catch(() => {});
      }

      if (this.micContext?.state === 'suspended') {
        this.micContext.resume().catch(() => {});
      }

      this.peers.forEach((peer) => {
        if (peer.audioElement?.paused && peer.audioElement.srcObject) {
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
      } catch (error) {
        console.warn('[Voice] Listener error:', error);
      }
    });
  }

  private setupSignalingListeners() {
    const socket = getSocket();

    socket.on(
      'voice:user-joined',
      async ({ socketId }: { socketId: string }) => {
        if (!this.isConnected || !socket.id || socketId === socket.id) {
          return;
        }

        console.log('[Voice] Peer joined:', socketId);

        const isInitiator = socket.id > socketId;

        await this.getOrCreatePeer(socketId, isInitiator);
      }
    );

    socket.on(
      'voice:signal',
      async ({
        from,
        signal,
      }: {
        from: string;
        signal: any;
      }) => {
        if (!this.isConnected || from === socket.id) return;

        const peer = await this.getOrCreatePeer(from, false);
        const pc = peer.pc;

        if (pc.connectionState === 'closed') return;

        try {
          if (signal.type === 'offer') {
            const offerCollision =
              peer.makingOffer ||
              pc.signalingState !== 'stable';

            peer.ignoreOffer =
              !peer.isPolite && offerCollision;

            if (peer.ignoreOffer) {
              console.log('[Voice] Ignoring colliding offer:', from);
              return;
            }

            if (offerCollision && peer.isPolite) {
              await pc.setLocalDescription({
                type: 'rollback',
              });
            }

            await pc.setRemoteDescription(
              new RTCSessionDescription(signal)
            );

            await this.drainPendingCandidates(from, pc);

            const answer = await pc.createAnswer();

            await pc.setLocalDescription(answer);

            socket.emit('voice:signal', {
              to: from,
              signal: pc.localDescription,
            });

          } else if (signal.type === 'answer') {

            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(
                new RTCSessionDescription(signal)
              );

              await this.drainPendingCandidates(from, pc);
            }

          } else if (signal.candidate) {

            if (peer.ignoreOffer) return;

            if (pc.remoteDescription) {
              await pc.addIceCandidate(
                new RTCIceCandidate(signal)
              );
            } else {
              const queue =
                this.pendingCandidates.get(from) || [];

              queue.push(signal);

              this.pendingCandidates.set(from, queue);
            }
          }

        } catch (error) {
          console.warn('[Voice] Signal processing error:', error);
        }
      }
    );

    socket.on(
      'voice:mute-status',
      ({
        socketId,
        isMuted,
      }: {
        socketId: string;
        isMuted: boolean;
      }) => {
        if (isMuted) {
          this.mutedPeers.add(socketId);
        } else {
          this.mutedPeers.delete(socketId);
        }

        this.notify();
      }
    );

    socket.on(
      'voice:speaking',
      ({
        socketId,
        isSpeaking,
      }: {
        socketId: string;
        isSpeaking: boolean;
      }) => {
        if (isSpeaking) {
          this.speakingPeers.add(socketId);
        } else {
          this.speakingPeers.delete(socketId);
        }

        this.notify();
      }
    );

    socket.on(
      'voice:user-left',
      ({ socketId }: { socketId: string }) => {
        this.removePeer(socketId);
        this.notify();
      }
    );

    socket.on('disconnect', () => {
      this.handleSocketDisconnect();
    });

    socket.on('connect', () => {
      if (this.isConnected && this.currentRoomCode) {
        this.rejoinAfterReconnect();
      }
    });
  }

  private async rejoinAfterReconnect() {
    if (!this.currentRoomCode || !this.localStream) return;

    const socket = getSocket();

    socket.emit(
      'voice:join',
      { roomCode: this.currentRoomCode },
      async (res: { users?: string[] }) => {
        for (const socketId of res?.users || []) {
          if (socketId !== socket.id) {
            await this.getOrCreatePeer(
              socketId,
              (socket.id || '') > socketId
            );
          }
        }

        this.notify();
      }
    );
  }

  private handleSocketDisconnect() {
    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch {}
    });

    this.peers.clear();
    this.pendingCandidates.clear();
    this.speakingPeers.clear();

    this.notify();
  }

  private async drainPendingCandidates(
    socketId: string,
    pc: RTCPeerConnection
  ) {
    const queue = this.pendingCandidates.get(socketId);

    if (!queue?.length) return;

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.warn('[Voice] ICE candidate warning:', error);
      }
    }

    this.pendingCandidates.delete(socketId);
  }

  public async startVoice(roomCode: string): Promise<boolean> {
    if (this.isConnected && this.currentRoomCode === roomCode) {
      return true;
    }

    if (this.isConnected && this.currentRoomCode !== roomCode) {
      this.stopVoice();
    }

    this.currentRoomCode = roomCode;

    try {
      this.getPlaybackContext();

      if (!this.localStream) {
        this.localStream =
          await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });

        this.setupVolumeDetection(this.localStream);
      }

      this.isConnected = true;
      this.isMicMuted = false;
      this.isDeafened = false;

      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      const socket = getSocket();

      socket.emit(
        'voice:join',
        { roomCode },
        async (res: { users?: string[] }) => {
          console.log('[Voice] Joined voice room:', res?.users);

          for (const socketId of res?.users || []) {
            if (socketId !== socket.id) {
              await this.getOrCreatePeer(
                socketId,
                (socket.id || '') > socketId
              );
            }
          }

          this.notify();
        }
      );

      this.notify();
      return true;

    } catch (error) {
      console.warn('[Voice] Failed to start:', error);

      this.isConnected = false;
      this.currentRoomCode = null;

      this.notify();
      return false;
    }
  }

  private async getOrCreatePeer(
    remoteSocketId: string,
    initiateOffer: boolean
  ): Promise<PeerData> {

    let peer = this.peers.get(remoteSocketId);

    if (peer) {
      if (
        initiateOffer &&
        peer.pc.signalingState === 'stable'
      ) {
        await this.makeOffer(peer, remoteSocketId);
      }

      return peer;
    }

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

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('voice:signal', {
          to: remoteSocketId,
          signal: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[Voice] Remote audio received:', remoteSocketId);

      const remoteStream =
        event.streams[0] ||
        new MediaStream([event.track]);

      peer!.stream = remoteStream;

      // Prevent duplicate playback pipelines.
      if (peer!.sourceNode) {
        try {
          peer!.sourceNode.disconnect();
        } catch {}
      }

      if (peer!.gainNode) {
        try {
          peer!.gainNode.disconnect();
        } catch {}
      }

      // Web Audio API is the primary playback method.
      try {
        const audioCtx = this.getPlaybackContext();

        const sourceNode =
          audioCtx.createMediaStreamSource(remoteStream);

        const gainNode = audioCtx.createGain();

        gainNode.gain.value =
          this.isDeafened ||
          this.locallyMutedRemotePeers.has(remoteSocketId)
            ? 0
            : 1;

        sourceNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        peer!.sourceNode = sourceNode;
        peer!.gainNode = gainNode;

        // Remove any previous fallback audio element.
        if (peer!.audioElement) {
          peer!.audioElement.pause();
          peer!.audioElement.srcObject = null;
          peer!.audioElement.remove();
          peer!.audioElement = undefined;
        }

      } catch (error) {
        console.warn('[Voice] Web Audio failed:', error);

        // HTML audio fallback ONLY if Web Audio fails.
        let audio = peer!.audioElement;

        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.playsInline = true;
          audio.style.display = 'none';

          document.body.appendChild(audio);

          peer!.audioElement = audio;
        }

        audio.srcObject = remoteStream;

        audio.muted =
          this.isDeafened ||
          this.locallyMutedRemotePeers.has(remoteSocketId);

        audio.play().catch((err) => {
          console.warn('[Voice] Audio playback blocked:', err);
        });
      }

      this.notify();
    };

    pc.onconnectionstatechange = () => {
      console.log(
        '[Voice] Peer connection:',
        remoteSocketId,
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
        '[Voice] ICE state:',
        remoteSocketId,
        pc.iceConnectionState
      );
    };

    if (initiateOffer) {
      await this.makeOffer(peer, remoteSocketId);
    }

    return peer;
  }

  private async makeOffer(
    peer: PeerData,
    remoteSocketId: string
  ) {
    try {
      if (peer.pc.signalingState !== 'stable') return;

      peer.makingOffer = true;

      const offer = await peer.pc.createOffer();

      if (peer.pc.signalingState !== 'stable') return;

      await peer.pc.setLocalDescription(offer);

      getSocket().emit('voice:signal', {
        to: remoteSocketId,
        signal: peer.pc.localDescription,
      });

    } catch (error) {
      console.warn('[Voice] Offer error:', error);

    } finally {
      peer.makingOffer = false;
    }
  }

  private removePeer(socketId: string) {
    const peer = this.peers.get(socketId);

    if (peer) {
      try {
        peer.pc.ontrack = null;
        peer.pc.onicecandidate = null;
        peer.pc.close();
      } catch {}

      try {
        peer.sourceNode?.disconnect();
        peer.gainNode?.disconnect();
      } catch {}

      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
        peer.audioElement.remove();
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
      const AudioCtx =
        window.AudioContext ||
        (window as any).webkitAudioContext;

      if (!AudioCtx) return;

      this.micContext = new AudioCtx();

      this.micSource =
        this.micContext.createMediaStreamSource(stream);

      this.micAnalyser = this.micContext.createAnalyser();

      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.4;

      this.micSource.connect(this.micAnalyser);

      const buffer = new Uint8Array(
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

        this.micAnalyser.getByteFrequencyData(buffer);

        let sum = 0;

        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }

        const average = sum / buffer.length;

        const isSpeaking = average > 10;

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          this.isLocallySpeaking = isSpeaking;

          getSocket().emit('voice:speaking', {
            isSpeaking,
          });

          this.notify();
        }
      }, 100);

    } catch (error) {
      console.warn('[Voice] Volume detection error:', error);
    }
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

  public toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;

    this.peers.forEach((peer, socketId) => {
      const muted =
        this.isDeafened ||
        this.locallyMutedRemotePeers.has(socketId);

      if (peer.gainNode) {
        peer.gainNode.gain.value = muted ? 0 : 1;
      }

      if (peer.audioElement) {
        peer.audioElement.muted = muted;
      }
    });

    if (this.isDeafened) {
      this.micWasMutedBeforeDeafen = this.isMicMuted;

      if (!this.isMicMuted) {
        this.setMicMuted(true);
      }
    } else {
      this.setMicMuted(this.micWasMutedBeforeDeafen);
    }

    this.notify();

    return this.isDeafened;
  }

  private setMicMuted(muted: boolean) {
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

  public toggleMutePeerLocally(
    remoteSocketId: string
  ): boolean {

    const isMuted =
      this.locallyMutedRemotePeers.has(remoteSocketId);

    if (isMuted) {
      this.locallyMutedRemotePeers.delete(remoteSocketId);
    } else {
      this.locallyMutedRemotePeers.add(remoteSocketId);
    }

    const peer = this.peers.get(remoteSocketId);

    if (peer) {
      const mutedNow =
        this.isDeafened ||
        this.locallyMutedRemotePeers.has(remoteSocketId);

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

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {}

      this.micSource = null;
    }

    if (this.micContext && this.micContext.state !== 'closed') {
      this.micContext.close().catch(() => {});
      this.micContext = null;
    }

    this.micAnalyser = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });

      this.localStream = null;
    }

    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch {}

      try {
        peer.sourceNode?.disconnect();
        peer.gainNode?.disconnect();
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
