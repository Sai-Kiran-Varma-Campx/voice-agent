/**
 * useGeminiSession Hook
 * Manages the complete Gemini Live session lifecycle
 */

import { useState, useRef, useCallback } from 'react';
import { WebSocketService } from '../services/websocketService';
import { AudioProcessor, AudioPlayer } from '../services/audioProcessor';
import { ConnectionState } from '../types';

export const useGeminiSession = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const websocketService = useRef(new WebSocketService());
  const audioProcessor = useRef(new AudioProcessor());
  const audioPlayer = useRef(new AudioPlayer());

  const startSession = useCallback(async () => {
    try {
      setError(null);
      setConnectionState('connecting');

      // Setup callbacks before connecting
      websocketService.current.onAudioReceived = (audioData) => {
        audioPlayer.current.addAudioChunk(audioData);
        setConnectionState('speaking');
      };

      websocketService.current.onConnected = () => {
        console.log('WebSocket connected');
        setConnectionState('connected');
      };

      websocketService.current.onDisconnected = () => {
        console.log('WebSocket disconnected');
        setConnectionState('disconnected');
      };

      websocketService.current.onError = (error) => {
        console.error('WebSocket error:', error);
        setError(error.message);
        setConnectionState('disconnected');
      };

      // Connect to backend WebSocket
      const id = await websocketService.current.connect();
      setSessionId(id);

      // Start capturing audio from microphone with automatic silence detection
      const stream = await audioProcessor.current.startCapture(
        (chunk) => {
          websocketService.current.sendAudioChunk(chunk);
        },
        // Callback when silence is detected - automatically send end-of-turn
        async () => {
          console.log('Auto-sending end-of-turn after silence detected');
          await websocketService.current.sendEndOfTurn();
        }
      );

      setMediaStream(stream);
      setAudioContext(audioProcessor.current.getAudioContext());

      console.log('Session started successfully with auto voice detection');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setConnectionState('disconnected');
      console.error('Error starting session:', err);
    }
  }, []);

  const startListening = useCallback(() => {
    if (connectionState === 'connected') {
      setConnectionState('listening');
    }
  }, [connectionState]);

  const stopListening = useCallback(() => {
    if (connectionState === 'listening') {
      setConnectionState('connected');
    }
  }, [connectionState]);

  const interrupt = useCallback(async () => {
    try {
      // Interrupt audio playback
      audioPlayer.current.interrupt();

      // Send interrupt signal to backend
      await websocketService.current.interrupt();

      // Return to listening state
      setConnectionState('listening');

      console.log('Interrupted AI speech');
    } catch (err) {
      console.error('Error interrupting:', err);
    }
  }, []);

  const endSession = useCallback(async () => {
    try {
      // Stop audio capture
      audioProcessor.current.stopCapture();

      // Close audio player
      audioPlayer.current.close();

      // Close WebSocket connection
      websocketService.current.close();

      // Reset state
      setSessionId(null);
      setConnectionState('disconnected');
      setMediaStream(null);
      setAudioContext(null);
      setError(null);

      console.log('Session ended');
    } catch (err) {
      console.error('Error ending session:', err);
    }
  }, []);

  const sendEndOfTurn = useCallback(async () => {
    try {
      await websocketService.current.sendEndOfTurn();
      setConnectionState('listening');
      console.log('End-of-turn signal sent - waiting for AI response');
    } catch (err) {
      console.error('Error sending end-of-turn:', err);
    }
  }, []);

  return {
    sessionId,
    connectionState,
    mediaStream,
    audioContext,
    error,
    startSession,
    startListening,
    stopListening,
    interrupt,
    endSession,
    sendEndOfTurn,
    isConnected: connectionState !== 'disconnected',
    isListening: connectionState === 'listening',
    isSpeaking: connectionState === 'speaking',
  };
};
