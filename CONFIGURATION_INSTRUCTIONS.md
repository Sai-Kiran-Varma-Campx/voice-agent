# Configuration Instructions - Fixing WebSocket Connection Issue

## Problem Summary

You were experiencing WebSocket connection failures with this error:
```
WebSocket connected
WebSocket disconnected (code 1000)
```

**Root cause**: The backend couldn't find the service account JSON file (`reference-flux-483913-i6-fd5ae0029859.json`), causing authentication to fail immediately after connection.

## Solution

I've updated the backend to support authentication via **environment variables** instead of requiring a JSON file. This is more secure and flexible.

---

## Setup Instructions

### Step 1: Update your `.env` file

Open `backend/.env` and add these two lines with your actual service account credentials:

```bash
# Service Account Authentication
GCP_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GCP_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

### Step 2: Extract credentials from your JSON file

If you have the service account JSON file somewhere, open it and copy these values:

1. **Find `"client_email"`**: Copy this entire value to `GCP_SERVICE_ACCOUNT_EMAIL`
2. **Find `"private_key"`**: Copy this entire value to `GCP_SERVICE_ACCOUNT_PRIVATE_KEY`

**Important notes about the private key:**
- Keep the quotes around it: `GCP_SERVICE_ACCOUNT_PRIVATE_KEY="..."`
- Keep the `\n` characters (they represent line breaks)
- Copy the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`

### Step 3: Example of correct format

Here's what your `.env` should look like:

```bash
# Google Cloud Configuration
GCP_PROJECT_ID=reference-flux-483913-i6
GCP_REGION=us-central1

# Service Account Authentication (no JSON file needed!)
GCP_SERVICE_ACCOUNT_EMAIL=my-service-account@reference-flux-483913-i6.iam.gserviceaccount.com
GCP_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n...YOUR_FULL_KEY_HERE...\n-----END PRIVATE KEY-----\n"

# Gemini Live API Configuration
GEMINI_MODEL=gemini-live-2.5-flash-native-audio

# Server Configuration
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
```

### Step 4: Comment out or remove the file path

In your `.env`, make sure this line is commented out or removed:
```bash
# SERVICE_ACCOUNT_KEY_PATH=reference-flux-483913-i6-fd5ae0029859.json
```

---

## Testing the Fix

### 1. Restart the backend server

```bash
cd backend
python start_server.py
```

### 2. Check the logs

You should see:
```
INFO - Service account file not found, using environment variables
INFO - Creating credentials for: your-email@project.iam.gserviceaccount.com
INFO - Access token obtained successfully
```

### 3. Try connecting from the frontend

Click "Start Conversation" - it should now work!

---

## Changes Made

### Files Modified:

1. **`backend/auth_utils.py`**
   - Added support for environment variable authentication
   - Now tries JSON file first, falls back to env vars
   - Better error messages

2. **`backend/.env`**
   - Added `GCP_SERVICE_ACCOUNT_EMAIL` and `GCP_SERVICE_ACCOUNT_PRIVATE_KEY` placeholders
   - Commented out `SERVICE_ACCOUNT_KEY_PATH`

3. **`backend/main.py`**
   - Now sends error messages to frontend when connection fails
   - Better logging for debugging

4. **`backend/websocket_handler.py`**
   - Refactored connection logic for better error handling

### New Files Created:

1. **`backend/ENV_SETUP.md`** - Detailed setup guide
2. **`CONFIGURATION_INSTRUCTIONS.md`** - This file (quick reference)

---

## Troubleshooting

### Still getting "WebSocket closed: 1000"?

**Check:**
1. Did you add both `GCP_SERVICE_ACCOUNT_EMAIL` and `GCP_SERVICE_ACCOUNT_PRIVATE_KEY` to `.env`?
2. Did you restart the backend server after updating `.env`?
3. Check `backend/error_log.txt` for detailed error messages

### Error: "Invalid private key"

**Fix:**
- Make sure you copied the entire private key including BEGIN and END lines
- Verify the `\n` characters are present (not actual line breaks)
- Keep the double quotes around the entire key value

### Error: "Missing required environment variables"

**Fix:**
- Check that all three are set:
  - `GCP_PROJECT_ID`
  - `GCP_SERVICE_ACCOUNT_EMAIL`
  - `GCP_SERVICE_ACCOUNT_PRIVATE_KEY`

---

## Security Note

The `.env` file is already in `.gitignore`, so your credentials won't be committed to git. Keep this file secure and never share it publicly.

---

## Next Steps

Once you've updated the `.env` file with your actual credentials:

1. Restart the backend server
2. Open the frontend and click "Start Conversation"
3. Check that the WebSocket stays connected (look for the session ID in browser console)
4. You should now be able to have voice conversations!

If you still have issues, check the browser console and `backend/error_log.txt` for specific error messages.
