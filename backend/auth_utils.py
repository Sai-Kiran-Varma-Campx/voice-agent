"""
Authentication utilities for Google Cloud
"""

import logging
import os
import json
from google.auth.transport.requests import Request
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

# Get from environment
SERVICE_ACCOUNT_KEY_PATH = os.getenv("SERVICE_ACCOUNT_KEY_PATH")


def get_vertex_ai_access_token():
    """
    Get access token for Vertex AI authentication

    Supports two methods:
    1. Service account JSON file (if SERVICE_ACCOUNT_KEY_PATH is set and file exists)
    2. Environment variables (if GCP_SERVICE_ACCOUNT_* variables are set)
    """
    try:
        # Method 1: Try to use service account JSON file
        if SERVICE_ACCOUNT_KEY_PATH and os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
            logger.info(f"Using service account file: {SERVICE_ACCOUNT_KEY_PATH}")
            credentials = service_account.Credentials.from_service_account_file(
                SERVICE_ACCOUNT_KEY_PATH,
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            credentials.refresh(Request())
            return credentials.token

        # Method 2: Use environment variables to construct credentials
        logger.info("Service account file not found, using environment variables")

        # Get required fields from environment
        project_id = os.getenv("GCP_PROJECT_ID")
        client_email = os.getenv("GCP_SERVICE_ACCOUNT_EMAIL")
        private_key = os.getenv("GCP_SERVICE_ACCOUNT_PRIVATE_KEY")

        if not all([project_id, client_email, private_key]):
            raise ValueError(
                "Missing required environment variables. Please set either:\n"
                "1. SERVICE_ACCOUNT_KEY_PATH (path to JSON file), OR\n"
                "2. GCP_SERVICE_ACCOUNT_EMAIL and GCP_SERVICE_ACCOUNT_PRIVATE_KEY"
            )

        # Construct service account info dictionary
        service_account_info = {
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key.replace('\\n', '\n'),  # Handle escaped newlines
            "client_email": client_email,
            "token_uri": "https://oauth2.googleapis.com/token",
        }

        logger.info(f"Creating credentials for: {client_email}")

        # Create credentials from the info dictionary
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )

        credentials.refresh(Request())
        logger.info("Access token obtained successfully")
        return credentials.token

    except Exception as e:
        logger.error(f"Failed to get access token: {str(e)}")
        raise
