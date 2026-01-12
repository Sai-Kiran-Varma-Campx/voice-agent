/**
 * WebSocket Service for Frontend-Backend Communication
 * Handles bidirectional audio streaming via WebSocket
 */

export class WebSocketService {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  public onAudioReceived: ((audioData: Uint8Array) => void) | null = null;
  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor() {}

  /**
   * Connect to backend WebSocket server
   */
  async connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Connect to WebSocket endpoint
        const wsUrl = 'ws://localhost:8000/ws';
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        console.log('Connecting to WebSocket:', wsUrl);

        // Handle connection open
        this.ws.onopen = () => {
          console.log('WebSocket connected');
          if (this.onConnected) {
            this.onConnected();
          }
        };

        // Handle incoming messages
        this.ws.onmessage = (event) => {
          // Text messages (JSON control messages)
          if (typeof event.data === 'string') {
            try {
              const message = JSON.parse(event.data);

              if (message.type === 'session_id') {
                this.sessionId = message.session_id;
                console.log('Session ID received:', this.sessionId);
                if (this.sessionId) {
                  resolve(this.sessionId);
                } else {
                  reject(new Error('Session ID is null'));
                }
              } else if (message.type === 'interrupted') {
                console.log('AI interrupted successfully');
              } else if (message.type === 'pong') {
                console.log('Pong received');
              }
            } catch (e) {
              console.error('Failed to parse JSON message:', e);
            }
          }
          // Binary messages (audio data)
          else if (event.data instanceof ArrayBuffer) {
            const audioData = new Uint8Array(event.data);
            console.log(`Received audio chunk: ${audioData.length} bytes`);

            if (this.onAudioReceived) {
              this.onAudioReceived(audioData);
            }
          }
        };

        // Handle errors
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          const err = new Error('WebSocket connection error');
          if (this.onError) {
            this.onError(err);
          }
          reject(err);
        };

        // Handle connection close
        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          if (this.onDisconnected) {
            this.onDisconnected();
          }
        };

      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Send audio chunk to backend (16kHz mono PCM16)
   */
  sendAudioChunk(audioData: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready, cannot send audio');
      return;
    }

    try {
      // Send as binary message
      this.ws.send(audioData.buffer);
    } catch (error) {
      console.error('Error sending audio chunk:', error);
    }
  }

  /**
   * Send interrupt command to stop AI speech
   */
  async interrupt(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    try {
      const message = JSON.stringify({ type: 'interrupt' });
      this.ws.send(message);
      console.log('Interrupt command sent');
    } catch (error) {
      console.error('Error sending interrupt:', error);
      throw error;
    }
  }

  /**
   * Send end-of-turn signal to indicate user finished speaking
   * This triggers Gemini to generate a response
   */
  async sendEndOfTurn(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    try {
      const message = JSON.stringify({ type: 'end_of_turn' });
      this.ws.send(message);
      console.log('End-of-turn signal sent');
    } catch (error) {
      console.error('Error sending end-of-turn:', error);
      throw error;
    }
  }

  /**
   * Send ping to keep connection alive
   */
  ping(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const message = JSON.stringify({ type: 'ping' });
      this.ws.send(message);
    } catch (error) {
      console.error('Error sending ping:', error);
    }
  }

  /**
   * Close WebSocket connection
   */
  close(): void {
    if (this.ws) {
      console.log('Closing WebSocket connection');
      this.ws.close();
      this.ws = null;
      this.sessionId = null;
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
