# Campx Chat AI - Complete Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Audio Processing Pipeline](#audio-processing-pipeline)
6. [State Management](#state-management)
7. [Barge-In (Interruption) System](#barge-in-interruption-system)
8. [WebSocket Communication](#websocket-communication)
9. [Gemini Live API Integration](#gemini-live-api-integration)
10. [Session Lifecycle](#session-lifecycle)

---

## System Overview

### What is this?
A real-time speech-to-speech voice conversation application that allows users to have natural voice conversations with Google's Gemini AI. Think of it like talking to Alexa or Siri, but powered by Gemini.

### Why WebSocket instead of WebRTC?
- **Simplicity**: WebSocket is easier to implement and debug
- **Reliability**: No NAT/firewall traversal issues
- **Compatibility**: Works in all browsers without STUN/TURN servers
- **Trade-off**: Slightly higher latency (~50-100ms more) but much more reliable

### Tech Stack
```
Frontend: React + TypeScript + WebSocket API
Backend: Python + FastAPI + WebSockets
AI: Google Gemini Live API (gemini-2.0-flash-exp)
Audio: 16kHz PCM16 (capture) → 24kHz PCM16 (playback)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐         │
│  │  Microphone  │───▶│  AudioProcessor  │───▶│  WebSocketService │         │
│  │  (16kHz)     │    │  (Noise Reduce)  │    │  (Binary chunks)  │         │
│  └──────────────┘    └──────────────────┘    └────────┬─────────┘         │
│                                                        │                    │
│                                                        │ WebSocket          │
│                                                        │ ws://localhost:8000│
│  ┌──────────────┐    ┌──────────────────┐             │                    │
│  │   Speaker    │◀───│   AudioPlayer    │◀────────────┤                    │
│  │  (24kHz)     │    │  (Queue + Play)  │             │                    │
│  └──────────────┘    └──────────────────┘             │                    │
│                                                        │                    │
│  ┌──────────────────────────────────────┐             │                    │
│  │     ConversationStateManager         │             │                    │
│  │  IDLE → LISTENING → PROCESSING →     │             │                    │
│  │  AI_SPEAKING → LISTENING (loop)      │             │                    │
│  └──────────────────────────────────────┘             │                    │
│                                                        │                    │
└────────────────────────────────────────────────────────┼────────────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PYTHON BACKEND (FastAPI)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│  │  WebSocket       │───▶│  WebSocketSession │───▶│  GeminiLiveSession│     │
│  │  /ws endpoint    │    │  (Proxy & State)  │    │  (API Client)     │     │
│  └──────────────────┘    └──────────────────┘    └────────┬─────────┘     │
│                                                            │                │
│                                                            │ WebSocket      │
│                                                            │ wss://         │
└────────────────────────────────────────────────────────────┼────────────────┘
                                                             │
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GOOGLE GEMINI LIVE API                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  - Receives 16kHz PCM16 audio                                               │
│  - Voice Activity Detection (VAD)                                           │
│  - Speech-to-Text → LLM Processing → Text-to-Speech                        │
│  - Returns 24kHz PCM16 audio                                                │
│  - Supports interruption/barge-in                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### File Structure
```
voice-agent/client/src/
├── App.tsx                      # Main UI component
├── App.css                      # Styles
├── hooks/
│   └── useGeminiSession.ts      # Session lifecycle hook
├── services/
│   ├── websocketService.ts      # WebSocket connection
│   ├── audioProcessor.ts        # Mic capture + Speaker playback
│   ├── conversationState.ts     # State machine
│   └── bargeInDetector.ts       # Voice interruption detection
├── components/
│   └── VoiceWaveform.tsx        # Audio visualization
└── types/
    └── index.ts                 # TypeScript definitions
```

### Key Components Explained

#### 1. App.tsx - The UI Layer
**What it does**: Renders the user interface and manages UI state.

```typescript
// Key state from useGeminiSession hook
const {
  sessionId,           // Unique session identifier
  connectionState,     // 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking'
  conversationState,   // 'IDLE' | 'LISTENING' | 'PROCESSING' | 'AI_SPEAKING' | 'INTERRUPTING'
  isConnected,         // Boolean: is WebSocket connected?
  isSpeaking,          // Boolean: is AI currently speaking?
  isProcessing,        // Boolean: waiting for AI response?
  startSession,        // Function: start conversation
  endSession,          // Function: end conversation
} = useGeminiSession();
```

**UI States**:
- **Disconnected**: Shows "Ready to start" + "Start Conversation" button
- **Connected/Listening**: Shows "Listening... Speak now" + waveform animation
- **Processing**: Shows "Processing..." while waiting for AI
- **AI Speaking**: Shows "AI is responding" + different waveform

#### 2. useGeminiSession.ts - The Session Manager
**What it does**: Manages the entire session lifecycle, coordinates all services.

```typescript
// Initialization flow
const startSession = async () => {
  // 1. Setup WebSocket callbacks
  websocketService.onAudioReceived = (audioData) => {
    // When audio arrives from Gemini, play it
    audioPlayer.addAudioChunk(audioData);
  };

  // 2. Connect to backend WebSocket
  const sessionId = await websocketService.connect();

  // 3. Start microphone capture
  const stream = await audioProcessor.startCapture(
    (chunk) => websocketService.sendAudioChunk(chunk),  // Send audio to backend
    () => stateManager.transition('PROCESSING')          // On silence detected
  );
};
```

#### 3. websocketService.ts - WebSocket Communication
**What it does**: Handles all WebSocket communication with backend.

```typescript
class WebSocketService {
  private ws: WebSocket | null = null;

  // Connect to backend
  async connect(): Promise<string> {
    this.ws = new WebSocket('ws://localhost:8000/ws');

    this.ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Binary data = audio from Gemini
        this.onAudioReceived(new Uint8Array(await event.data.arrayBuffer()));
      } else {
        // JSON = control messages
        const data = JSON.parse(event.data);
        if (data.type === 'session_id') this.sessionId = data.session_id;
        if (data.type === 'turn_complete') this.onAITurnComplete();
        if (data.type === 'gemini_interrupted') this.onGeminiInterrupted();
      }
    };
  }

  // Send audio chunk (binary)
  sendAudioChunk(chunk: Uint8Array) {
    this.ws.send(chunk);
  }

  // Send interrupt command (JSON)
  interrupt() {
    this.ws.send(JSON.stringify({ type: 'interrupt' }));
  }
}
```

#### 4. audioProcessor.ts - Audio Capture & Playback
**What it does**: Captures microphone audio, processes it, and plays back AI audio.

##### AudioProcessor Class (Microphone Capture)
```typescript
class AudioProcessor {
  private audioContext: AudioContext;
  private processor: ScriptProcessorNode;

  async startCapture(onAudioData, onSilence) {
    // 1. Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,      // 16kHz for Gemini
        channelCount: 1,        // Mono
        echoCancellation: true, // Remove echo
        noiseSuppression: true, // Reduce background noise
        autoGainControl: true,  // Normalize volume
      }
    });

    // 2. Create audio processing pipeline
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.processor = this.audioContext.createScriptProcessor(256, 1, 1);

    // 3. Process each audio frame
    this.processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);

      // Apply noise reduction
      const processedData = this.applyNoiseReduction(inputData);

      // Voice Activity Detection
      const rms = this.calculateRMS(processedData);
      if (rms > this.silenceThreshold) {
        this.isSpeaking = true;
        this.lastSoundTime = Date.now();
      }

      // Convert Float32 to PCM16
      const pcm16 = this.convertToPCM16(processedData);

      // Send to backend
      onAudioData(pcm16);
    };
  }
}
```

##### AudioPlayer Class (Speaker Playback)
```typescript
class AudioPlayer {
  private audioContext: AudioContext;
  private audioQueue: AudioBuffer[] = [];

