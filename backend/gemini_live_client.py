"""
Gemini Live API Client
Handles WebSocket connection to Google's Gemini Live API for real-time speech-to-speech
"""

import websockets
import json
import base64
import asyncio
import logging
from typing import Optional, Callable
from datetime import datetime
import traceback as tb

logger = logging.getLogger(__name__)


class GeminiLiveSession:
    """Manages WebSocket connection to Gemini Live API"""

    def __init__(self, project_id: str, region: str, model: str, session_id: str):
        self.project_id = project_id
        self.region = region
        self.model = model
        self.session_id = session_id
        self.gemini_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.response_in_progress = False
        self.on_audio_received: Optional[Callable[[bytes], None]] = None
        self.tools = []

    async def connect(self, access_token: str, project_id: str, region: str):
        """Establish connection to Gemini Live API"""
        try:
            logger.info(f"[{self.session_id}] Connecting to Gemini Live API...")

            # Vertex AI Gemini Live API WebSocket URL
            # Format: wss://{region}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent
            api_host = f"{region}-aiplatform.googleapis.com"
            uri = f"wss://{api_host}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent"

            # Connect with authorization header (OAuth2 Bearer token)
            # Using additional_headers for websockets library compatibility
            headers = {
                "Authorization": f"Bearer {access_token}"
            }

            self.gemini_ws = await websockets.connect(uri, additional_headers=headers)

            # Store project_id and region for model path
            self.project_id = project_id
            self.region = region

            # Send initial setup message
            # Vertex AI model path format: projects/{PROJECT_ID}/locations/{REGION}/publishers/google/models/{MODEL_ID}
            model_path = f"projects/{project_id}/locations/{region}/publishers/google/models/{self.model}"
            setup_message = {
                "setup": {
                    "model": model_path,
                    "generation_config": {
                        "response_modalities": ["AUDIO"],
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {
                                    "voice_name": "Puck"  # Available: Puck, Charon, Kore, Fenrir, Aoede
                                }
                            }
                        }
                    }
                }
            }

            # Add tools if any
            if self.tools:
                setup_message["setup"]["tools"] = self.tools

            await self.gemini_ws.send(json.dumps(setup_message))

            # Wait for setup confirmation
            try:
                response = await asyncio.wait_for(self.gemini_ws.recv(), timeout=10.0)
                data = json.loads(response)

                if "setupComplete" in data:
                    logger.info(f"[{self.session_id}] Gemini Live API connected successfully")
                else:
                    raise Exception(f"Unexpected setup response: {data}")

            except asyncio.TimeoutError:
                raise Exception("Gemini connection timeout (no response after 10 seconds)")

        except websockets.exceptions.InvalidStatusCode as e:
            raise Exception(f"Gemini rejected connection: {e.status_code}")
        except websockets.exceptions.ConnectionClosedError as e:
            raise Exception(f"Gemini connection closed during setup: {e.reason}")
        except Exception as e:
            raise Exception(f"Failed to connect to Gemini: {str(e)}")

    async def send_audio_chunk(self, audio_data: bytes):
        """
        Send audio chunk to Gemini Live API
        Expected format: 16kHz mono PCM16
        """
        try:
            if not self.gemini_ws:
                raise Exception("Not connected to Gemini")

            # Encode audio as base64
            audio_b64 = base64.b64encode(audio_data).decode('utf-8')

            # Send realtime input message
            message = {
                "realtime_input": {
                    "media_chunks": [{
                        "mime_type": "audio/pcm",
                        "data": audio_b64
                    }]
                }
            }

            await self.gemini_ws.send(json.dumps(message))
            logger.info(f"[{self.session_id}] Sent audio chunk to Gemini ({len(audio_data)} bytes)")

        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to send audio: {str(e)}")
            raise

    async def send_end_of_turn(self):
        """
        Send end-of-turn signal to indicate user finished speaking.
        This triggers Gemini to start generating a response.
        """
        try:
            if not self.gemini_ws:
                raise Exception("Not connected to Gemini")

            # Send client content with turn_complete=True
            message = {
                "client_content": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": []
                        }
                    ],
                    "turn_complete": True
                }
            }

            await self.gemini_ws.send(json.dumps(message))
            logger.info(f"[{self.session_id}] Sent end-of-turn signal to Gemini")

        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to send end-of-turn: {str(e)}")
            raise

    async def receive_loop(self):
        """
        Receive messages from Gemini Live API
        Extracts audio (24kHz PCM) and handles function calls
        """
        audio_received = False

        try:
            while True:
                response = await self.gemini_ws.recv()
                data = json.loads(response)

                logger.debug(f"[{self.session_id}] Gemini response: {json.dumps(data)[:200]}")

                # Handle server content (AI responses)
                if "serverContent" in data:
                    server_content = data["serverContent"]

                    # Model turn (AI response with audio/text)
                    if "modelTurn" in server_content:
                        model_turn = server_content["modelTurn"]

                        # Extract parts (audio, text, function calls)
                        if "parts" in model_turn:
                            for part in model_turn["parts"]:
                                # Audio data
                                if "inlineData" in part:
                                    inline_data = part["inlineData"]
                                    if inline_data.get("mimeType") == "audio/pcm":
                                        audio_b64 = inline_data.get("data", "")
                                        if audio_b64:
                                            audio_bytes = base64.b64decode(audio_b64)

                                            # Send to frontend via callback
                                            if self.on_audio_received:
                                                self.on_audio_received(audio_bytes)
                                                audio_received = True

                                            logger.info(
                                                f"[{self.session_id}] Audio chunk from Gemini "
                                                f"({len(audio_bytes)} bytes, 24kHz PCM)"
                                            )

                                # Text transcript (optional)
                                if "text" in part:
                                    text = part["text"]
                                    logger.info(f"[{self.session_id}] AI transcript: {text}")
                                    self.save_conversation("AI", text)

                        # Turn complete flag
                        if server_content.get("turnComplete", False):
                            logger.info(f"[{self.session_id}] AI turn completed")
                            self.response_in_progress = False

                    # Tool call request
                    if "toolCall" in server_content:
                        tool_call = server_content["toolCall"]
                        logger.info(
                            f"[{self.session_id}] Tool call requested: "
                            f"{tool_call.get('functionCalls', [])}"
                        )
                        # TODO: Handle tool calls via callback

                # Setup confirmation
                elif "setupComplete" in data:
                    logger.info(f"[{self.session_id}] Gemini setup completed")

        except websockets.exceptions.ConnectionClosed as e:
            error_msg = f"Gemini connection closed: {e.reason if hasattr(e, 'reason') else str(e)}"
            logger.error(f"[{self.session_id}] {error_msg}")

        except Exception as e:
            error_msg = f"Error in receive loop: {str(e)}"
            logger.error(f"[{self.session_id}] {error_msg}\n{tb.format_exc()}")

        finally:
            if not audio_received:
                logger.warning(
                    f"[{self.session_id}] Session ended without receiving any audio from Gemini"
                )

    async def send_tool_response(self, tool_call_id: str, function_responses: list):
        """Send function call results back to Gemini"""
        try:
            if not self.gemini_ws:
                raise Exception("Not connected to Gemini")

            message = {
                "tool_response": {
                    "function_responses": function_responses
                }
            }

            await self.gemini_ws.send(json.dumps(message))
            logger.info(f"[{self.session_id}] Tool response sent")

        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to send tool response: {str(e)}")
            raise

    async def interrupt(self):
        """Send interrupt signal for barge-in (user interrupts AI)"""
        try:
            if not self.gemini_ws:
                return

            # Clear response in progress flag
            self.response_in_progress = False

            # Note: Gemini Live API may handle interruption automatically
            # when it receives new audio input while responding
            logger.info(f"[{self.session_id}] Interrupt signal processed")

        except Exception as e:
            logger.error(f"[{self.session_id}] Failed to interrupt: {str(e)}")

    def save_conversation(self, role: str, text: str):
        """Save conversation transcript to file"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open("conversation_log.txt", "a", encoding="utf-8") as f:
            f.write(f"\n[{timestamp}] [{self.session_id}] {role}: {text}\n")

    def register_tools(self, tools: list):
        """Register function calling tools"""
        self.tools = tools
        logger.info(f"[{self.session_id}] Registered {len(tools)} tools")

    async def close(self):
        """Close connection to Gemini"""
        if self.gemini_ws:
            await self.gemini_ws.close()
            logger.info(f"[{self.session_id}] Gemini connection closed")
