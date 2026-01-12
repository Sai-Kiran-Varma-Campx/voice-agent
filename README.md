# Speech-to-Speech with Gemini Live API

Real-time voice conversation application using WebRTC and Google's Gemini Live API for natural, low-latency speech-to-speech interactions.

## Features

- ✨ **Real-time Voice Conversations**: Natural bidirectional speech with Gemini AI
- 🎙️ **WebRTC DataChannel**: Low-latency audio streaming (16kHz → 24kHz PCM)
- 🌊 **Circular Waveform Visualization**: Real-time frequency visualization
- ⏸️ **Barge-in Support**: Interrupt AI mid-speech for natural conversations
- 🔧 **Function Calling**: Custom tools (weather, search, time, etc.)
- 🚀 **Modern Stack**: React + TypeScript + FastAPI + UV

## Architecture

```
┌─────────────────────────────────────────┐
│         React Frontend (Browser)        │
│  - WebRTC DataChannel                   │
│  - Audio Capture (16kHz PCM)            │
│  - Audio Playback (24kHz PCM)           │
│  - Circular Wave Visualizer             │
└──────────────┬──────────────────────────┘
               │ HTTP REST + WebRTC DataChannel
┌──────────────▼──────────────────────────┐
│      FastAPI Backend (Python)           │
│  - Session Management                   │
│  - WebRTC Peer Connection               │
│  - Gemini Live API Client               │
└──────────────┬──────────────────────────┘
               │ WebSocket
┌──────────────▼──────────────────────────┐
│      Google Gemini Live API             │
│  - gemini-live-2.5-flash-native-audio   │
│  - Native audio processing              │
│  - Function calling                     │
└─────────────────────────────────────────┘
```

## Prerequisites

- **Python 3.11+** with `uv` package manager (or pip)
- **Node.js 18+** and npm
- **Google Cloud Platform** account with:
  - Vertex AI API enabled
  - Service account with "Vertex AI User" role
  - Service account key (JSON)

## Quick Start

### 1. Backend Setup

```bash
# Navigate to backend
cd backend

# Install dependencies with uv (recommended)
uv pip install -e .
# OR with pip:
pip install -e .

# Configure environment
cp .env.example .env
# Edit .env with your GCP credentials
```

**`.env` configuration:**
```env
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1
SERVICE_ACCOUNT_KEY_PATH=service-account-key.json
GEMINI_MODEL=gemini-live-2.5-flash-native-audio
```

Place your service account key at `backend/service-account-key.json`.

### 2. Frontend Setup

```bash
# Navigate to frontend
cd frontend/s2s-client

# Install dependencies
npm install

# Create .env file
echo "REACT_APP_API_URL=http://localhost:8000" > .env
```

### 3. Run the Application

**Terminal 1 - Start Backend:**
```bash
cd backend
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 - Start Frontend:**
```bash
cd frontend/s2s-client
npm start
```

**Open browser:** Navigate to `http://localhost:3000`

## Usage

1. Click **"Start Conversation"** to begin
2. Allow microphone access when prompted
3. **Speak naturally** - AI will listen and respond with voice
4. While AI is speaking, click **"Interrupt AI"** to stop and speak again
5. Click **"End Session"** when done

## Project Structure

```
S2S/
├── backend/
│   ├── main.py                    # FastAPI REST API server
│   ├── gemini_live_client.py      # Gemini Live API client
│   ├── webrtc_handler.py          # WebRTC session manager
│   ├── tools.py                   # Function calling registry
│   ├── pyproject.toml             # Python dependencies (UV)
│   ├── .env.example               # Environment template
│   └── VERTEX_AI_SETUP.md         # GCP setup guide
│
├── frontend/s2s-client/
│   ├── src/
│   │   ├── App.tsx                # Main React component
│   │   ├── components/
│   │   │   └── CircularWaveVisualizer.tsx
│   │   ├── hooks/
│   │   │   └── useGeminiSession.ts
│   │   ├── services/
│   │   │   ├── webrtcService.ts
│   │   │   └── audioProcessor.ts
│   │   └── types/index.ts
│   ├── package.json
│   └── .env
│
├── CLAUDE.md                      # Developer documentation
└── README.md                      # This file
```

## API Endpoints

### Backend REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API status |
| `/health` | GET | Health check with metrics |
| `/errors` | GET | Recent error logs |
| `/api/session/create` | POST | Create new session |
| `/api/session/{id}/offer` | POST | Process SDP offer |
| `/api/session/{id}/ice` | POST | Add ICE candidate |
| `/api/session/{id}/interrupt` | POST | Interrupt AI speech |
| `/api/session/{id}` | DELETE | Close session |

## Audio Specifications

- **Input**: 16kHz mono PCM16 with echo cancellation, noise suppression, auto gain
- **Output**: 24kHz mono PCM16
- **Latency**: < 500ms end-to-end (target)
- **Transport**: WebRTC DataChannel (ordered, no retransmits)

## Function Calling

Add custom functions in `backend/tools.py`:

```python
async def my_custom_function(param: str) -> dict:
    """Your function implementation"""
    return {"result": "..."}

# Register with schema
TOOL_SCHEMAS["my_function"] = {
    "name": "my_function",
    "description": "What this function does",
    "parameters": {
        "type": "object",
        "properties": {
            "param": {"type": "string", "description": "Parameter description"}
        },
        "required": ["param"]
    }
}

# Register in default registry
default_registry.register("my_function", my_custom_function, TOOL_SCHEMAS["my_function"])
```

## Troubleshooting

### No Audio from Gemini
- Check `backend/error_log.txt` for errors
- Verify Gemini Live API is enabled in Google Cloud Console
- Ensure service account has "Vertex AI User" role

### WebRTC Connection Fails
- Verify backend is running on `http://localhost:8000`
- Check microphone permissions in browser
- Review browser console for DataChannel errors

### Frontend Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check `REACT_APP_API_URL` in `.env` points to backend

## Development

- **Backend hot reload**: `uvicorn main:app --reload`
- **Frontend hot reload**: `npm start` (automatic)
- **Logs**: Watch `backend/error_log.txt` and `backend/conversation_log.txt`

## Security

- **Never commit** service account keys or `.env` files
- CORS is set to `*` for development - restrict in production
- Rotate service account keys regularly

## Technologies

- **Frontend**: React 18, TypeScript, WebRTC, Web Audio API
- **Backend**: Python 3.11+, FastAPI, aiortc, websockets
- **AI**: Google Gemini Live API (gemini-live-2.5-flash-native-audio)
- **Package Management**: UV (backend), npm (frontend)

## License

MIT

## Contributing

Contributions welcome! Please read the [CLAUDE.md](CLAUDE.md) for architecture details and development guidelines.

## Acknowledgments

- Google Gemini Live API for native audio processing
- aiortc for Python WebRTC implementation
- React team for the excellent frontend framework