  async addAudioChunk(pcm24k: Uint8Array) {
    // 1. Convert PCM16 to Float32
    const float32 = this.pcm16ToFloat32(pcm24k);

    // 2. Create AudioBuffer
    const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    // 3. Add to queue and play
    this.audioQueue.push(buffer);
    if (!this.isPlaying) this.playQueue();
  }

  interrupt() {
    // Stop current playback immediately
    this.currentSource?.stop();
    this.audioQueue = [];  // Clear queue
  }
}
```

#### 5. conversationState.ts - State Machine
**What it does**: Manages conversation states and prevents race conditions.

```typescript
// Valid state transitions
const VALID_TRANSITIONS = {
  'IDLE':         ['LISTENING'],
  'LISTENING':    ['PROCESSING', 'IDLE', 'AI_SPEAKING'],
  'PROCESSING':   ['AI_SPEAKING', 'LISTENING', 'IDLE'],
  'AI_SPEAKING':  ['LISTENING', 'INTERRUPTING', 'IDLE'],
  'INTERRUPTING': ['LISTENING', 'IDLE'],
};

class ConversationStateManager {
  private currentState: ConversationState = 'IDLE';
  private isLocked: boolean = false;

  transition(to: ConversationState, trigger: string): boolean {
    // Check if transition is valid
    if (!VALID_TRANSITIONS[this.currentState].includes(to)) {
      console.warn(`Invalid transition: ${this.currentState} → ${to}`);
      return false;
    }

    // Check if locked (prevents race conditions)
    if (this.isLocked) return false;

    this.currentState = to;
    this.notifyListeners(to);
    return true;
  }

