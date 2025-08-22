import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import multer from 'multer';
import { FormData } from 'formdata-node';
import { products, getProductById, getProductsByFilters } from '../products.js';
import ToolService from '../services/tool-service.js';
import responsesRouter from './responses.js';
import aiChatRouter from './ai-chat.js';

const app = express();
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  }
});

// Explicit CORS headers and OPTIONS handler for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(cors({
  origin: '*', // Allow all origins for dev; use your actual domain in prod
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Mount the new Responses API router
app.use('/api/responses', responsesRouter);

// Mount the AI Chat router (Vercel AI SDK compatible)
app.use('/api', aiChatRouter);

// API version and feature detection
app.get('/api/version', (_, res) => {
  res.json({
    version: '2.0.0',
    apis: {
      assistant: {
        available: true,
        deprecated: process.env.USE_RESPONSES_API === 'true',
        endpoints: ['/api/chat/start', '/api/chat/status', '/api/chat/result', '/api/chat/stream']
      },
      responses: {
        available: process.env.USE_RESPONSES_API === 'true',
        recommended: true,
        endpoints: ['/api/responses/create', '/api/responses/continue']
      }
    },
    features: {
      streaming: true,
      toolCalls: true,
      fileUpload: true,
      backwardCompatibility: true
    },
    migration: {
      phase: process.env.USE_RESPONSES_API === 'true' ? 'responses-api' : 'assistant-api',
      autoFallback: process.env.API_AUTO_FALLBACK === 'true'
    }
  });
});

// Initialize tool service for consolidated tool management
const toolService = new ToolService();

