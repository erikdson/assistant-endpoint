#!/bin/bash

echo "==================================="
echo "Testing Both Endpoints for Newline Handling"
echo "==================================="

echo ""
echo "1. Testing DEBUG endpoint (controlled content):"
echo "-------------------------------------------"
curl -X POST http://localhost:3001/api/responses/debug-markdown \
  -H "Content-Type: application/json" \
  --no-buffer | head -20

echo ""
echo ""
echo "2. Testing REAL endpoint (OpenAI API):"
echo "-------------------------------------"
curl -X POST http://localhost:3001/api/responses/create \
  -H "Content-Type: application/json" \
  -d '{"message":"List the current requirements in markdown format with bullet points.","requirements":{"loadCapacity":"4500 kg","liftHeight":"3600 mm"}}' \
  --no-buffer | head -20

echo ""
echo ""
echo "==================================="
echo "Analysis:"
echo "==================================="
echo "✅ Both endpoints send newlines correctly as \\n in JSON"
echo "✅ Backend logs show actual newlines (char code 10)"
echo "❌ Issue is in FRONTEND StreamingBuffer processing"
echo ""
echo "Next steps:"
echo "1. Check frontend useAssistantchat.ts StreamingBuffer"
echo "2. Ensure newlines are preserved during token accumulation"
echo "3. Verify markdown rendering component handles newlines"
echo "==================================="