  // Lock state machine temporarily (during interruption)
  lock(durationMs: number) {
    this.isLocked = true;
    setTimeout(() => this.isLocked = false, durationMs);
  }
}
```

#### 6. bargeInDetector.ts - Voice Interruption
**What it does**: Detects when user speaks while AI is talking.

```typescript
class BargeInDetector {
  private config = {
    energyThreshold: 0.025,  // RMS threshold for speech
    consecutiveFrames: 1,    // Frames needed to confirm
    debounceMs: 50,          // Cooldown between triggers
    graceperiodMs: 30,       // Ignore first N ms after AI starts
  };

  processAudioFrame(audioData: Float32Array): boolean {
    // Skip if in grace period
    if (Date.now() - this.aiSpeakingStartTime < this.config.graceperiodMs) {
      return false;
    }

    // Calculate energy
    const rms = this.calculateRMS(audioData);

    // Check if user is speaking
    if (rms > this.config.energyThreshold) {
      this.consecutiveFrames++;
      if (this.consecutiveFrames >= this.config.consecutiveFrames) {
        this.triggerBargeIn();
        return true;
      }
    } else {
      this.consecutiveFrames = 0;
    }

    return false;
  }
}
```

---

## Backend Architecture

### File Structure
```
voice-agent/backend/
├── main.py                  # FastAPI app, WebSocket endpoint
├── websocket_handler.py     # WebSocketSession class
├── gemini_live_client.py    # GeminiLiveSession class
├── auth_utils.py            # Google Cloud authentication
├── tools.py                 # Function calling tools
└── start_server.py          # Server startup script
```

### Key Components Explained

#### 1. main.py - FastAPI Application
**What it does**: Entry point, handles WebSocket connections.

```python
from fastapi import FastAPI, WebSocket
from websocket_handler import WebSocketSession

app = FastAPI()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Accept the WebSocket connection
    await websocket.accept()

    # 2. Create a new session
    session_id = str(uuid.uuid4())
    session = WebSocketSession(session_id, error_tracker)

    # 3. Send session ID to frontend
    await websocket.send_json({"type": "session_id", "session_id": session_id})

    # 4. Connect to Gemini and start proxying
    await session.connect_to_gemini(websocket, project_id, region, model)

    # 5. Wait for tasks to complete
    await asyncio.gather(session.receive_task, session.gemini_receive_task)
