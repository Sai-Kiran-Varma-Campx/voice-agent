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
  private silenceDuration: number = 2500; // 2.5 seconds of silence triggers end-of-turn (updated from 1.5s)
  private lastSoundTime: number = Date.now();
  private isSpeaking: boolean = false;
  private silenceCheckInterval: NodeJS.Timeout | null = null;
  private onSilenceDetected: (() => void) | null = null;
  private noiseFloor: number = 0.005; // Baseline noise level
  private consecutiveSoundFrames: number = 0; // Counter for consecutive sound frames
  private minSoundFrames: number = 3; // Require 3 consecutive frames to confirm speech
  private consecutiveSilenceFrames: number = 0; // Counter for consecutive silence frames
  private minSilenceFrames: number = 3; // Require 3 consecutive frames to confirm silence

  // Noise Reduction properties
  private noiseReductionEnabled: boolean = true; // Enabled by default
  private noiseReductionStrength: number = 0.7; // 70% reduction by default
  private noiseProfile: Float32Array | null = null; // Average noise amplitude profile
  private calibrationSamples: Float32Array[] = []; // Temporary storage for calibration
  private readonly NOISE_PROFILE_FRAMES = 10; // Calibrate over 10 frames (~640ms)
  private isCalibrated: boolean = false;
  private frameCount: number = 0;

  async startCapture(onAudioData: (chunk: Uint8Array) => void, onSilence?: () => void): Promise<MediaStream> {
    try {
      // Reset counters
      this.consecutiveSoundFrames = 0;
      this.consecutiveSilenceFrames = 0;
      this.isSpeaking = false;
      this.frameCount = 0;
      this.isCalibrated = false;
      this.calibrationSamples = [];

      // Store silence callback
      this.onSilenceDetected = onSilence || null;
      this.lastSoundTime = Date.now();

      console.log('🎙️ Starting audio capture with noise reduction');
      console.log(`   Noise reduction: ${this.noiseReductionEnabled ? 'ENABLED' : 'DISABLED'}`);
      console.log(`   Reduction strength: ${(this.noiseReductionStrength * 100).toFixed(0)}%`);
      console.log(`   Calibration frames: ${this.NOISE_PROFILE_FRAMES} (~${(this.NOISE_PROFILE_FRAMES * 256).toFixed(0)}ms)`);

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
        this.frameCount++;

        // === PHASE 1: Noise Calibration (First N frames) ===
        if (!this.isCalibrated && this.noiseReductionEnabled) {
          if (this.calibrationSamples.length < this.NOISE_PROFILE_FRAMES) {
            // Store copy of frame for calibration
            const frameCopy = new Float32Array(inputData);
            this.calibrationSamples.push(frameCopy);

            if (this.calibrationSamples.length === 1) {
              console.log('🔇 Noise calibration started... (stay quiet for optimal results)');
            }

            if (this.calibrationSamples.length === this.NOISE_PROFILE_FRAMES) {
              this.buildNoiseProfile();
              console.log(`🔇 Noise profile calibrated from ${this.NOISE_PROFILE_FRAMES} frames`);
              console.log(`   Average noise level: ${this.calculateRMS(this.noiseProfile!).toFixed(6)}`);
            }
          }
        }

        // === PHASE 2: Apply Noise Reduction ===
        let processedData = inputData;
        if (this.isCalibrated && this.noiseReductionEnabled && this.noiseProfile) {
          processedData = this.applyNoiseReduction(inputData);
        }

        // === PHASE 3: Voice Activity Detection ===
        // Calculate RMS (Root Mean Square) amplitude - more accurate than max amplitude
        let sumSquares = 0;
        for (let i = 0; i < processedData.length; i++) {
          sumSquares += processedData[i] * processedData[i];
        }
        const rmsAmplitude = Math.sqrt(sumSquares / processedData.length);

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

        // === PHASE 4: PCM16 Conversion ===
        // Convert Float32Array to Int16Array (PCM16) using processed data
        const pcm16 = new Int16Array(processedData.length);
        for (let i = 0; i < processedData.length; i++) {
          // Clamp to [-1, 1] range
          const s = Math.max(-1, Math.min(1, processedData[i]));
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

      console.log('✅ Audio capture started (16kHz mono PCM16)');
      console.log('   - Noise reduction: ENABLED (70% strength)');
      console.log('   - Automatic silence detection: 2.5s');
      console.log('   - Voice activity detection: ENABLED');
      return this.mediaStream;
    } catch (error) {
      console.error('Error starting audio capture:', error);
      throw error;
    }
  }

  /**
   * Build noise profile from calibration samples
   * Uses spectral averaging to create a baseline noise model
   */
  private buildNoiseProfile(): void {
    if (this.calibrationSamples.length === 0) return;

    const sampleLength = this.calibrationSamples[0].length;
    this.noiseProfile = new Float32Array(sampleLength);

    // Calculate average amplitude for each sample position
    for (let i = 0; i < sampleLength; i++) {
      let sum = 0;
      for (const sample of this.calibrationSamples) {
        sum += Math.abs(sample[i]); // Use absolute amplitude
      }
      this.noiseProfile[i] = sum / this.calibrationSamples.length;
    }

    // Update noise floor based on calibrated profile
    const avgNoiseLevel = this.calculateRMS(this.noiseProfile);
    this.noiseFloor = avgNoiseLevel * 1.5; // 1.5x average for safety margin

    this.isCalibrated = true;

    // Clear calibration samples to free memory
    this.calibrationSamples = [];

    console.log(`🎯 Noise floor updated: ${this.noiseFloor.toFixed(6)}`);
  }

  /**
   * Apply noise reduction using spectral subtraction and noise gating
   * @param inputData Raw audio samples
   * @returns Processed audio samples with noise reduced
   */
  private applyNoiseReduction(inputData: Float32Array): Float32Array {
    if (!this.noiseProfile) return inputData;

    const output = new Float32Array(inputData.length);
    const strength = this.noiseReductionStrength;

    for (let i = 0; i < inputData.length; i++) {
      const noisyAmplitude = Math.abs(inputData[i]);
      const noiseLevel = this.noiseProfile[i];

      // Spectral Subtraction: Subtract noise estimate from signal
      const cleanAmplitude = Math.max(0, noisyAmplitude - noiseLevel * strength);

      // Noise Gating: Zero out samples below noise floor
      const gatedAmplitude = cleanAmplitude > this.noiseFloor ? cleanAmplitude : 0;

      // Preserve original phase (sign)
      output[i] = inputData[i] >= 0 ? gatedAmplitude : -gatedAmplitude;
    }

    return output;
  }

  /**
   * Calculate RMS (Root Mean Square) amplitude
   * @param data Audio samples
   * @returns RMS value
   */
  private calculateRMS(data: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
    }
    return Math.sqrt(sumSquares / data.length);
  }

  /**
   * Recalibrate noise profile (useful if environment changes)
   */
  public recalibrateNoise(): void {
    console.log('🔄 Recalibrating noise profile...');
    this.isCalibrated = false;
    this.calibrationSamples = [];
    this.noiseProfile = null;
    this.frameCount = 0;
  }

  /**
   * Enable or disable noise reduction
   * @param enabled Whether to enable noise reduction
   */
  public setNoiseReduction(enabled: boolean): void {
    this.noiseReductionEnabled = enabled;
    console.log(`🔊 Noise reduction: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Set noise reduction strength
   * @param strength Value between 0 (no reduction) and 1 (maximum reduction)
   */
  public setNoiseReductionStrength(strength: number): void {
    this.noiseReductionStrength = Math.max(0, Math.min(1, strength));
    console.log(`🎚️ Noise reduction strength: ${(this.noiseReductionStrength * 100).toFixed(0)}%`);
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
