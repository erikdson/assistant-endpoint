# Quick Setup Guide

## Environment Configuration

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Update your `.env` file with your OpenAI credentials:**
   ```bash
   # Required
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_ASSISTANT_ID=your_assistant_id_here
   
   # Migration settings (set to enable new API)
   USE_RESPONSES_API=true
   API_AUTO_FALLBACK=true
   
   # Server settings
   PORT=3001
   NODE_ENV=development
   USE_LOCAL_SERVER=true
   ```

## Starting the Server

```bash
# Method 1: Using npm script
npm run dev

# Method 2: Direct node execution
node api/chat.js

# Method 3: With environment override
USE_LOCAL_SERVER=true node api/chat.js
```

## Testing the Setup

1. **Check API capabilities:**
   ```bash
   curl http://localhost:3001/api/version
   ```

2. **Check Responses API health:**
   ```bash
   curl http://localhost:3001/api/responses/health
   ```

3. **Expected responses:**
   - Version endpoint should show both APIs available
   - Health endpoint should return "healthy" status

## Frontend Configuration

Update your frontend environment variables:
```bash
VITE_ASSISTANT_API_BASE=http://localhost:3001/api/chat
VITE_PREFER_RESPONSES_API=true
VITE_ENABLE_AUTO_FALLBACK=true
```

## Troubleshooting

### "OPENAI_API_KEY environment variable is required"
- Ensure your `.env` file is in the project root
- Check that `OPENAI_API_KEY` is set in the `.env` file
- Restart the server after updating environment variables

### Server won't start
- Check if port 3001 is available: `lsof -i :3001`
- Try a different port: `PORT=3002 node api/chat.js`

### API not working
- Verify server is running: `curl http://localhost:3001/api/version`
- Check server logs for errors
- Ensure frontend is pointing to correct backend URL

## Migration Status

✅ **The migration is complete and ready for use!**

- **Legacy Assistant API**: Available at `/api/chat/*`
- **New Responses API**: Available at `/api/responses/*`
- **Automatic Selection**: Use `sendOptimalMessage()` in frontend
- **Backward Compatibility**: All existing code works unchanged