```

#### 2. websocket_handler.py - Session Proxy
**What it does**: Proxies data between frontend and Gemini, manages state.

```python
class WebSocketSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.websocket = None           # Frontend WebSocket
        self.gemini_session = None      # Gemini WebSocket
        self.is_ai_speaking = False     # Track AI state
        self.is_interrupted = False     # Track interruption

    async def connect_to_gemini(self, websocket, project_id, region, model):
        self.websocket = websocket

        # Create Gemini session
        self.gemini_session = GeminiLiveSession(project_id, region, model, self.session_id)

        # Set callbacks
        self.gemini_session.on_audio_received = self.send_audio_to_frontend
        self.gemini_session.on_turn_complete = self.on_ai_turn_complete
        self.gemini_session.on_interrupted = self.on_gemini_interrupted

        # Connect to Gemini
        access_token = get_vertex_ai_access_token()
        await self.gemini_session.connect(access_token, project_id, region)

        # Start receive loops
        self.receive_task = asyncio.create_task(self.receive_from_frontend())
        self.gemini_receive_task = asyncio.create_task(self.gemini_session.receive_loop())

        # Send initial greeting
        await self.gemini_session.send_initial_greeting()

    async def receive_from_frontend(self):
        """Receive and forward messages from frontend"""
        while True:
            message = await self.websocket.receive()

            if "bytes" in message:
                # Audio data - forward to Gemini
                audio_data = message["bytes"]
                await self.gemini_session.send_audio_chunk(audio_data)

            elif "text" in message:
                # Control message
                data = json.loads(message["text"])
                if data["type"] == "interrupt":
                    await self.interrupt()

    def send_audio_to_frontend(self, audio_data: bytes):
        """Send Gemini audio to frontend"""
        if self.is_interrupted:
            return  # Drop audio if interrupted

        self.is_ai_speaking = True
        asyncio.create_task(self.websocket.send_bytes(audio_data))

    async def interrupt(self):
        """Handle barge-in"""
        self.is_interrupted = True
        self.is_ai_speaking = False

        # Notify frontend
        await self.websocket.send_json({"type": "interrupted"})

        # Forward to Gemini
        await self.gemini_session.interrupt()
```

#### 3. gemini_live_client.py - Gemini API Client
**What it does**: Handles WebSocket connection to Gemini Live API.

```python
class GeminiLiveSession:
    def __init__(self, project_id, region, model, session_id):
        self.gemini_ws = None
        self.is_interrupted = False
        self.on_audio_received = None
        self.on_turn_complete = None
        self.on_interrupted = None

    async def connect(self, access_token, project_id, region):
        # Gemini Live API WebSocket URL
        uri = f"wss://{region}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent"

        # Connect with OAuth2 token
        self.gemini_ws = await websockets.connect(uri, additional_headers={
            "Authorization": f"Bearer {access_token}"
        })

        # Send setup message
        setup_message = {
            "setup": {
                "model": f"projects/{project_id}/locations/{region}/publishers/google/models/{model}",
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {
                                "voice_name": "Puck"
                            }
                        }
                    }
                },
                "system_instruction": {
                    "parts": [{
                        "text": "You are a helpful, friendly multilingual AI assistant..."
                    }]
                },
                "realtime_input_config": {
                    "automatic_activity_detection": {
                        "disabled": False,
                        "start_of_speech_sensitivity": "START_SENSITIVITY_HIGH",
                        "end_of_speech_sensitivity": "END_SENSITIVITY_HIGH",
                        "prefix_padding_ms": 20,
                        "silence_duration_ms": 250
                    }
                }
            }
        }
        await self.gemini_ws.send(json.dumps(setup_message))

        # Wait for setup confirmation
        response = await self.gemini_ws.recv()
        if "setupComplete" in json.loads(response):
            logger.info("Gemini connected successfully")

    async def send_audio_chunk(self, audio_data: bytes):
        """Send audio to Gemini"""
        message = {
            "realtime_input": {
                "media_chunks": [{
                    "mime_type": "audio/pcm;rate=16000",
                    "data": base64.b64encode(audio_data).decode('utf-8')
                }]
            }
        }
        await self.gemini_ws.send(json.dumps(message))

    async def receive_loop(self):
        """Receive and process Gemini responses"""
        while True:
            response = await self.gemini_ws.recv()
            data = json.loads(response)

            if "serverContent" in data:
                server_content = data["serverContent"]

                # Check for interruption signal
                if server_content.get("interrupted", False):
                    self.is_interrupted = True
                    if self.on_interrupted:
                        self.on_interrupted()
                    continue

                # Extract audio from model turn
                if "modelTurn" in server_content:
                    for part in server_content["modelTurn"].get("parts", []):
                        if "inlineData" in part:
                            audio_b64 = part["inlineData"]["data"]
                            audio_bytes = base64.b64decode(audio_b64)

                            # Skip if interrupted
                            if not self.is_interrupted and self.on_audio_received:
                                self.on_audio_received(audio_bytes)

                # Check for turn complete
                if server_content.get("turnComplete", False):
                    if self.on_turn_complete:
                        self.on_turn_complete()

    async def send_initial_greeting(self):
        """Send greeting prompt to trigger AI introduction"""
        message = {
            "client_content": {
                "turns": [{
                    "role": "user",
                    "parts": [{
                        "text": "Greet me briefly in English and ask how you can help."
                    }]
                }],
                "turn_complete": True
            }
        }
        await self.gemini_ws.send(json.dumps(message))
