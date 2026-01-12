# Environment Setup Guide

## Authentication Configuration

The backend now supports **two authentication methods** for Google Cloud / Vertex AI:

### Option 1: Service Account JSON File (Traditional)
1. Download your service account JSON file from Google Cloud Console
2. Place it in the `backend/` directory
3. Set the path in `.env`:
```bash
SERVICE_ACCOUNT_KEY_PATH=your-service-account-file.json
```

### Option 2: Environment Variables (Recommended for Security)
1. Open your service account JSON file
2. Copy the following values to your `.env` file:

From the JSON file, find these fields:
- `"client_email"` → Copy to `GCP_SERVICE_ACCOUNT_EMAIL`
- `"private_key"` → Copy to `GCP_SERVICE_ACCOUNT_PRIVATE_KEY`

**Example `.env` configuration:**

```bash
# Google Cloud Configuration
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1

# Service Account - Use environment variables (no JSON file needed!)
GCP_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GCP_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### Important Notes for Private Key:

1. **Keep the quotes** around the private key value
2. **Keep the `\n` characters** - they represent newlines
3. The private key should be **one long line** with `\n` for line breaks
4. Make sure to copy the **entire key** including:
   - `-----BEGIN PRIVATE KEY-----`
   - The key content
   - `-----END PRIVATE KEY-----`

### Example of properly formatted private key in .env:

```bash
GCP_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC1234567890abc\ndefghijklmnopqrstuvwxyz1234567890abcdefghijklmnop\n...rest of key...\n-----END PRIVATE KEY-----\n"
```

## How to Extract Values from JSON File

If you have the service account JSON file, here's how to extract the values:

```bash
# On Linux/Mac/Windows Git Bash:
cat reference-flux-483913-i6-fd5ae0029859.json | grep "client_email"
cat reference-flux-483913-i6-fd5ae0029859.json | grep -A 50 "private_key"

# Or open the JSON file in a text editor and copy:
# - The "client_email" value
# - The entire "private_key" value (keep \n characters!)
```

## Testing Your Configuration

After updating `.env`, test the authentication:

```bash
# Start the backend server
python start_server.py

# In another terminal, check if it connects:
curl http://localhost:8000/health
```

If authentication is working, you should see:
```json
{
  "status": "running",
  "active_sessions": 0,
  "gemini_configured": true
}
```

## Troubleshooting

### Error: "Failed to get access token"

**Check:**
1. You've set either `SERVICE_ACCOUNT_KEY_PATH` OR both `GCP_SERVICE_ACCOUNT_EMAIL` and `GCP_SERVICE_ACCOUNT_PRIVATE_KEY`
2. The private key is properly formatted (with `\n` characters and quotes)
3. The service account has "Vertex AI User" role in Google Cloud
4. The project ID matches your Google Cloud project

### Error: "Invalid private key"

**Fix:**
- Make sure you copied the **entire** private key including BEGIN and END markers
- Verify the `\n` characters are present (not actual newlines)
- Keep the quotes around the value

### Still having issues?

Check the backend logs:
```bash
cat backend/error_log.txt
```

Or check the server console output for detailed error messages.
