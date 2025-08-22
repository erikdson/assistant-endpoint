import express from 'express';
import ConversationService from '../services/conversation-service.js';

const router = express.Router();

// Lazy-load conversation service to ensure dotenv is loaded first
let conversationService = null;
function getConversationService() {
  if (!conversationService) {
    conversationService = new ConversationService();
  }
  return conversationService;
}

/**
 * NEW RESPONSES API ENDPOINTS
 * Modern streaming-first approach using OpenAI's Responses API
 */

// Create a new streaming conversation using Responses API
router.post('/create', async (req, res) => {
  try {
    console.log('[Responses API] /create - Starting new conversation');
    
    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    const { message, requirements = {}, context = {}, systemInstructions } = req.body;

    if (!message) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'Message is required' 
      })}\\n\\n`);
      return res.end();
    }

    // Send initial status
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      status: 'starting',
      api: 'responses'
    })}\\n\\n`);

    // Build messages for true Responses API
    const messages = [];
    
    // Add system message with context
    if (systemInstructions || Object.keys(requirements).length > 0) {
      const systemContent = getConversationService().buildSystemMessage(systemInstructions, requirements, context);
      messages.push({
        role: 'system',
        content: systemContent
      });
    }
    
    // Add user message
    messages.push({
      role: 'user',
      content: message
    });

    // Get all available tools
    const allTools = getConversationService().tools.getAllTools();
    
    // Create true streaming response using Responses API
    const response = await getConversationService().openai.createResponse(messages, allTools, 'gpt-4o');
    
    // Process streaming response using Node.js streams
    let buffer = '';
    let completed = false;
    let toolCallsBuffer = {}; // Track accumulated tool calls
    
    // Handle the stream data
    response.body.on('data', async (chunk) => {
      const chunkStr = chunk.toString();
      console.log('[Responses API] Raw chunk received:', JSON.stringify(chunkStr.substring(0, 200)));
      
      buffer += chunkStr;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      console.log('[Responses API] Processing', lines.length, 'lines');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          console.log('[Responses API] Raw SSE data:', JSON.stringify(data.substring(0, 100)));
          
          if (data === '[DONE]') {
            console.log('[Responses API] Received [DONE] signal');
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            console.log('[Responses API] Parsed OpenAI data:', {
              choices: parsed.choices?.length,
              firstChoice: parsed.choices?.[0] ? {
                delta: parsed.choices[0].delta,
                finishReason: parsed.choices[0].finish_reason
              } : null
            });
            
            if (parsed.choices && parsed.choices[0]) {
              const choice = parsed.choices[0];
              
              // Send content deltas for true word-by-word streaming
              if (choice.delta?.content) {
                const content = choice.delta.content;
                console.log('[Responses API] Sending content delta:', JSON.stringify(content));
                
                // Enhanced debugging for newlines
                const containsNewlines = content.includes('\n');
                const containsDoubleNewlines = content.includes('\n\n');
                const newlineCount = (content.match(/\n/g) || []).length;
                console.log('[Responses API] Content analysis:', {
                  length: content.length,
                  containsNewlines,
                  containsDoubleNewlines,
                  newlineCount,
                  charCodes: content.split('').map(c => c.charCodeAt(0))
                });
                
                const contentMessage = { 
                  type: 'content', 
                  text: content
                };
                console.log('[Responses API] SSE message:', JSON.stringify(contentMessage));
                res.write(`data: ${JSON.stringify(contentMessage)}\\n\\n`);
              }
              
              // Handle tool calls (streaming accumulation)
              if (choice.delta?.tool_calls) {
                for (const toolCall of choice.delta.tool_calls) {
                  const { index, id, function: func } = toolCall;
                  
                  // Initialize tool call buffer if not exists
                  if (!toolCallsBuffer[index]) {
                    toolCallsBuffer[index] = {
                      id: id || '',
                      function: {
                        name: '',
                        arguments: ''
                      }
                    };
                  }
                  
                  // Accumulate tool call data
                  if (id) {
                    toolCallsBuffer[index].id = id;
                  }
                  
                  if (func?.name) {
                    toolCallsBuffer[index].function.name += func.name;
                    console.log('[Responses API] Tool call started:', func.name);
                    res.write(`data: ${JSON.stringify({ 
                      type: 'tool_start',
                      toolId: toolCallsBuffer[index].id,
                      toolName: func.name
                    })}\\n\\n`);
                  }
                  
                  if (func?.arguments) {
                    toolCallsBuffer[index].function.arguments += func.arguments;
                  }
                }
              }
              
              // Handle completion
              if (choice.finish_reason) {
                console.log('[Responses API] Finish reason:', choice.finish_reason);
                
                // Process accumulated tool calls if any
                if (choice.finish_reason === 'tool_calls' && Object.keys(toolCallsBuffer).length > 0) {
                  res.write(`data: ${JSON.stringify({ 
                    type: 'status',
                    status: 'processing_tools'
                  })}\\n\\n`);
                  
                  // Execute all accumulated tool calls
                  for (const [index, toolCall] of Object.entries(toolCallsBuffer)) {
                    try {
                      const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                      const toolResult = await getConversationService().tools.executeCustomTool(
                        toolCall.function.name, 
                        toolArgs
                      );
                      
                      console.log('[Responses API] Tool result for', toolCall.function.name, ':', toolResult);
                      res.write(`data: ${JSON.stringify({ 
                        type: 'tool_result',
                        toolId: toolCall.id,
                        toolName: toolCall.function.name,
                        result: toolResult
                      })}\\n\\n`);
                    } catch (toolError) {
                      console.error('[Responses API] Tool execution error:', toolError);
                      res.write(`data: ${JSON.stringify({ 
                        type: 'tool_result',
                        toolId: toolCall.id,
                        toolName: toolCall.function.name,
                        result: { error: toolError.message }
                      })}\\n\\n`);
                    }
                  }
                }
                
                res.write(`data: ${JSON.stringify({ 
                  type: 'status',
                  status: choice.finish_reason === 'stop' ? 'completed' : 'tool_calls_completed'
                })}\\n\\n`);
                
                // Mark as completed and send done message
                if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
                  res.write(`data: ${JSON.stringify({ type: 'done' })}\\n\\n`);
                  completed = true;
                  console.log('[Responses API] Sent done message on finish_reason:', choice.finish_reason);
                }
              }
            }
          } catch (parseError) {
            console.error('[Responses API] Parse error:', parseError);
          }
        }
      }
    });
    
    response.body.on('end', () => {
      console.log('[Responses API] Stream ended, completed:', completed);
      // Send final done message only if not already sent
      if (!completed) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\\n\\n`);
        console.log('[Responses API] Sent done message on end');
      }
      res.end();
    });
    
    response.body.on('error', (error) => {
      console.error('[Responses API] Stream error:', error);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: error.message 
      })}\\n\\n`);
      res.end();
    });

    // Note: Completion is handled in the 'end' event above

  } catch (error) {
    console.error('[Responses API] /create error:', error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: error.message || 'Conversation failed' 
    })}\\n\\n`);
    res.end();
  }
});

// Continue an existing conversation (for multi-turn conversations)
router.post('/continue', async (req, res) => {
  try {
    console.log('[Responses API] /continue - Continuing conversation');
    
    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const { message, conversationHistory = [], requirements = {}, context = {} } = req.body;

    if (!message) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'Message is required' 
      })}\\n\\n`);
      return res.end();
    }

    // Build messages from conversation history
    const messages = [...conversationHistory];
    messages.push({
      role: 'user',
      content: message
    });

    // Send initial status
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      status: 'processing',
      api: 'responses'
    })}\\n\\n`);

    // Get tools and create response
    const allTools = getConversationService().tools.getAllTools();
    const response = await getConversationService().openai.createResponse(messages, allTools);

    // Process streaming response (same as /create)
    await getConversationService().processStreamingResponse(response, async (chunk) => {
      if (chunk.choices && chunk.choices[0]) {
        const choice = chunk.choices[0];
        
        if (choice.delta?.content) {
          res.write(`data: ${JSON.stringify({ 
            type: 'content', 
            text: choice.delta.content
          })}\\n\\n`);
        }
        
        // Handle tool calls and other events...
        // (Implementation similar to /create endpoint)
      }
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\\n\\n`);
    res.end();

  } catch (error) {
    console.error('[Responses API] /continue error:', error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: error.message 
    })}\\n\\n`);
    res.end();
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    api: 'responses',
    timestamp: new Date().toISOString()
  });
});

// Feature flag check
router.get('/enabled', (req, res) => {
  res.json({ 
    enabled: process.env.USE_RESPONSES_API === 'true',
    fallback: process.env.USE_RESPONSES_API !== 'true' ? 'assistant-api' : null
  });
});

// Debug endpoint to test markdown rendering with controlled content
router.post('/debug-markdown', (req, res) => {
  console.log('[Responses API] /debug-markdown - Testing markdown rendering');
  
  // Set up Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  // Send initial status
  res.write(`data: ${JSON.stringify({ 
    type: 'status', 
    status: 'starting',
    api: 'responses'
  })}\\n\\n`);

  // Test markdown content with various formatting (using actual newlines)
  const testContent = [
    'Here are your current consolidated requirements',
    ':',
    String.fromCharCode(10, 10), // Explicit double newlines  
    '-',
    ' Load Capacity',
    ':',
    ' ',
    '4500',
    ' kg',
    String.fromCharCode(10), // Explicit single newline
    '-',
    ' Lift Height',
    ':',
    ' ',
    '3600',
    ' mm',
    String.fromCharCode(10, 10), // Explicit double newlines
    'These are the final active requirements after merging from all applicable levels.'
  ];

  let index = 0;
  const sendNext = () => {
    if (index < testContent.length) {
      const content = testContent[index];
      console.log(`[Responses API] Debug sending token ${index + 1}/${testContent.length}:`, JSON.stringify(content));
      
      // Enhanced debugging for each token
      const containsNewlines = content.includes('\n');
      const containsDoubleNewlines = content.includes('\n\n');
      const newlineCount = (content.match(/\n/g) || []).length;
      console.log('[Responses API] Token analysis:', {
        tokenIndex: index + 1,
        length: content.length,
        containsNewlines,
        containsDoubleNewlines,
        newlineCount,
        charCodes: content.split('').map(c => c.charCodeAt(0))
      });

      const contentMessage = { 
        type: 'content', 
        text: content
      };
      res.write(`data: ${JSON.stringify(contentMessage)}\\n\\n`);
      
      index++;
      setTimeout(sendNext, 100); // Delay to simulate streaming
    } else {
      // Send completion
      res.write(`data: ${JSON.stringify({ 
        type: 'status',
        status: 'completed'
      })}\\n\\n`);
      
      res.write(`data: ${JSON.stringify({ type: 'done' })}\\n\\n`);
      console.log('[Responses API] Debug markdown test completed');
      res.end();
    }
  };

  sendNext();
});

export default router;