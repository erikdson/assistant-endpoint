import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(express.json());

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
  }
};

// 1. Start a new assistant run
app.post('/api/chat/start', async (req, res) => {
  try {
    const { message, systemInstructions, threadId: existingThreadId, history } = req.body;
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
    
    // 3. Add ONLY the user's message to the thread
    const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        role: 'user',
        content: message // Only the user's message, NOT the full prompt
      })
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
    if (statusData.status === 'requires_action') {
      // 1. Fetch run steps to get tool calls
      const stepsRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/steps`, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const stepsData = await stepsRes.json();
      console.log('[API] /chat/status - Full stepsData:', JSON.stringify(stepsData, null, 2));
      let toolCalls = [];
      if (Array.isArray(stepsData.data)) {
        for (const step of stepsData.data) {
          if (step.type === 'tool_calls' && Array.isArray(step.step_details?.tool_calls)) {
            for (const toolCall of step.step_details.tool_calls) {
              const tool_call_id = toolCall.id;
              const functionName = toolCall.function?.name;
              let functionArgs = {};
              try {
                functionArgs = JSON.parse(toolCall.function?.arguments || '{}');
              } catch {}
              toolCalls.push({ tool_call_id, functionName, functionArgs });
              console.log('[API] /chat/status - Tool call detected:', { tool_call_id, functionName, functionArgs });
            }
          }
        }
      }
      
      // 2. Process tool calls and generate outputs
      const tool_outputs = toolCalls.map(tc => {
        let output = {};
        
        if (tc.functionName === 'generate_product_filters') {
          // For now, return the function arguments as-is (the AI will have structured them correctly)
          // In a production system, you might want to validate against the schema here
          output = {
            filters: tc.functionArgs.filters || {},
            explanation: tc.functionArgs.explanation || "Filters generated based on your requirements",
            confidence: tc.functionArgs.confidence || 0.8
          };
        } else {
          // Default behavior for unknown tools
          output = tc.functionArgs;
        }
        
        return {
          tool_call_id: tc.tool_call_id,
          output: JSON.stringify(output)
        };
      });
      
      console.log('[API] /chat/status - Submitting tool outputs:', JSON.stringify(tool_outputs, null, 2));
      
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

// Local server switch
if (process.env.USE_LOCAL_SERVER === 'true' || process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[API] Express server running locally on port ${PORT}`);
  });
}
// Always export app for Vercel/serverless
export default app;
