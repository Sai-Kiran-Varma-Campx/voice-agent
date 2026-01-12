from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import logging
from datetime import datetime
import uuid
import os
import asyncio
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2 import service_account

# Load environment variables
load_dotenv()

app = FastAPI(title="Gemini Live API - Speech-to-Speech")

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('error_log.txt'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
GCP_REGION = os.getenv("GCP_REGION", "us-central1")
SERVICE_ACCOUNT_KEY_PATH = os.getenv("SERVICE_ACCOUNT_KEY_PATH", "service-account-key.json")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-live-2.5-flash-native-audio")
BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))

# Session storage
from websocket_handler import WebSocketSession
sessions: Dict[str, WebSocketSession] = {}

# Error tracking
class ErrorTracker:
    def __init__(self):
        self.errors = []
        self.connection_times = {}
        self.response_times = {}

    def log_error(self, session_id: str, error_type: str, error_message: str, details: str = ""):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        error_entry = {
            "timestamp": timestamp,
            "session_id": session_id,
            "error_type": error_type,
            "error_message": error_message,
            "details": details
        }
        self.errors.append(error_entry)

        # Log to file and console
        log_msg = f"[ERROR] [{session_id}] {error_type}: {error_message}"
        if details:
            log_msg += f" | Details: {details}"
        logger.error(log_msg)

        # Write to error log file with full details
        with open("error_log.txt", "a", encoding="utf-8") as f:
            f.write(f"\n{'='*80}\n")
            f.write(f"Timestamp: {timestamp}\n")
            f.write(f"Session ID: {session_id}\n")
            f.write(f"Error Type: {error_type}\n")
            f.write(f"Error Message: {error_message}\n")
            if details:
                f.write(f"Details:\n{details}\n")
            f.write(f"{'='*80}\n")

    def track_connection_start(self, session_id: str):
        self.connection_times[session_id] = datetime.now()

    def track_response_time(self, session_id: str, stage: str):
        if session_id in self.connection_times:
            elapsed = (datetime.now() - self.connection_times[session_id]).total_seconds()
            if elapsed > 10:  # Log if taking more than 10 seconds
                logger.warning(f"[{session_id}] {stage} took {elapsed:.2f} seconds (longer than expected)")
                with open("error_log.txt", "a", encoding="utf-8") as f:
                    f.write(f"\n[WARNING] [{session_id}] {stage} - Response time: {elapsed:.2f}s\n")
            self.response_times[session_id] = elapsed

error_tracker = ErrorTracker()


def get_vertex_ai_access_token():
    """Get access token for Vertex AI authentication"""
    try:
        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_KEY_PATH,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        credentials.refresh(Request())
        return credentials.token
    except Exception as e:
        logger.error(f"Failed to get access token: {str(e)}")
        raise


# API Endpoints

@app.get("/")
async def root():
    return {
        "message": "Gemini Live API - Speech-to-Speech Backend",
        "status": "running",
        "model": GEMINI_MODEL
    }


@app.get("/health")
async def health_check():
    """Health check endpoint with system status"""
    return {
        "status": "running",
        "active_sessions": len(sessions),
        "total_errors": len(error_tracker.errors),
        "gemini_configured": bool(GCP_PROJECT_ID and GCP_REGION),
        "model": GEMINI_MODEL
    }


@app.get("/errors")
async def get_errors():
    """Get recent error log"""
    return {
        "total_errors": len(error_tracker.errors),
        "recent_errors": error_tracker.errors[-20:] if error_tracker.errors else [],
        "error_log_file": "error_log.txt"
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for bidirectional audio streaming

    Message format:
    - Binary messages: Audio data (16kHz mono PCM16)
    - Text messages: Control commands (JSON)
      - {"type": "interrupt"} - Interrupt AI speech
      - {"type": "ping"} - Keep-alive ping
    """
    session_id = str(uuid.uuid4())
    session = None

    try:
        logger.info(f"[{session_id}] New WebSocket connection")

        # Accept the WebSocket connection first
        await websocket.accept()
        logger.info(f"[{session_id}] WebSocket accepted")

        # Create WebSocket session
        session = WebSocketSession(session_id, error_tracker)
        sessions[session_id] = session

        error_tracker.track_connection_start(session_id)

        # Connect to Gemini (this might fail if credentials are wrong)
        try:
            await session.connect_to_gemini(websocket, GCP_PROJECT_ID, GCP_REGION, GEMINI_MODEL)
        except Exception as gemini_error:
            error_msg = str(gemini_error)
            logger.error(f"[{session_id}] Failed to connect to Gemini: {error_msg}")

            # Send error message to frontend before closing
            await websocket.send_json({
                "type": "error",
                "message": f"Failed to connect to Gemini: {error_msg}",
                "details": "Check backend logs for more details. Ensure GCP credentials are configured correctly."
            })

            # Give frontend time to receive the error
            await asyncio.sleep(0.1)
            raise

        # Send session ID to frontend
        await websocket.send_json({"type": "session_id", "session_id": session_id})
        logger.info(f"[{session_id}] Session ID sent to frontend")

        # Keep the connection alive until closed
        while True:
            await asyncio.sleep(1)

    except WebSocketDisconnect:
        logger.info(f"[{session_id}] WebSocket disconnected")
    except Exception as e:
        error_tracker.log_error(session_id, "WEBSOCKET_ERROR", str(e))
        logger.error(f"[{session_id}] WebSocket error: {e}")
    finally:
        # Clean up session
        if session:
            await session.close()
        if session_id in sessions:
            del sessions[session_id]
        logger.info(f"[{session_id}] Session cleaned up")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=BACKEND_HOST, port=BACKEND_PORT)
