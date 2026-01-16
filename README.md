## Project Overview

Real-time speech-to-speech application using WebSocket and Google's Gemini Live API (gemini-live-2.5-flash-native-audio) for bidirectional voice conversations. The architecture consists of:

- **Backend**: Python FastAPI server with WebSocket endpoint (`/ws`) for audio streaming and Gemini Live API integration
- **Frontend**: React + TypeScript SPA with WebSocket client, circular waveform visualization, and optional wake word detection (Picovoice Porcupine)

## Quick Start Commands

### Backend Setup
```bash
cd backend
# Install dependencies
uv pip install -e .
# OR with pip:
pip install -e .

# Run server (Windows)
start.bat
# OR with Python directly:
python start_server.py
# OR with uvicorn:
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
Backend runs on `http://127.0.0.1:8000`

### Frontend Setup
```bash
cd client
npm install        # Install dependencies
npm start          # Start dev server (port 3000)
npm run build      # Production build
npm test           # Run tests
```

### Testing & Debugging
```bash
# Health check
curl http://localhost:8000/health

# View error logs
curl http://localhost:8000/errors
# OR check file:
cat backend/error_log.txt
```

## Architecture

### Communication Flow

```
Browser (React)
  ↕ WebSocket (/ws endpoint)
  ↕ Binary: 16kHz PCM16 audio → 24kHz PCM16 audio
  ↕ Text: JSON control messages (interrupt, ping)
FastAPI Backend
  ↕ WebSocket (Gemini Live API protocol)
Google Gemini Live API
```

**Key architectural decision**: Uses WebSocket (not WebRTC) for bidirectional audio streaming. This simplifies deployment and avoids NAT/firewall issues but requires the backend to proxy all audio data.

### Session Lifecycle

1. Frontend connects to `ws://localhost:8000/ws`
2. Backend:
   - Creates `WebSocketSession` instance
   - Obtains Vertex AI access token via service account
   - Connects to Gemini Live API WebSocket
   - Returns session ID to frontend
3. Audio streaming begins:
   - Frontend captures mic audio → 16kHz PCM16 → Backend → Gemini
   - Gemini → 24kHz PCM16 → Backend → Frontend → Web Audio API playback
4. Frontend can send `{"type": "interrupt"}` to stop AI mid-speech
5. WebSocket disconnection triggers cleanup on both sides

### Key Components

**Backend** ([backend/](backend/)):
- [main.py](backend/main.py): FastAPI app with `/ws` WebSocket endpoint, health/error endpoints, session management
- [websocket_handler.py](backend/websocket_handler.py): `WebSocketSession` class - manages frontend WebSocket and proxies to Gemini
- [gemini_live_client.py](backend/gemini_live_client.py): `GeminiLiveSession` class - handles Gemini Live API WebSocket protocol
- [tools.py](backend/tools.py): `ToolRegistry` for function calling (weather, search, time, etc.)
- [auth_utils.py](backend/auth_utils.py): Service account authentication for Vertex AI
- `ErrorTracker` (in main.py): Logs errors with session context to `error_log.txt`

**Frontend** ([client/src/](client/src/)):
- [App.tsx](client/src/App.tsx): Main React component with UI state management
- [hooks/useGeminiSession.ts](client/src/hooks/useGeminiSession.ts): Session lifecycle hook (start/end session, connection states)
- [services/websocketService.ts](client/src/services/websocketService.ts): `WebSocketService` class - manages WebSocket connection and message routing
- [services/audioProcessor.ts](client/src/services/audioProcessor.ts):
  - `AudioProcessor`: Captures mic audio at 16kHz using Web Audio API
  - `AudioPlayer`: Plays 24kHz audio with queue management for smooth playback
- [services/wakeWordDetector.ts](client/src/services/wakeWordDetector.ts): `WakeWordDetector` class - Picovoice Porcupine integration for wake word detection ("jarvis", etc.)
- [components/CircularWaveVisualizer.tsx](client/src/components/CircularWaveVisualizer.tsx): Real-time frequency visualization using AnalyserNode

### Audio Processing Pipeline