// File upload endpoint - uploads files to OpenAI and returns file IDs
app.post('/api/chat/upload', upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const fileIds = [];
    
    // Upload each file to OpenAI
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      // Create FormData for OpenAI Files API
      const formData = new FormData();
      formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
      formData.append('purpose', 'assistants');

      // Upload to OpenAI Files API
      const uploadRes = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: formData
      });

      const uploadData = await uploadRes.json();
      
      if (uploadData.error) {
        console.error('OpenAI file upload error:', uploadData.error);
        return res.status(500).json({ 
          error: `Failed to upload ${file.originalname}: ${uploadData.error.message}` 
        });
      }

      fileIds.push(uploadData.id);
      console.log(`[API] File uploaded successfully: ${file.originalname} -> ${uploadData.id}`);
    }

    res.status(200).json({ fileIds });
  } catch (err) {
    console.error('[API] /chat/upload error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// 1. Start a new assistant run
app.post('/api/chat/start', async (req, res) => {
  try {
    const { message, systemInstructions, threadId: existingThreadId, history, fileIds } = req.body;
    console.log('[API] /chat/start - Incoming body:', req.body);
    console.log('[API] /chat/start - existingThreadId:', existingThreadId);
    if (!message) return res.status(400).json({ error: 'Missing message' });
    
    let threadId = existingThreadId;
    console.log('[API] /chat/start - threadId after assignment:', threadId);
    
    // 1. Create a new thread only if one doesn't exist
    if (!threadId) {
      console.log('[API] /chat/start - Creating new thread');
      const threadRes = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({})
      });
      const threadData = await threadRes.json();
      console.log('[API] /chat/start - Thread response:', threadData);
      threadId = threadData.id;
      // Replay full conversation history if provided
      if (Array.isArray(history)) {
        for (const msg of history) {
          await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({
              role: msg.role,
              content: msg.content
            })
          });
        }
      }
    } else {
      console.log('[API] /chat/start - Reusing existing threadId:', threadId);
    }
    
    // 2. If systemInstructions is present, add as a system message to the thread
    if (systemInstructions) {
      await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          role: 'system',
          content: systemInstructions
        })
      });
    }
    
    // 3. Add ONLY the user's message to the thread, with file attachments if provided
    const messagePayload = {
      role: 'user',
      content: message // Only the user's message, NOT the full prompt
    };

    // Add file attachments if provided
    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      messagePayload.attachments = fileIds.map(fileId => ({
        file_id: fileId,
        tools: [{ type: 'file_search' }] // Enable file search for attached files
      }));
      console.log('[API] /chat/start - Adding file attachments:', messagePayload.attachments);
    }

    const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify(messagePayload)
    });
    const msgData = await msgRes.json();
    console.log('[API] /chat/start - Message response:', msgData);
    
    // 4. Run the assistant on the thread
    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: process.env.OPENAI_ASSISTANT_ID
      })
    });
    const runData = await runRes.json();
    console.log('[API] /chat/start - Run response:', runData);
    const runId = runData.id;
    res.status(200).json({ threadId, runId });
  } catch (err) {
    console.error('[API] /chat/start error:', err);
    if (err && err.response && typeof err.response.text === 'function') {
      err.response.text().then(text => console.error('OpenAI error response:', text));
    }
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// 2. Poll for run status
app.get('/api/chat/status', async (req, res) => {
  try {
    const { threadId, runId } = req.query;
    if (!threadId || !runId) return res.status(400).json({ error: 'Missing threadId or runId' });
    let statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    let statusData = await statusRes.json();
    console.log(`[API] /chat/status - threadId: ${threadId}, runId: ${runId}, status: ${statusData.status}`);
    // --- Tool call handling ---
    if (statusData.status === 'requires_action' && statusData.required_action) {
      console.log('[API] /chat/status - Required action:', JSON.stringify(statusData.required_action, null, 2));
      
      // Use the required_action field to get the exact tool calls that need responses
      const requiredToolCalls = statusData.required_action.submit_tool_outputs?.tool_calls || [];
      
      let toolCalls = [];
      for (const toolCall of requiredToolCalls) {
        const tool_call_id = toolCall.id;
        const toolType = toolCall.type;
        
        if (toolCall.type === 'function') {
          const functionName = toolCall.function?.name;
          let functionArgs = {};
          try {
            functionArgs = JSON.parse(toolCall.function?.arguments || '{}');
          } catch {}
          toolCalls.push({ tool_call_id, functionName, functionArgs, toolType });
          console.log('[API] /chat/status - Function call requiring response:', { tool_call_id, functionName, functionArgs });
        } else {
          // Built-in tools shouldn't appear in required_action, but handle just in case
          console.log('[API] /chat/status - Unexpected built-in tool in required_action:', { tool_call_id, toolType });
        }
      }
      
      // 2. Process tool calls and generate outputs (only for function calls)
      const functionCalls = toolCalls.filter(tc => tc.toolType === 'function');
      if (functionCalls.length === 0) {
        console.log('[API] /chat/status - No function calls to process, checking if run completed');
        // No function calls need responses, check if run is complete
        const recheckRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        });
        const recheckData = await recheckRes.json();
        return res.status(200).json({ status: recheckData.status });
      }

      // Use consolidated tool service for processing
      const tool_outputs = [];
      for (const tc of toolCalls) {
        if (tc.toolType === 'function') {
          try {
            console.log(`[API] Processing tool call: ${tc.functionName} with args:`, tc.functionArgs);
            const result = await toolService.executeCustomTool(tc.functionName, tc.functionArgs);
            console.log(`[API] Tool ${tc.functionName} result:`, result);
            
            tool_outputs.push({
              tool_call_id: tc.tool_call_id,
              output: JSON.stringify(result)
            });
          } catch (error) {
            console.error(`[API] Error executing tool ${tc.functionName}:`, error);
            tool_outputs.push({
              tool_call_id: tc.tool_call_id,
              output: JSON.stringify({ error: error.message })
            });
          }
        }
      }
      
      console.log('[API] /chat/status - Submitting tool outputs for function calls:', JSON.stringify(tool_outputs, null, 2));
      
      // 3. Submit tool outputs
      const submitRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({ tool_outputs })
      });
      const submitData = await submitRes.json();
      console.log('[API] /chat/status - Tool outputs submitted:', submitData);
      
      // 4. Poll for completion
      let pollAttempts = 0;
      let pollStatus = submitData.status;
      while (pollStatus !== 'completed' && pollStatus !== 'failed' && pollAttempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        const pollRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        });
        const pollData = await pollRes.json();
        pollStatus = pollData.status;
        pollAttempts++;
        console.log(`[API] /chat/status - Polling after tool output, status: ${pollStatus}`);
      }
      return res.status(200).json({ status: pollStatus });
    }
    // --- End tool call handling ---
    res.status(200).json({ status: statusData.status });
  } catch (err) {
    console.error('[API] /chat/status error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// 3. Fetch assistant reply and tool outputs
app.get('/api/chat/result', async (req, res) => {
  try {
    const { threadId, runId } = req.query;
    if (!threadId) return res.status(400).json({ error: 'Missing threadId' });
    // Fetch latest assistant message
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const messagesData = await messagesRes.json();
    // Find the last assistant message
    const assistantMsg = [...messagesData.data]
      .reverse()
      .find(msg => msg.role === 'assistant');
    // Aggregate all text content from the assistant message
    let replyText = null;
    if (assistantMsg && Array.isArray(assistantMsg.content)) {
      const allText = assistantMsg.content
        .filter(c => c.type === 'text' && c.text && typeof c.text.value === 'string')
        .map(c => c.text.value)
        .join('\n')
        .trim();
      if (allText) replyText = allText;
    }
    // Fetch run steps for tool outputs (if runId provided)
    let toolOutputs = {};
    if (runId) {
      const stepsRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/steps`, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const stepsData = await stepsRes.json();
      console.log('[API] /chat/status - Full stepsData:', JSON.stringify(stepsData, null, 2));
      if (Array.isArray(stepsData.data)) {
        for (const step of stepsData.data) {
          if (step.type === 'tool_calls' && Array.isArray(step.step_details?.tool_calls)) {
            for (const toolCall of step.step_details.tool_calls) {
              const toolName = toolCall.name || (toolCall.function && toolCall.function.name);
              let output = toolCall.output || (toolCall.function && toolCall.function.output);
              if (typeof output === 'string') {
                try { output = JSON.parse(output); } catch {}
              }
              if (toolName && output) {
                toolOutputs[toolName] = output;
              }
            }
          }
        }
      }
    }
    if (Object.keys(toolOutputs).length === 0) toolOutputs = undefined;
    // Fallback logic
    const response = {
      reply: replyText || (toolOutputs ? "" : "No reply from assistant."),
      ...(toolOutputs ? { toolOutputs } : {})
    };
    // Add detailed logging
    console.log('[API] /chat/result - assistantMsg:', JSON.stringify(assistantMsg, null, 2));
    console.log('[API] /chat/result - replyText:', replyText);
    console.log('[API] /chat/result - toolOutputs:', JSON.stringify(toolOutputs, null, 2));
    res.status(200).json(response);
  } catch (err) {
    console.error('[API] /chat/result error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// Debug endpoint: fetch all messages in a thread
app.get('/api/chat/thread-messages', async (req, res) => {
  const { threadId } = req.query;
  if (!threadId) return res.status(400).json({ error: 'Missing threadId' });
  try {
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const messagesData = await messagesRes.json();
    res.json(messagesData);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// Helper functions for streaming are now handled by the service layer

// New streaming endpoint using existing Assistant API
app.post('/api/chat/stream', async (req, res) => {
  try {
    console.log('[API] /chat/stream - Starting streaming response with Assistant API');
    
    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    const { message, threadId, requirements = {}, context = {} } = req.body;

    // Create enhanced message with context (similar to existing implementation)
    let enhancedMessage = `${message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CONTEXT: Please use the following requirements and system information for your response:

Current Context: ${JSON.stringify(context)}
Requirements: ${JSON.stringify(requirements)}

Instructions:
- ALWAYS use generate_product_filters for product-related requests
- Be conversational and helpful
- Provide expert advice on forklift selection
- Focus on matching user needs with product capabilities`;

    console.log('[API] /chat/stream - Enhanced message created');
    
    // Send initial status
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      status: 'starting' 
    })}\n\n`);

    // Use existing Assistant API approach but poll more frequently for streaming effect
    let currentThreadId = threadId;
    if (!currentThreadId || !currentThreadId.startsWith('thread_')) {
      currentThreadId = null;
    }

    // 1. Start the assistant run (same as existing implementation)
    const startRes = await fetch(`https://api.openai.com/v1/threads${currentThreadId ? `/${currentThreadId}` : ''}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify(currentThreadId ? {
        assistant_id: process.env.OPENAI_ASSISTANT_ID,
        additional_messages: [{ role: 'user', content: enhancedMessage }],
        tools: toolService.getAllTools()
      } : {
        assistant_id: process.env.OPENAI_ASSISTANT_ID,
        thread: {
          messages: [{ role: 'user', content: enhancedMessage }]
        },
        tools: toolService.getAllTools()
      })
    });

    console.log('[API] /chat/stream - Start response status:', startRes.status);
    
    if (!startRes.ok) {
      const errorText = await startRes.text();
      console.error('[API] /chat/stream - Start API error:', errorText);
      throw new Error(`OpenAI Assistant API error: ${startRes.status} - ${errorText}`);
    }

    const startData = await startRes.json();
    console.log('[API] /chat/stream - Start response:', JSON.stringify(startData, null, 2));
    
    if (!startData.thread_id || !startData.id) {
      const errorMessage = typeof startData.error === 'string' 
        ? startData.error 
        : JSON.stringify(startData.error) || 'Failed to start assistant run';
      console.error('[API] /chat/stream - Start failed:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const { thread_id: newThreadId, id: runId } = startData;
    
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      status: 'processing',
      threadId: newThreadId
    })}\n\n`);

    // 2. Poll for completion with streaming updates
    let status = 'queued';
    let attempts = 0;
    const maxAttempts = 60; // Increased for streaming
    let lastMessageCount = 0;
    
    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 500)); // Poll every 500ms for more responsive streaming
      
      // Check run status
      const statusRes = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const statusData = await statusRes.json();
      status = statusData.status;
      
      // Send status updates
      if (status !== statusData.status) {
        res.write(`data: ${JSON.stringify({ 
          type: 'status', 
          status: status
        })}\n\n`);
      }
      
      // Try to get partial responses by checking messages
      try {
        const messagesRes = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/messages`, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        });
        const messagesData = await messagesRes.json();
        
        if (messagesData.data && messagesData.data.length > lastMessageCount) {
          // New message(s) available - stream the latest assistant message
          const latestMessages = messagesData.data.slice(0, messagesData.data.length - lastMessageCount);
          const assistantMessages = latestMessages.filter(msg => msg.role === 'assistant');
          
          for (const msg of assistantMessages) {
            const content = msg.content.map(c => c.text?.value || '').join('\n');
            if (content.trim()) {
              res.write(`data: ${JSON.stringify({ 
                type: 'content', 
                text: content
              })}\n\n`);
            }
          }
          
          lastMessageCount = messagesData.data.length;
        }
      } catch (messageError) {
        console.log('[API] /chat/stream - Could not fetch intermediate messages:', messageError.message);
      }
      
      // Handle tool calls (same as existing implementation)
      if (status === 'requires_action' && statusData.required_action?.type === 'submit_tool_outputs') {
        res.write(`data: ${JSON.stringify({ 
          type: 'status', 
          status: 'processing_tools'
        })}\n\n`);
        
        // Process tool calls (reuse existing logic)
        const toolCalls = statusData.required_action.submit_tool_outputs.tool_calls.map(tc => ({
          toolType: tc.type,
          tool_call_id: tc.id,
          functionName: tc.function?.name,
          functionArgs: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}
        }));

        const tool_outputs = [];
        for (const tc of toolCalls) {
          if (tc.toolType === 'function') {
            try {
              console.log(`[API] Processing streaming tool call: ${tc.functionName}`);
              const result = await toolService.executeCustomTool(tc.functionName, tc.functionArgs);
              
              // Send tool result for UI
              res.write(`data: ${JSON.stringify({ 
                type: 'tool_result',
                toolName: tc.functionName,
                result: result
              })}\n\n`);
              
              tool_outputs.push({
                tool_call_id: tc.tool_call_id,
                output: JSON.stringify(result)
              });
            } catch (error) {
              console.error(`[API] Error in streaming tool execution ${tc.functionName}:`, error);
              tool_outputs.push({
                tool_call_id: tc.tool_call_id,
                output: JSON.stringify({ error: error.message })
              });
            }
          }
        }

        // Submit tool outputs
        await fetch(`https://api.openai.com/v1/threads/${newThreadId}/runs/${runId}/submit_tool_outputs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          },
          body: JSON.stringify({ tool_outputs })
        });
      }
      
      attempts++;
    }

    if (status !== 'completed') {
      throw new Error('Assistant run did not complete in time');
    }

    // Get final messages - fetch ALL messages to ensure we get the complete response
    const finalMessagesRes = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    const finalMessagesData = await finalMessagesRes.json();
    console.log('[API] /chat/stream - Final messages:', JSON.stringify(finalMessagesData, null, 2));
    
    // Send any remaining content - get the latest assistant messages
    if (finalMessagesData.data && Array.isArray(finalMessagesData.data)) {
      // Get all assistant messages, most recent first
      const allAssistantMessages = finalMessagesData.data
        .filter(msg => msg.role === 'assistant')
        .sort((a, b) => b.created_at - a.created_at);
      
      // Send the most recent assistant message if we haven't sent it yet
      if (allAssistantMessages.length > 0) {
        const latestMessage = allAssistantMessages[0];
        const content = latestMessage.content.map(c => c.text?.value || '').join('\n');
        
        if (content.trim()) {
          console.log('[API] /chat/stream - Sending final assistant content:', content);
          res.write(`data: ${JSON.stringify({ 
            type: 'content', 
            text: content
          })}\n\n`);
        }
      }
    }
    
    // Send completion event
    res.write(`data: ${JSON.stringify({ 
      type: 'done',
      threadId: newThreadId
    })}\n\n`);
    res.end();
    
  } catch (err) {
    console.error('[API] /chat/stream error:', err);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: err.message || 'Streaming failed' 
    })}\n\n`);
    res.end();
  }
});

// Product API endpoints
app.get('/api/products', (req, res) => {
  try {
    const { filters } = req.query;
    
    if (filters) {
      const parsedFilters = JSON.parse(filters);
      const filteredProducts = getProductsByFilters(parsedFilters);
      res.json(filteredProducts);
    } else {
      res.json(products);
    }
  } catch (error) {
    console.error('[API] /products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const product = getProductById(id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    console.error('[API] /products/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Local server switch
if (process.env.USE_LOCAL_SERVER === 'true' || process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[API] Express server running locally on port ${PORT}`);
  });
}
// Always export app for Vercel/serverless
export default app;