```

---

## Audio Processing Pipeline

### Capture Pipeline (User → Gemini)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Microphone  │───▶│   Browser   │───▶│   Noise     │───▶│  Convert    │
│ Hardware    │    │ MediaStream │    │  Reduction  │    │ to PCM16    │
│             │    │  (16kHz)    │    │  (50%)      │    │ Int16Array  │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                 │
                                                                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Gemini    │◀───│  Base64     │◀───│  WebSocket  │◀───│  WebSocket  │
│   Server    │    │  Encode     │    │   Backend   │    │  Frontend   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Playback Pipeline (Gemini → User)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Gemini    │───▶│  Base64     │───▶│  WebSocket  │───▶│  WebSocket  │
│   Server    │    │  Decode     │    │   Backend   │    │  Frontend   │
│  (24kHz)    │    │             │    │             │    │  (Binary)   │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                 │
                                                                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Speaker    │◀───│ AudioBuffer │◀───│  Convert    │◀───│  Queue      │
│  Hardware   │    │ SourceNode  │    │ PCM16→Float │    │  Manager    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Audio Format Details

| Stage | Sample Rate | Format | Channels | Buffer Size |
|-------|-------------|--------|----------|-------------|
| Microphone | 16kHz | Float32 | Mono | 256 samples |
| To Backend | 16kHz | PCM16 (Int16) | Mono | 512 bytes |
| Gemini Input | 16kHz | Base64 PCM16 | Mono | Variable |
| Gemini Output | 24kHz | Base64 PCM16 | Mono | Variable |
| From Backend | 24kHz | PCM16 (Int16) | Mono | Variable |
| To Speaker | 24kHz | Float32 | Mono | Variable |

---

## State Management

### Conversation States

```
                    ┌─────────────────┐
                    │                 │
                    │      IDLE       │ ◀──────────────────────────────┐
                    │  (Disconnected) │                                │
                    │                 │                                │
                    └────────┬────────┘                                │
                             │                                         │
                             │ startSession()                          │
                             ▼                                         │
                    ┌─────────────────┐                                │
                    │                 │                                │
           ┌───────▶│    LISTENING    │ ◀─────────────────┐           │
           │        │  (User speaks)  │                   │           │
           │        │                 │                   │           │
           │        └────────┬────────┘                   │           │
           │                 │                            │           │
           │                 │ silence detected           │           │
           │                 ▼                            │           │
           │        ┌─────────────────┐                   │           │
           │        │                 │                   │           │
           │        │   PROCESSING    │                   │           │
           │        │ (Waiting for AI)│                   │           │
           │        │                 │                   │           │
           │        └────────┬────────┘                   │           │
           │                 │                            │           │
           │                 │ audio received             │           │
           │                 ▼                            │           │
           │        ┌─────────────────┐                   │           │
           │        │                 │                   │           │
           │        │   AI_SPEAKING   │───────────────────┤           │
           │        │  (AI responds)  │  AI turn complete │           │
           │        │                 │                   │           │
           │        └────────┬────────┘                   │           │
           │                 │                            │           │
           │                 │ user interrupts            │           │
           │                 ▼                            │           │
           │        ┌─────────────────┐                   │           │
           │        │                 │                   │           │
           └────────│  INTERRUPTING   │───────────────────┘           │
                    │  (Barge-in)     │                                │
                    │                 │                                │
                    └────────┬────────┘                                │
                             │                                         │
                             │ endSession()                            │
                             └─────────────────────────────────────────┘
