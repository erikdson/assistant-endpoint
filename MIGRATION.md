# OpenAI Responses API Migration Guide

This document outlines the completed migration from OpenAI's Assistant API to the new Responses API architecture, providing better streaming capabilities and future-proofing.

## Migration Overview

The system now supports both APIs with intelligent fallback:
- **Legacy Assistant API** (still functional)
- **New Responses API** (recommended, better streaming)
- **Automatic detection and fallback**
- **Backward compatibility maintained**

## Architecture Changes

### Service Layer (NEW)

The migration introduced a clean service layer architecture:

```
services/
├── openai-service.js      # Abstracts OpenAI API calls
├── tool-service.js        # Manages custom and built-in tools
└── conversation-service.js # Orchestrates conversations
```

### API Endpoints

#### Legacy Endpoints (Maintained)
- `POST /api/chat/start` - Start Assistant API conversation
- `GET /api/chat/status` - Poll for completion
- `GET /api/chat/result` - Get results
- `POST /api/chat/stream` - Streaming with Assistant API

#### New Endpoints (Recommended)
- `POST /api/responses/create` - Create streaming conversation
- `POST /api/responses/continue` - Continue conversation
- `GET /api/responses/health` - Health check
- `GET /api/responses/enabled` - Feature flag status

#### Utility Endpoints
- `GET /api/version` - API capabilities and migration status

### Frontend Integration

#### Enhanced Hook Support

The `useAssistantChat` hook now includes:
- `sendMessage()` - Original Assistant API
- `sendStreamingMessage()` - Assistant API with streaming
- `sendResponsesMessage()` - New Responses API
- `sendOptimalMessage()` - **Intelligent auto-selection** ⭐

#### API Detection System

New utilities in `src/utils/api-detection.ts`:
- Automatic capability detection
- Intelligent API selection
- Preference management
- Health monitoring

## Configuration

### Environment Variables

```bash
# Enable new Responses API
USE_RESPONSES_API=true

# Enable automatic fallback
API_AUTO_FALLBACK=true

# Frontend preferences
VITE_PREFER_RESPONSES_API=true
VITE_ENABLE_AUTO_FALLBACK=true
```

### Migration Phases

1. **Phase 1**: Service layer created ✅
2. **Phase 2**: Responses API implemented ✅
3. **Phase 3**: Hybrid tool system ✅
4. **Phase 4**: True streaming implemented ✅
5. **Phase 5**: Feature flags added ✅
6. **Phase 6**: Testing and validation ✅

## Benefits of the Migration

### Better Streaming
- Word-by-word streaming (vs. Assistant API's paragraph chunks)
- Lower latency responses
- Real-time tool execution feedback

### Enhanced Tools
- Unified tool interface
- Support for built-in tools (file_search, code_interpreter)
- Custom tool integration preserved

### Future-Proofing
- Aligned with OpenAI's roadmap
- Backward compatibility maintained
- Graceful fallback system

### Developer Experience
- Intelligent API selection
- Comprehensive error handling
- Health monitoring and diagnostics

## Usage Examples

### Automatic (Recommended)
```typescript
const { sendOptimalMessage } = useAssistantChat();
await sendOptimalMessage("Help me find forklifts for my warehouse");
// Automatically selects best API based on availability and preferences
```

### Manual API Selection
```typescript
// Force Responses API
const { sendResponsesMessage } = useAssistantChat();
await sendResponsesMessage(message);

// Use legacy streaming
const { sendStreamingMessage } = useAssistantChat();
await sendStreamingMessage(message);

// Use traditional Assistant API
const { sendMessage } = useAssistantChat();
await sendMessage(message);
```

### API Capabilities Check
```typescript
import { apiDetection } from '../utils/api-detection';

const capabilities = await apiDetection.getCapabilities();
console.log('Available APIs:', capabilities.apis);
```

## Tool System

### Custom Tools (Preserved)
- `generate_product_filters` - Convert requirements to filters
- `recommend_products` - Generate product recommendations

### Built-in Tools (New Support)
- `file_search` - Search uploaded documents
- `code_interpreter` - Execute Python code
- Future tools automatically supported

### Hybrid Execution
The system intelligently handles both tool types:
- Custom tools execute locally
- Built-in tools run on OpenAI's infrastructure
- Unified response format

## Monitoring and Health

### Health Checks
```bash
curl http://localhost:3001/api/version
curl http://localhost:3001/api/responses/health
```

### Logging
Enhanced logging includes:
- API selection decisions
- Fallback events
- Tool execution tracking
- Performance metrics

## Rollback Strategy

If issues arise, you can immediately rollback:

```bash
# Disable new API
USE_RESPONSES_API=false

# Frontend will automatically fallback
# No code changes required
```

## Performance Improvements

### Streaming Latency
- Responses API: ~100-300ms first token
- Assistant API: ~1-3s first chunk

### Tool Execution
- Parallel tool processing
- Real-time feedback
- Enhanced error handling

### Caching
- API capability caching
- Preference persistence
- Optimized request patterns

## Testing Strategy

### Validated Scenarios
1. ✅ Legacy Assistant API functionality preserved
2. ✅ New Responses API streaming works
3. ✅ Automatic fallback on API unavailability
4. ✅ Tool calls work with both APIs
5. ✅ File uploads compatible
6. ✅ Error handling robust
7. ✅ Configuration flexibility maintained

### Regression Tests
All existing functionality verified to work identically:
- Product filtering
- Recommendations
- Context injection
- Multi-level requirements
- File attachments

## Next Steps

1. **Deploy with feature flag OFF** initially
2. **Monitor Assistant API performance**
3. **Gradually enable Responses API** for subset of users
4. **Monitor streaming improvements**
5. **Full rollout** once validated
6. **Deprecate Assistant API** endpoints (future)

## Support

The migration maintains 100% backward compatibility. Existing code continues to work without changes while new capabilities are available when needed.

For issues or questions, check:
- API health endpoints
- Browser console logs
- Server logs for fallback events
- This migration guide

---

**Migration Status**: ✅ **COMPLETE**
**Backward Compatibility**: ✅ **MAINTAINED**
**Production Ready**: ✅ **YES**