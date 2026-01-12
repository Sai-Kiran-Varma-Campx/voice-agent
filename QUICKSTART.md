# Quick Start Guide

## Prerequisites
- ✅ Python 3.11 installed
- ✅ Node.js 18+ installed
- ✅ Google Cloud service account key configured

## Start the Application

### 1. Start Backend (Terminal 1)

```bash
cd backend
start.bat
```

Or alternatively:
```bash
cd backend
"C:\Users\Pranab Bhardwaj\AppData\Local\Programs\Python\Python311\python.exe" start_server.py
```

**Backend will be running on:** `http://localhost:8000`

### 2. Start Frontend (Terminal 2)

```bash
cd frontend/s2s-client
npm start
```

**Frontend will open automatically at:** `http://localhost:3000`

## How to Use

1. **Click "Start Conversation"** - Initializes WebRTC connection and Gemini Live API
2. **Allow microphone access** when prompted by your browser
3. **Speak naturally** - Your voice is captured at 16kHz and sent to Gemini
4. **Listen to AI response** - Gemini responds with voice at 24kHz
5. **Interrupt if needed** - Click "Interrupt AI" button to stop AI and speak again
6. **End session** - Click "End Session" when done

## Verify Backend

Check backend health:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "running",
  "active_sessions": 0,
  "total_errors": 0,
  "gemini_configured": true,
  "model": "gemini-2.0-flash-exp"
}
```

## Features

- ✅ Real-time speech-to-speech conversation
- ✅ Circular frequency visualization
- ✅ Voice interruption (barge-in)
- ✅ Function calling support
- ✅ Low-latency WebRTC DataChannel
- ✅ Auto-reload for development

## Troubleshooting

### Backend won't start
- Ensure Python 3.11 is being used
- Check `.env` file is configured with GCP credentials
- Verify service account key exists

### Frontend can't connect
- Ensure backend is running on port 8000
- Check `frontend/s2s-client/.env` has correct API URL
- Verify CORS settings in backend

### No audio from Gemini
- Check browser microphone permissions
- Verify Gemini Live API is enabled in Google Cloud Console
- Check `backend/error_log.txt` for errors
- Ensure service account has "Vertex AI User" role

## File Locations

- **Backend logs**: `backend/error_log.txt`
- **Conversation transcripts**: `backend/conversation_log.txt`
- **Environment config**: `backend/.env`
- **Service account key**: `backend/gen-lang-client-0651053089-b8cae17922f3.json`

## API Endpoints

- `GET /` - API status
- `GET /health` - Health check
- `GET /errors` - Recent errors
- `POST /api/session/create` - Create session
- `POST /api/session/{id}/offer` - WebRTC offer
- `POST /api/session/{id}/ice` - ICE candidate
- `POST /api/session/{id}/interrupt` - Interrupt AI
- `DELETE /api/session/{id}` - Close session

## Development

- **Backend auto-reload**: Enabled by default
- **Frontend hot-reload**: Enabled via React dev server
- **Modify tools**: Edit `backend/tools.py`
- **Customize UI**: Edit `frontend/s2s-client/src/App.tsx`