```

### State Transitions Table

| From State | To State | Trigger | What Happens |
|------------|----------|---------|--------------|
| IDLE | LISTENING | `startSession()` | WebSocket connects, mic starts |
| LISTENING | PROCESSING | Silence detected (200ms) | UI shows "Processing..." |
| PROCESSING | AI_SPEAKING | Audio received from Gemini | Audio playback starts |
| AI_SPEAKING | LISTENING | AI turn complete | Ready for next user input |
| AI_SPEAKING | INTERRUPTING | User speaks (barge-in) | Audio stopped immediately |
| INTERRUPTING | LISTENING | Interrupt processed | Ready for user to continue |
| Any State | IDLE | `endSession()` | Everything cleaned up |

---

## Barge-In (Interruption) System

### What is Barge-In?
Barge-in allows users to interrupt the AI mid-sentence, just like interrupting a real person. This makes conversations feel more natural.

### How It Works

```
Timeline: User interrupts AI mid-sentence
─────────────────────────────────────────────────────────────────────────▶

AI Speaking: "Hello! I'm here to help you with any questions you might h—"
                                                                    │
User Speaks: ────────────────────────────────────────────────[HELLO]│
                                                                    │
                                                                    ▼
                                                            Barge-In Triggered
                                                                    │
                                                                    ▼
                                                            Audio Stopped
                                                            Queue Cleared
                                                            State → LISTENING
```

### Barge-In Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     BARGE-IN DETECTION FLOW                             │
└─────────────────────────────────────────────────────────────────────────┘

1. AI starts speaking
   └─▶ BargeInDetector.startMonitoring() called
   └─▶ AudioProcessor continues capturing mic audio

2. Each audio frame is processed (every ~16ms)
   └─▶ Calculate RMS energy: sqrt(sum(samples²) / length)
   └─▶ Compare to threshold (0.025)

3. If RMS > threshold:
   └─▶ Increment consecutiveFrames counter
   └─▶ If consecutiveFrames >= 1:
       └─▶ BARGE-IN TRIGGERED!

4. Barge-in triggered:
   └─▶ AudioPlayer.interrupt() - Stop playback immediately
   └─▶ Clear audio queue
   └─▶ WebSocketService.interrupt() - Send interrupt to backend
   └─▶ StateManager.transition('INTERRUPTING')
   └─▶ StateManager.transition('LISTENING')

5. Backend receives interrupt:
   └─▶ Set is_interrupted = True
   └─▶ Drop any incoming Gemini audio
   └─▶ Gemini detects user audio and stops generating
```

### Barge-In Configuration

```typescript
const DEFAULT_BARGE_IN_CONFIG = {
  enabled: true,
  energyThreshold: 0.025,  // How loud user must speak (0-1 scale)
  consecutiveFrames: 1,    // How many frames to confirm (1 = instant)
  debounceMs: 50,          // Cooldown between triggers
  graceperiodMs: 30,       // Ignore first 30ms after AI starts
};
```

### Latency Breakdown

| Component | Time | Description |
|-----------|------|-------------|
| Audio Frame | ~16ms | Buffer size (256 samples at 16kHz) |
| RMS Calculation | <1ms | Simple math operation |
| State Transition | <1ms | In-memory state change |
| AudioPlayer.interrupt() | <5ms | Stop current source |
| WebSocket Send | ~10ms | Network latency |
| **Total** | **~30-50ms** | From user speech to AI silence |

---

## WebSocket Communication

### Message Types

#### Frontend → Backend

| Type | Format | Description |
|------|--------|-------------|
| Audio | Binary (Uint8Array) | 16kHz PCM16 audio chunks |
| Interrupt | `{"type": "interrupt"}` | Stop AI playback |
| End of Turn | `{"type": "end_of_turn"}` | Manual end of turn signal |
| Ping | `{"type": "ping"}` | Keep-alive |

