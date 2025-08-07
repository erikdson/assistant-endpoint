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

// Tool function definitions
const TOOL_FUNCTIONS = {
  generate_product_filters: {
    name: "generate_product_filters",
    description: "Generate product filters based on user requirements and conversation context. Use this when the user describes product needs that can be translated into specific filter criteria.",
    parameters: {
      type: "object",
      properties: {
        filters: {
          type: "object",
          description: "The filter criteria to apply",
          properties: {
            loadCapacity: {
              type: "number",
              minimum: 1000,
              maximum: 15000,
              description: "Required maximum load capacity in kilograms (kg). Typical values range from 1000–15000 kg. For example, '9 tons' = 9000 kg."
            },
            liftHeight: {
              type: "number",
              minimum: 2000,
              maximum: 8000,
              description: "Required maximum lift height in millimeters (mm). Typical warehouse heights are 4000–7000 mm. For example, '6 meters' = 6000 mm."
            },
            operatingEnvironment: {
              type: "string",
              enum: ["indoor", "outdoor", "mixed"],
              description: "Single-select. Where the forklift will operate. Use:\n- 'indoor' for enclosed spaces\n- 'outdoor' for outside-only use\n- 'mixed' when the user needs to operate both indoors and outdoors (e.g., warehouse + yard)"
            },
            floorSurface: {
              type: "string",
              enum: ["smooth-concrete", "rough-concrete", "asphalt", "gravel"],
              description: "Single-select. Describes the typical ground surface. Use:\n- 'smooth-concrete' for indoor polished floors\n- 'gravel' for uneven outdoor yards\n- Use the option that matches the most common or most demanding condition."
            },
            aisleWidth: {
              type: "number",
              minimum: 2000,
              maximum: 5000,
              description: "Minimum aisle width available for maneuvering, in millimeters (mm). Narrow aisles require tighter turning radius."
            },
            budgetRange: {
              type: "string",
              enum: ["economy", "standard", "premium"],
              description: "Single select. Target price category per unit. Use:\n- 'economy' for cost-sensitive buyers\n- 'standard' for balanced cost and performance\n- 'premium' for buyers seeking high-end features"
            },
            loadType: {
              type: "string",
              enum: ["pallets", "bulk", "containers", "machinery", "mixed"],
              description: "Type of load typically handled. Use:\n- 'pallets' for standard goods\n- 'machinery' for large, irregular items\n- 'mixed' when the use case spans multiple types"
            },
            attachments: {
              type: "array",
              items: {
                type: "string",
                enum: ["forks", "clamp", "rotator", "side-shift", "push-pull"]
              },
              description: "Multiselect. Specifies required forklift attachments. For example:\n- 'clamp' for handling paper rolls\n- 'rotator' for tipping containers"
            },
            operatingHours: {
              type: "string",
              enum: ["light", "medium", "heavy", "continuous"],
              description: "Single-select. Daily duty cycle:\n- 'light' = a few hours/day\n- 'medium' = intermittent use\n- 'heavy' = full-shift use\n- 'continuous' = 24/7 operations or multi-shift environments"
            },
            powerSource: {
              type: "string",
              enum: ["electric", "diesel", "lpg", "hybrid"],
              description: "Single-select. Fuel or energy type:\n- 'electric' for indoor and sustainable ops\n- 'diesel' for outdoor/heavy-duty\n- 'hybrid' or 'LPG' for flexibility"
            }
          },
          additionalProperties: false
        },
        explanation: {
          type: "string",
          description: "Brief explanation of why these filters were generated based on the user's requirements"
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence level in the filter generation (0-1, where 1 is highest confidence)"
        }
      },
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
