# Vertex AI Integration Setup Guide

This guide will help you set up Vertex AI for real-time bidirectional conversation in your backend.

## Prerequisites

- Google Cloud Platform (GCP) account
- GCP Project with billing enabled
- Python 3.8 or higher

## Step 1: Enable Vertex AI API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** > **Library**
4. Search for "Vertex AI API"
5. Click **Enable**

## Step 2: Create Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Enter a name (e.g., "vertex-ai-live-api")
4. Click **Create and Continue**
5. Add the following roles:
   - `Vertex AI User` or `Vertex AI Administrator`
   - `Service Account Token Creator` (if needed)
6. Click **Continue** and then **Done**

## Step 3: Create Service Account Key

1. Click on the newly created service account
2. Go to the **Keys** tab
3. Click **Add Key** > **Create new key**
4. Select **JSON** format
5. Click **Create**
6. The JSON key file will be downloaded to your computer
7. **IMPORTANT**: Keep this file secure! It contains credentials to access your GCP resources

## Step 4: Move Service Account Key

1. Rename the downloaded JSON file to `service-account-key.json`
2. Move it to your backend directory: `e:\backend\service-account-key.json`
3. **Never commit this file to version control!** (already added to `.gitignore` if you have one)

## Step 5: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your GCP details:
   ```env
   GCP_PROJECT_ID=your-actual-project-id
   GCP_REGION=us-central1
   SERVICE_ACCOUNT_KEY_PATH=service-account-key.json
   VERTEX_AI_MODEL=gemini-2.0-flash-exp
   ```

   To find your Project ID:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - The Project ID is shown in the project selector at the top

## Step 6: Install Dependencies

```bash
cd e:\backend
pip install -r requirements.txt
```

## Step 7: Load Environment Variables

### Option A: Using python-dotenv (Recommended)

1. Install python-dotenv:
   ```bash
   pip install python-dotenv
   ```

2. Add this to the top of [main.py](main.py) (after imports):
   ```python
   from dotenv import load_dotenv
   load_dotenv()
   ```

### Option B: Manual export (Linux/Mac)

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export SERVICE_ACCOUNT_KEY_PATH=service-account-key.json
```

### Option C: Manual set (Windows)

```cmd
set GCP_PROJECT_ID=your-project-id
set GCP_REGION=us-central1
set SERVICE_ACCOUNT_KEY_PATH=service-account-key.json
```

## Step 8: Test the Setup

1. Start the backend server:
   ```bash
   python main.py
   ```

2. Check the health endpoint:
   ```bash
   curl http://localhost:8000/health
   ```

   You should see:
   ```json
   {
     "status": "running",
     "active_sessions": 0,
     "total_errors": 0,
     "vertex_ai_configured": true
   }
   ```

   If `vertex_ai_configured` is `false`, check your environment variables.

## Step 9: Verify Vertex AI Connection

Connect your frontend WebRTC client to the backend. The logs should show:

```
[session-id] Connecting to Vertex AI...
[session-id] Vertex AI connected successfully
```

## Troubleshooting

### Error: "Failed to get access token"

- Check that the service account key file exists at the specified path
- Verify the JSON file is valid
- Ensure the service account has the correct permissions

### Error: "Vertex AI rejected connection: 403"

- The service account doesn't have the required permissions
- Add the "Vertex AI User" role to your service account

### Error: "Vertex AI connection timeout"

- Check your internet connection
- Verify the GCP_REGION is correct
- Ensure Vertex AI API is enabled in your project

### Error: "Module not found: google.auth"

- Install dependencies: `pip install -r requirements.txt`

## Available Regions

Vertex AI is available in these regions:

- `us-central1` (Iowa)
- `us-east1` (South Carolina)
- `us-west1` (Oregon)
- `europe-west1` (Belgium)
- `europe-west4` (Netherlands)
- `asia-northeast1` (Tokyo)
- `asia-southeast1` (Singapore)

Choose the region closest to your users for best performance.

## Security Best Practices

1. **Never commit** `service-account-key.json` to version control
2. **Never commit** `.env` file to version control
3. Add both to `.gitignore`:
   ```
   service-account-key.json
   .env
   ```
4. Use environment-specific service accounts (dev, staging, production)
5. Rotate service account keys regularly
6. Use least-privilege principle (only grant necessary permissions)

## Cost Considerations

Vertex AI charges based on:
- API calls
- Audio processing time
- Model usage

Monitor your usage in the [GCP Billing Dashboard](https://console.cloud.google.com/billing).

## Next Steps

- Configure CORS settings if needed
- Set up monitoring and logging
- Implement rate limiting
- Add authentication for your WebRTC endpoints
- Deploy to production environment

## Resources

- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Gemini API Reference](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