#### Backend → Frontend

| Type | Format | Description |
|------|--------|-------------|
| Session ID | `{"type": "session_id", "session_id": "..."}` | Initial session identifier |
| Audio | Binary (bytes) | 24kHz PCM16 audio from Gemini |
| Turn Complete | `{"type": "turn_complete"}` | AI finished speaking |
| Interrupted | `{"type": "interrupted"}` | Interrupt acknowledged |
| Gemini Interrupted | `{"type": "gemini_interrupted"}` | Gemini detected user speech |
| Pong | `{"type": "pong"}` | Keep-alive response |

### WebSocket Connection Flow

```
Frontend                     Backend                      Gemini
    │                           │                            │
    │──── Connect ─────────────▶│                            │
    │                           │──── Connect ──────────────▶│
    │                           │◀─── Setup Complete ────────│
    │◀─── Session ID ───────────│                            │
    │                           │──── Initial Greeting ─────▶│
    │◀─── Audio (greeting) ─────│◀─── Audio ─────────────────│
    │                           │                            │
    │──── Audio (user) ────────▶│──── Audio ────────────────▶│
    │                           │                            │
    │◀─── Audio (AI) ───────────│◀─── Audio ─────────────────│
    │                           │                            │
    │──── Interrupt ───────────▶│                            │
    │◀─── Interrupted ──────────│                            │
    │                           │                            │
    │──── Close ───────────────▶│──── Close ────────────────▶│
    │                           │                            │
```

---

## Gemini Live API Integration

### API Endpoint
```
wss://{region}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent
```

### Authentication
Uses OAuth2 Bearer token from Google Cloud service account.

### Setup Message Structure
```json
{
  "setup": {
    "model": "projects/{PROJECT}/locations/{REGION}/publishers/google/models/gemini-2.0-flash-exp",
    "generation_config": {
      "response_modalities": ["AUDIO"],
      "speech_config": {
        "voice_config": {
          "prebuilt_voice_config": {
            "voice_name": "Puck"
          }
        }
      }
    },
    "system_instruction": {
      "parts": [{
        "text": "You are a helpful, friendly multilingual AI assistant..."
      }]
    },
    "realtime_input_config": {
      "automatic_activity_detection": {
        "disabled": false,
        "start_of_speech_sensitivity": "START_SENSITIVITY_HIGH",
        "end_of_speech_sensitivity": "END_SENSITIVITY_HIGH",
        "prefix_padding_ms": 20,
        "silence_duration_ms": 250
      }
    }
  }
}
```

### Audio Input Message
```json
{
  "realtime_input": {
    "media_chunks": [{
      "mime_type": "audio/pcm;rate=16000",
      "data": "<base64_encoded_pcm16_audio>"
    }]
  }
}
```

### Audio Output Message
```json
{
  "serverContent": {
    "modelTurn": {
      "parts": [{
        "inlineData": {
          "mimeType": "audio/pcm",
          "data": "<base64_encoded_pcm16_audio>"
        }
      }]
    },
    "turnComplete": true
  }
}
```

### Voice Activity Detection (VAD)
Gemini has built-in VAD that:
- Detects when user starts speaking
- Detects when user stops speaking (250ms silence)
- Detects interruptions (user speaks during AI response)

---

## Session Lifecycle

### Complete Session Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SESSION LIFECYCLE                                │
└─────────────────────────────────────────────────────────────────────────┘

1. USER CLICKS "Start Conversation"
   │
   ├─▶ Frontend: useGeminiSession.startSession()
   │   ├─▶ Create WebSocket connection to ws://localhost:8000/ws
   │   ├─▶ Setup callbacks for audio/messages
   │   └─▶ Start microphone capture (AudioProcessor)
   │
   ├─▶ Backend: main.py websocket_endpoint()
   │   ├─▶ Accept WebSocket connection
   │   ├─▶ Create WebSocketSession
   │   ├─▶ Send session_id to frontend
   │   └─▶ Connect to Gemini Live API
   │
   └─▶ Gemini: Setup complete
       └─▶ Backend sends initial greeting prompt
       └─▶ Gemini responds with greeting audio

