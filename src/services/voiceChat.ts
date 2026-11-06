/**
 * WebRTC mesh voice chat for UNO Multiplayer.
 *
 * Uses one remote-audio playback path (HTMLAudioElement) to avoid duplicate audio.
 * Uses WebRTC for voice transport. MediaRecorder chunks are intentionally not used:
 * 250 ms MediaRecorder blobs are not guaranteed to be independently decodable.
 *
 * IMPORTANT:
 * STUN-only connectivity is not reliable on every mobile/carrier network.
 * Configure a TURN server with short-lived credentials for production.
 */

import { getSocket } from './socket.ts';

type VoiceEventCallback = () => void;

interface PeerData {
  pc: RTCPeerConnection;
  audioElement?: HTMLAudioElement;
  stream?: MediaStream;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isPolite: boolean;
  signalChain: Promise<void>;
}

interface VoiceJoinResponse {
  users?: string[];
  error?: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

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

  private micContext: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private speechCheckInterval: ReturnType<typeof setInterval> | null = null;

  private unlockInstalled = false;

  private rtcConfig: RTCConfiguration = {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle',
  };

  constructor() {
    this.setupSignalingListeners();
    this.setupUserUnlockHandlers();
  }

  public subscribe(cb: VoiceEventCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (error) {
        console.warn('[Voice] Listener error:', error);
      }
    });
  }

  private setupUserUnlockHandlers(): void {
    if (typeof window === 'undefined' || this.unlockInstalled) return;
    this.unlockInstalled = true;

    // Call play() synchronously inside the user gesture. Do not await anything first:
    // mobile browsers may otherwise consider the user-activation window expired.
    const unlock = () => {
      this.peers.forEach((peer) => {