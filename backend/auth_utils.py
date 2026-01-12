"""
Authentication utilities for Google Cloud
"""

import logging
import os
from google.auth.transport.requests import Request
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

# Get from environment
SERVICE_ACCOUNT_KEY_PATH = os.getenv("SERVICE_ACCOUNT_KEY_PATH", "service-account-key.json")


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
