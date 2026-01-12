/**
 * TypeScript type definitions for the S2S application
 */

export interface SessionInfo {
  sessionId: string | null;
  isConnected: boolean;
  isListening: boolean;
}

export interface AudioConfig {
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface SessionCreateResponse {
  session_id: string;
}

export interface SDPOffer {
  sdp: string;
  type: string;
}

export interface SDPAnswer {
  sdp: string;
  type: string;
}

export interface ICECandidate {
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
  address?: string;
  port?: number;
  priority?: number;
  protocol?: string;
  type?: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking';
