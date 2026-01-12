"""
WebSocket Handler for Frontend-Backend Communication
Manages WebSocket connections for bidirectional audio streaming
"""

import asyncio
import logging
import json
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect
from gemini_live_client import GeminiLiveSession
from auth_utils import get_vertex_ai_access_token

logger = logging.getLogger(__name__)


class WebSocketSession:
    """Manages WebSocket connection between frontend and backend"""

    def __init__(self, session_id: str, error_tracker):
        self.session_id = session_id
        self.error_tracker = error_tracker
        self.websocket: Optional[WebSocket] = None
        self.gemini_session: Optional[GeminiLiveSession] = None
        self.receive_task: Optional[asyncio.Task] = None
        self.gemini_receive_task: Optional[asyncio.Task] = None

    async def connect_to_gemini(self, websocket: WebSocket, project_id: str, region: str, model: str):
        """
        Connect to Gemini Live API (WebSocket is already accepted)
        """
        try:
            # Store WebSocket reference
            self.websocket = websocket
            logger.info(f"[{self.session_id}] Connecting to Gemini Live API...")

            # Create Gemini session
            self.gemini_session = GeminiLiveSession(project_id, region, model, self.session_id)

            # Set callback for received audio from Gemini
            self.gemini_session.on_audio_received = self.send_audio_to_frontend

            # Get access token
            access_token = get_vertex_ai_access_token()

            # Connect to Gemini Live API
            await self.gemini_session.connect(access_token, project_id, region)

            logger.info(f"[{self.session_id}] Connected to Gemini Live API")

            # Start receive loops
            self.receive_task = asyncio.create_task(self.receive_from_frontend())
            self.gemini_receive_task = asyncio.create_task(self.gemini_session.receive_loop())

        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to connect: {e}")
            raise

    async def receive_from_frontend(self):
        """
        Receive messages from frontend WebSocket
        Expected format:
        - Binary messages: Audio data (16kHz PCM16)
        - Text messages: Control commands (JSON)
        """
        try:
            while True:
                message = await self.websocket.receive()

                # Handle binary audio data
                if "bytes" in message:
                    audio_data = message["bytes"]
                    logger.debug(f"[{self.session_id}] Received {len(audio_data)} bytes from frontend")

                    # Forward to Gemini
                    if self.gemini_session:
                        await self.gemini_session.send_audio_chunk(audio_data)

                # Handle text control messages
                elif "text" in message:
                    try:
                        data = json.loads(message["text"])
                        command = data.get("type")

                        if command == "interrupt":
                            logger.info(f"[{self.session_id}] Interrupt command received")
                            if self.gemini_session:
                                await self.gemini_session.interrupt()
                            await self.websocket.send_json({"type": "interrupted"})

                        elif command == "end_of_turn":
                            logger.info(f"[{self.session_id}] End-of-turn signal received")
                            if self.gemini_session:
                                await self.gemini_session.send_end_of_turn()
                            await self.websocket.send_json({"type": "turn_ended"})

                        elif command == "ping":
                            await self.websocket.send_json({"type": "pong"})

                    except json.JSONDecodeError:
                        logger.warning(f"[{self.session_id}] Invalid JSON received: {message['text']}")

        except WebSocketDisconnect:
            logger.info(f"[{self.session_id}] Frontend WebSocket disconnected")
        except Exception as e:
            logger.error(f"[{self.session_id}] Error receiving from frontend: {e}")
            self.error_tracker.log_error(
                self.session_id,
                "WEBSOCKET_RECEIVE_ERROR",
                str(e)
            )

    def send_audio_to_frontend(self, audio_data: bytes):
        """
        Send audio chunk to frontend via WebSocket
        Audio format: 24kHz mono PCM16
        """
        try:
            if self.websocket:
                # Send as binary WebSocket message
                asyncio.create_task(self.websocket.send_bytes(audio_data))
                logger.debug(
                    f"[{self.session_id}] Sent {len(audio_data)} bytes to frontend (24kHz PCM)"
                )
        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to send audio to frontend: {e}")

    async def interrupt(self):
        """Handle user interrupt (barge-in)"""
        try:
            if self.gemini_session:
                await self.gemini_session.interrupt()
            logger.info(f"[{self.session_id}] User interrupted AI")
        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to interrupt: {e}")

    async def close(self):
        """Close WebSocket and Gemini connections"""
        try:
            # Cancel receive tasks
            if self.receive_task:
                self.receive_task.cancel()
                try:
                    await self.receive_task
                except asyncio.CancelledError:
                    pass

            if self.gemini_receive_task:
                self.gemini_receive_task.cancel()
                try:
                    await self.gemini_receive_task
                except asyncio.CancelledError:
                    pass

            # Close Gemini connection
            if self.gemini_session:
                await self.gemini_session.close()

            # Close WebSocket
            if self.websocket:
                try:
                    await self.websocket.close()
                except Exception:
                    pass

            logger.info(f"[{self.session_id}] WebSocket session closed")

        except Exception as e:
            logger.error(f"[{self.session_id}] Error closing session: {e}")
