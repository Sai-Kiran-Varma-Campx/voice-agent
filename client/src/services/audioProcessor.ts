/**
 * Audio Processor
 * Handles microphone capture (16kHz PCM) and audio playback (24kHz PCM)
 */

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private silenceThreshold: number = 0.02; // Increased threshold to reduce noise triggering
  private silenceDuration: number = 1500; // 1.5 seconds of silence triggers end-of-turn
  private lastSoundTime: number = Date.now();
  private isSpeaking: boolean = false;
  private silenceCheckInterval: NodeJS.Timeout | null = null;
  private onSilenceDetected: (() => void) | null = null;
  private noiseFloor: number = 0.005; // Baseline noise level
  private consecutiveSoundFrames: number = 0; // Counter for consecutive sound frames
  private minSoundFrames: number = 3; // Require 3 consecutive frames to confirm speech
  private consecutiveSilenceFrames: number = 0; // Counter for consecutive silence frames
  private minSilenceFrames: number = 3; // Require 3 consecutive frames to confirm silence

  async startCapture(onAudioData: (chunk: Uint8Array) => void, onSilence?: () => void): Promise<MediaStream> {
    try {
      // Reset counters
      this.consecutiveSoundFrames = 0;
      this.consecutiveSilenceFrames = 0;
      this.isSpeaking = false;

      // Store silence callback
      this.onSilenceDetected = onSilence || null;
      this.lastSoundTime = Date.now();

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio context at 16kHz
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Use ScriptProcessorNode for audio processing
      // Buffer size: 4096 samples (~256ms at 16kHz)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // Calculate RMS (Root Mean Square) amplitude - more accurate than max amplitude
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rmsAmplitude = Math.sqrt(sumSquares / inputData.length);

        // Voice Activity Detection with noise gating
        // Use RMS amplitude and require consecutive frames to confirm speech/silence
        const isLoudEnough = rmsAmplitude > this.silenceThreshold;
        const isAboveNoiseFloor = rmsAmplitude > this.noiseFloor;

        if (isLoudEnough && isAboveNoiseFloor) {
          // Potential speech detected
          this.consecutiveSoundFrames++;
          this.consecutiveSilenceFrames = 0;

          // Only mark as speaking after consecutive sound frames (reduces false positives)
          if (this.consecutiveSoundFrames >= this.minSoundFrames) {
            this.lastSoundTime = Date.now();
            if (!this.isSpeaking) {
              this.isSpeaking = true;
              console.log('🎤 Voice detected - user started speaking (RMS:', rmsAmplitude.toFixed(4), ')');
            }
          }
        } else {
          // Potential silence detected
          this.consecutiveSilenceFrames++;
          this.consecutiveSoundFrames = 0;

          // Only mark as silent after consecutive silence frames (reduces false negatives)
          if (this.consecutiveSilenceFrames >= this.minSilenceFrames && this.isSpeaking) {
            // User might have stopped speaking, but we'll wait for the full silence duration
            // The silence check interval will handle the actual end-of-turn trigger
          }
        }

        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          // Clamp to [-1, 1] range
          const s = Math.max(-1, Math.min(1, inputData[i]));
          // Convert to 16-bit PCM
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send PCM16 data to backend
        onAudioData(new Uint8Array(pcm16.buffer));
      };

      // Connect nodes
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Start silence detection interval
      this.startSilenceDetection();

      console.log('Audio capture started (16kHz mono PCM16) with auto silence detection');
      return this.mediaStream;
    } catch (error) {
      console.error('Error starting audio capture:', error);
      throw error;
    }
  }

  private startSilenceDetection(): void {
    console.log('🎧 Silence detection started with noise gating');
    console.log(`   Silence threshold: ${this.silenceThreshold.toFixed(4)}`);
    console.log(`   Noise floor: ${this.noiseFloor.toFixed(4)}`);
    console.log(`   Silence duration: ${this.silenceDuration}ms`);

    // Check for silence every 100ms
    this.silenceCheckInterval = setInterval(() => {
      if (this.isSpeaking) {
        const silenceDurationMs = Date.now() - this.lastSoundTime;

        if (silenceDurationMs > this.silenceDuration) {
          // User stopped speaking - trigger end of turn
          this.isSpeaking = false;
          this.consecutiveSoundFrames = 0;
          this.consecutiveSilenceFrames = 0;

          console.log(`🔕 Silence detected (${silenceDurationMs}ms) - triggering end-of-turn`);

          if (this.onSilenceDetected) {
            console.log('✅ Calling onSilenceDetected callback...');
            this.onSilenceDetected();
          } else {
            console.warn('⚠️ No onSilenceDetected callback registered!');
          }
        }
      }
    }, 100);
  }

  private stopSilenceDetection(): void {
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
  }

  stopCapture(): void {
    try {
      // Stop silence detection
      this.stopSilenceDetection();

      // Disconnect audio processing
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }

      if (this.source) {
        this.source.disconnect();
        this.source = null;
      }

      // Stop media stream tracks
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }

      // Close audio context
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }

      console.log('Audio capture stopped');
    } catch (error) {
      console.error('Error stopping audio capture:', error);
    }
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Adjust sensitivity for noisy environments
   * @param level - 'low' (noisy), 'medium' (normal), 'high' (quiet)
   */
  setSensitivity(level: 'low' | 'medium' | 'high'): void {
    switch (level) {
      case 'low': // Noisy environment - higher threshold
        this.silenceThreshold = 0.05;
        this.noiseFloor = 0.02;
        this.minSoundFrames = 5;
        console.log('🔊 Sensitivity: LOW (for noisy environments)');
        break;
      case 'medium': // Normal environment
        this.silenceThreshold = 0.02;
        this.noiseFloor = 0.005;
        this.minSoundFrames = 3;
        console.log('🔉 Sensitivity: MEDIUM (default)');
        break;
      case 'high': // Quiet environment - lower threshold
        this.silenceThreshold = 0.01;
        this.noiseFloor = 0.003;
        this.minSoundFrames = 2;
        console.log('🔈 Sensitivity: HIGH (for quiet environments)');
        break;
    }
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor() {
    // AudioContext will be created on first audio chunk to avoid Chrome autoplay policy
    // (AudioContext must be created after user interaction)
  }

  private ensureAudioContext(): void {
    if (!this.audioContext) {
      // Create audio context at 24kHz (Gemini output sample rate)
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      console.log('AudioContext created for playback (24kHz)');
    }
  }

  async addAudioChunk(pcm24k: Uint8Array): Promise<void> {
    try {
      // Ensure AudioContext is created (lazy initialization)
      this.ensureAudioContext();

      if (!this.audioContext) {
        console.warn('AudioContext not initialized');
        return;
      }

      // Convert PCM16 24kHz to AudioBuffer
      const int16Array = new Int16Array(
        pcm24k.buffer,
        pcm24k.byteOffset,
        pcm24k.byteLength / 2
      );
      const float32Array = new Float32Array(int16Array.length);

      // Convert Int16 to Float32 [-1, 1]
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] =
          int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
      }

      // Create AudioBuffer
      const audioBuffer = this.audioContext.createBuffer(
        1,
        float32Array.length,
        24000
      );
      audioBuffer.copyToChannel(float32Array, 0);

      // Add to queue
      this.audioQueue.push(audioBuffer);

      // Start playing if not already playing
      if (!this.isPlaying) {
        this.playQueue();
      }
    } catch (error) {
      console.error('Error adding audio chunk:', error);
    }
  }

  private async playQueue(): Promise<void> {
    if (!this.audioContext) return;

    this.isPlaying = true;

    while (this.audioQueue.length > 0) {
      const buffer = this.audioQueue.shift()!;
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);

      this.currentSource = source;

      await new Promise<void>((resolve) => {
        source.onended = () => {
          this.currentSource = null;
          resolve();
        };
        source.start();
      });
    }

    this.isPlaying = false;
  }

  interrupt(): void {
    try {
      // Stop current playback
      if (this.currentSource) {
        this.currentSource.stop();
        this.currentSource.disconnect();
        this.currentSource = null;
      }

      // Clear queue
      this.audioQueue = [];

      // Reset audio context
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }

      this.isPlaying = false;

      console.log('Audio playback interrupted');
    } catch (error) {
      console.error('Error interrupting audio:', error);
    }
  }

  close(): void {
    this.interrupt();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }
}
