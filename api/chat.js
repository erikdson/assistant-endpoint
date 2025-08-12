import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import multer from 'multer';
import { FormData } from 'formdata-node';
import { products, getValidProductIds, getProductById, getProductsByFilters } from '../products.js';

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

// Tool function definitions - Updated to match exact user specification
const TOOL_FUNCTIONS = {
  generate_product_filters: {
    name: "generate_product_filters",
    description: "Turn user product requirements into structured filters for catalog narrowing.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        filters: {
          type: "array",
          items: {
            type: "object",
            required: ["field", "type", "label", "value"],
            properties: {
              field: {
                type: "string",
                enum: [
                  "loadCapacity",
                  "liftHeight", 
                  "operatingEnvironment",
                  "floorSurface",
                  "aisleWidth",
                  "budgetRange",
                  "loadType",
                  "attachments",
                  "operatingHours",
                  "powerSource",
                  "deliveryUrgency"
                ]
              },
              type: {
                type: "string",
                enum: ["singleselect", "multiselect", "range", "text"]
              },
              label: {
                type: "string"
              },
              options: {
                type: "array",
                items: { type: "string" }
              },
              min: {
                type: "number"
              },
              max: {
                type: "number" 
              },
              value: {
                oneOf: [
                  {
                    if: {
                      properties: {
                        field: { const: "budgetRange" },
                        type: { const: "range" }
                      }
                    },
                    then: {
                      type: "object",
                      properties: {
                        min: { type: "number", minimum: 0 },
                        max: { type: "number", minimum: 0 }
                      },
                      required: ["min", "max"]
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "powerSource" },
                        type: { const: "singleselect" }
                      }
                    },
                    then: {
                      type: "string",
                      enum: ["electric", "diesel", "lpg", "hybrid"]
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "operatingEnvironment" },
                        type: { const: "singleselect" }
                      }
                    },
                    then: {
                      type: "string",
                      enum: ["indoor", "outdoor", "mixed"]
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "floorSurface" },
                        type: { const: "singleselect" }
                      }
                    },
                    then: {
                      type: "string",
                      enum: ["smooth-concrete", "rough-concrete", "asphalt", "gravel"]
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "loadType" },
                        type: { const: "singleselect" }
                      }
                    },
                    then: {
                      type: "string",
                      enum: ["pallets", "bulk", "containers", "machinery", "mixed"]
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "attachments" },
                        type: { const: "multiselect" }
                      }
                    },
                    then: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["forks", "clamp", "rotator", "side-shift", "push-pull"]
                      }
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "operatingHours" },
                        type: { const: "singleselect" }
                      }
                    },
                    then: {
                      type: "string",
                      enum: ["light", "medium", "heavy", "continuous"]
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "deliveryUrgency" },
                        type: { const: "singleselect" }
                      }
                    },
                    then: {
                      type: "string",
                      enum: ["immediate", "standard", "planned", "flexible"]
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "loadCapacity" },
                        type: { const: "range" }
                      }
                    },
                    then: {
                      type: "array",
                      items: { type: "number" },
                      minItems: 2,
                      maxItems: 2
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "liftHeight" },
                        type: { const: "range" }
                      }
                    },
                    then: {
                      type: "array",
                      items: { type: "number" },
                      minItems: 2,
                      maxItems: 2
                    }
                  },
                  {
                    if: {
                      properties: {
                        field: { const: "aisleWidth" },
                        type: { const: "range" }
                      }
                    },
                    then: {
                      type: "array",
                      items: { type: "number" },
                      minItems: 2,
                      maxItems: 2
                    }
                  },
                  { type: "string" }
                ]
              }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false,
      required: ["filters"]
    }
  },
  recommend_products: {
    name: "recommend_products",
    description: "Generate structured product recommendations based on user requirements and preferences. Use this when users ask for product suggestions, recommendations, or want to see specific products.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string" },
              matchScore: { type: "number", minimum: 0, maximum: 100 },
              matchReason: { type: "string" },
              highlights: {
                type: "array", 
                items: { type: "string" }
              },
              primaryBenefit: { type: "string" },
              considerations: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["productId", "matchScore", "matchReason", "highlights", "primaryBenefit"],
            additionalProperties: false
          }
        },
        reasoning: { type: "string" },
        totalMatches: { type: "number" },
        topCriteria: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["recommendations", "reasoning", "totalMatches"],
      additionalProperties: false
    }
  }
};

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

      const tool_outputs = toolCalls.map(tc => {
        let output = {};
        
        // Only process function calls, built-in tools don't need outputs
        if (tc.toolType === 'function') {
          if (tc.functionName === 'generate_product_filters') {
            // For now, return the function arguments as-is (the AI will have structured them correctly)
            // In a production system, you might want to validate against the schema here
            output = {
              filters: tc.functionArgs.filters || {},
              explanation: tc.functionArgs.explanation || "Filters generated based on your requirements",
              confidence: tc.functionArgs.confidence || 0.8
            };
          } else if (tc.functionName === 'recommend_products') {
            // Process product recommendations with enhanced data from product catalog
            console.log('[API] Processing recommend_products tool call:', tc.functionArgs);
            
            // Note: Only process if recommendations were explicitly requested
            // The AI should only call this tool when users ask for recommendations
            // TODO: Update OpenAI assistant instructions to be less recommendation-eager
            
            // Validate and enhance product recommendations with real product IDs
            const validProductIds = getValidProductIds();
            
            let recommendations = tc.functionArgs.recommendations || [];
            
            // If AI generated invalid product IDs, replace with valid ones and enhance with real product data
            recommendations = recommendations.map((rec, index) => {
              if (!validProductIds.includes(rec.productId)) {
                // Replace with a valid product ID based on index
                const validId = validProductIds[index % validProductIds.length];
                const realProduct = getProductById(validId);
                console.log(`[API] Replacing invalid product ID ${rec.productId} with ${validId}`);
                
                // Enhance recommendation with real product data
                return { 
                  ...rec, 
                  productId: validId,
                  // Override with real product attributes
                  highlights: realProduct ? [
                    `${realProduct.loadCapacity}kg capacity`,
                    `${realProduct.powerSource} power`,
                    `${realProduct.operatingEnvironment} use`,
                    ...realProduct.semanticTags.slice(0, 2)
                  ] : rec.highlights,
                  primaryBenefit: realProduct ? realProduct.description : rec.primaryBenefit
                };
              }
              return rec;
            });
            
            output = {
              recommendations: recommendations,
              reasoning: tc.functionArgs.reasoning || "Product recommendations based on your requirements",
              totalMatches: tc.functionArgs.totalMatches || recommendations.length,
              topCriteria: tc.functionArgs.topCriteria || [],
              generatedAt: new Date().toISOString()
            };
            
            console.log('[API] Generated recommendation output:', output);
          } else {
            // Default behavior for unknown function tools
            output = tc.functionArgs;
          }
          
          return {
            tool_call_id: tc.tool_call_id,
            output: JSON.stringify(output)
          };
        } else {
          // Built-in tools (like file_search) don't need outputs - skip them
          return null;
        }
      }).filter(Boolean); // Remove null entries for built-in tools
      
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