2. CONVERSATION LOOP
   │
   ├─▶ User speaks
   │   ├─▶ AudioProcessor captures audio (16kHz)
   │   ├─▶ Apply noise reduction
   │   ├─▶ Convert to PCM16
   │   ├─▶ Send via WebSocket to backend
   │   ├─▶ Backend forwards to Gemini (base64 encoded)
   │   └─▶ State: LISTENING
   │
   ├─▶ User stops speaking (200ms silence)
   │   ├─▶ State: PROCESSING
   │   └─▶ Gemini VAD detects silence, starts generating
   │
   ├─▶ AI responds
   │   ├─▶ Gemini sends audio chunks (24kHz)
   │   ├─▶ Backend decodes and forwards to frontend
   │   ├─▶ AudioPlayer queues and plays audio
   │   ├─▶ BargeInDetector monitors for interruption
   │   └─▶ State: AI_SPEAKING
   │
   ├─▶ AI finishes OR user interrupts
   │   ├─▶ If finished: State → LISTENING
   │   └─▶ If interrupted: State → INTERRUPTING → LISTENING
   │
   └─▶ Loop continues...

3. USER CLICKS "End Session"
   │
   ├─▶ Frontend: useGeminiSession.endSession()
   │   ├─▶ Stop barge-in monitoring
   │   ├─▶ Stop audio capture
   │   ├─▶ Close AudioPlayer
   │   ├─▶ Close WebSocket
   │   └─▶ Reset state to IDLE
   │
   └─▶ Backend: WebSocketSession.close()
       ├─▶ Cancel receive tasks
       ├─▶ Close Gemini connection
       └─▶ Close frontend WebSocket
```

---

## Performance Optimizations

### Latency Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Audio buffer | <20ms | 16ms (256 samples at 16kHz) |
| Silence detection | <250ms | 200ms |
| Barge-in response | <100ms | ~30-50ms |
| End-to-end (speak → hear) | <1s | ~400-800ms |

### Optimization Techniques

1. **Small audio buffers**: 256 samples (~16ms) instead of 4096 (~256ms)
2. **Fast silence polling**: Check every 15ms instead of 100ms
3. **Instant barge-in**: 1 frame confirmation instead of 5
4. **Minimal grace period**: 30ms instead of 200ms
5. **Reduced noise calibration**: 3 frames (~96ms) instead of 10
6. **Parallel processing**: Audio capture, playback, and state management run concurrently

---

## Troubleshooting Guide

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No audio from AI | AudioContext suspended | Click anywhere on page first (Chrome policy) |
| Choppy playback | Buffer underrun | Increase buffer size |
| False barge-in triggers | Threshold too low | Increase energyThreshold |
| AI cuts off mid-sentence | Silence too short | Increase silence_duration_ms |
| Connection fails | Auth error | Check service account credentials |
| High latency | Large buffers | Reduce buffer sizes |

### Debug Logging

```javascript
// Frontend console logs to watch:
🎙️ Starting audio capture
✅ Audio capture started
🎤 Voice detected
🔕 Silence detected
🔊 Audio received from Gemini
✋ BARGE-IN TRIGGERED
🔄 State transition: LISTENING → PROCESSING

// Backend logs to watch:
[session_id] Connecting to Gemini Live API...
[session_id] Gemini Live API connected successfully
[session_id] Sent audio chunk to Gemini
[session_id] Audio chunk from Gemini
[session_id] ✋ Processing interrupt signal
```

---

## Summary

This voice agent system creates a seamless real-time conversation experience by:

1. **Capturing audio** from the user's microphone at 16kHz
2. **Processing** with noise reduction and voice activity detection
3. **Streaming** via WebSocket to a Python backend
4. **Proxying** to Google's Gemini Live API
5. **Receiving** AI-generated audio responses at 24kHz
6. **Playing back** through the browser's audio system
7. **Detecting interruptions** for natural conversation flow

The architecture prioritizes low latency (~400-800ms end-to-end) while maintaining reliability through WebSocket-based transport instead of WebRTC.