**Capture (Frontend → Backend)**:
- MediaStream API with constraints: 16kHz sample rate, mono, echo cancellation, noise suppression, auto gain
- ScriptProcessorNode converts to PCM16 (Int16Array)
- Sent as binary WebSocket messages

**Playback (Backend → Frontend)**:
- Backend receives 24kHz PCM16 from Gemini
- Forwarded as binary WebSocket messages
- Frontend `AudioPlayer` queues chunks and plays via AudioBufferSourceNode
- Queue management prevents glitches during network jitter

**Barge-in**: Frontend sends `{"type": "interrupt"}` → Backend forwards to Gemini + clears frontend playback queue

**Wake Word Detection (Optional)**:
- Uses Picovoice Porcupine via separate microphone stream (doesn't interfere with main audio capture)
- Requires Picovoice AccessKey from console.picovoice.ai (free tier available)
- Supports built-in wake words: "jarvis", "picovoice", "porcupine", etc.
- High accuracy (97%+), ultra-low latency (10-50ms)
- Configurable sensitivity (0.0-1.0, default 0.5)

### Function Calling

Backend supports custom function calling via Gemini Live API:
- Default tools in [tools.py](backend/tools.py): `get_weather`, `search_database`, `get_current_time`
- Register new tools by adding to `TOOL_SCHEMAS` dict and `default_registry`
- Gemini requests function → Backend executes → Returns result to Gemini
- See [tools.py](backend/tools.py) for schema format (OpenAPI-style)

## Environment Configuration

### Backend `.env` (required)
```env
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1
SERVICE_ACCOUNT_KEY_PATH=reference-flux-483913-i6-fd5ae0029859.json
GEMINI_MODEL=gemini-live-2.5-flash-native-audio
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
```

**Setup steps**:
1. Create GCP project and enable Vertex AI API
2. Create service account with "Vertex AI User" role
3. Download service account key JSON to `backend/` directory
4. Update `SERVICE_ACCOUNT_KEY_PATH` in `.env`

### Frontend `.env` (optional)
```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_PICOVOICE_ACCESS_KEY=your-picovoice-access-key
```
- `REACT_APP_API_URL`: Only needed if backend is on different host/port
- `REACT_APP_PICOVOICE_ACCESS_KEY`: Required for wake word detection feature (get from console.picovoice.ai)

## Common Patterns

### Adding New Function Tools

Edit [backend/tools.py](backend/tools.py):

```python
async def my_function(param1: str, param2: int) -> dict:
    """Implementation"""
    return {"result": "..."}

TOOL_SCHEMAS["my_function"] = {
    "name": "my_function",
    "description": "What this does",
    "parameters": {
        "type": "object",
        "properties": {
            "param1": {"type": "string", "description": "..."},
            "param2": {"type": "integer", "description": "..."}
        },
        "required": ["param1", "param2"]
    }
}

default_registry.register("my_function", my_function, TOOL_SCHEMAS["my_function"])
```

### Modifying Audio Settings

**Sample rate**: Change `sampleRate: 16000` in [audioProcessor.ts](client/src/services/audioProcessor.ts) `startCapture()` method

**Buffer size**: Adjust `bufferSize` in ScriptProcessorNode creation (powers of 2: 256, 512, 1024, etc.) - smaller = lower latency, higher CPU

**Playback context**: Modify `AudioPlayer` constructor to use different sample rate (default 24000)

### Integrating Wake Word Detection

In your React component:
```typescript
import { WakeWordDetector } from './services/wakeWordDetector';

// Initialize detector
const detector = new WakeWordDetector(accessKey, 'jarvis');
await detector.initialize();

// Start listening
await detector.startListening(() => {
  console.log('Wake word detected!');
  // Trigger your action (e.g., start conversation)
});

// Cleanup when done
await detector.cleanup();
```

**Important**: Wake word detection runs on a **separate audio stream** from the main audio processor, so both can run simultaneously without interference.

## Troubleshooting

### WebSocket Connection Fails
- Ensure backend is running: `curl http://localhost:8000/health`
- Check CORS configuration in [main.py](backend/main.py) (currently set to `allow_origins=["*"]`)
- Verify WebSocket URL in [websocketService.ts](client/src/services/websocketService.ts) matches backend host/port
- Check browser console for WebSocket errors

### No Audio from Gemini
- Check [backend/error_log.txt](backend/error_log.txt) for Gemini API errors
- Verify Gemini Live API is enabled in Google Cloud Console
- Confirm service account has "Vertex AI User" role
- Test access token generation: run `python -c "from auth_utils import get_vertex_ai_access_token; print(get_vertex_ai_access_token())"`
- Ensure `GCP_PROJECT_ID` and `GCP_REGION` are correct in `.env`

### Audio Quality Issues
- Check browser microphone permissions (must be granted)
- Use headphones to prevent echo/feedback
- Verify sample rates: 16kHz capture, 24kHz playback
- Increase `bufferSize` in [audioProcessor.ts](client/src/services/audioProcessor.ts) if audio is choppy
- Check network latency: audio streaming is sensitive to jitter

### Frontend Build Errors
- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check TypeScript errors: `npm run build`
- Verify all imports resolve correctly
- Ensure React version is compatible with dependencies

### Wake Word Detection Issues
- Ensure Picovoice AccessKey is valid (check console.picovoice.ai)
- Verify microphone permissions granted in browser
- Check browser console for Porcupine initialization errors
- Built-in wake words: "jarvis", "picovoice", "porcupine", "bumblebee", "alexa", "computer", "grasshopper", "hey google", "hey siri", "ok google", "terminator"
- For custom wake words, you need a `.ppn` model file (train at console.picovoice.ai)

## Security Considerations

- **Never commit** service account keys or `.env` files (both in `.gitignore`)
- CORS set to `allow_origins=["*"]` for development - **must restrict in production**
- Service account keys should be rotated regularly
- WebSocket has no authentication - add token-based auth for production
- Consider rate limiting on WebSocket endpoint
- Picovoice AccessKey is client-side - consider proxy through backend for production

## Key Files

```
backend/
  main.py                       # FastAPI app + WebSocket endpoint
  websocket_handler.py          # Frontend WebSocket session manager
  gemini_live_client.py         # Gemini Live API client
  tools.py                      # Function calling registry
  auth_utils.py                 # Vertex AI authentication
  pyproject.toml                # Python dependencies (UV)
  start_server.py               # Uvicorn startup script
  start.bat                     # Windows startup script
  .env                          # Environment variables (DO NOT COMMIT)
  error_log.txt                 # Error logs (generated at runtime)

client/
  src/
    App.tsx                     # Main React component
    hooks/useGeminiSession.ts   # Session lifecycle hook
    services/
      websocketService.ts       # WebSocket client
      audioProcessor.ts         # Audio capture & playback
      wakeWordDetector.ts       # Picovoice wake word detection
    components/
      CircularWaveVisualizer.tsx  # Frequency visualization
    types/index.ts              # TypeScript type definitions
  package.json                  # NPM dependencies
  .env                          # Frontend config (DO NOT COMMIT)
```

## Development Notes

- Backend auto-reloads on code changes (via `uvicorn --reload`)
- Frontend hot-reloads via React dev server
- Use headphones during development to prevent audio feedback
- Monitor `backend/error_log.txt` for backend issues
- Check browser console for frontend issues
- Audio pipeline is sensitive to async timing - be careful modifying audio processing code
- Wake word detector uses a separate microphone stream that runs in parallel with main audio capture

## Important Architectural Notes

**Current Implementation**: This codebase uses **WebSocket** for audio transport, not WebRTC. Despite some documentation references to WebRTC, the actual implementation:
- Uses WebSocket endpoint `/ws` in backend
- Streams binary PCM16 audio over WebSocket messages
- Handles text control messages (interrupt, ping) as JSON over the same WebSocket

**Recent Changes** (check git log for details):
- WebSocket authentication fix implemented
- Automatic noise reduction added
- Wake word detection service added (Picovoice Porcupine)
- Audio processing improvements for better quality
