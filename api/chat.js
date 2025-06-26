import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*', // Allow all origins for dev; use your actual domain in prod
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        console.log('[API] Incoming user message:', message);

        // 1. Create a new thread
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
        const threadId = threadData.id;
        console.log('[API] Created thread:', threadId);

        // 2. Add message to thread
        await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({
                role: 'user',
                content: message
            })
        });

        // 3. Run the assistant on the thread
        const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({
                assistant_id: process.env.OPENAI_ASSISTANT_ID // store your assistant_id in .env!
            })
        });
        const runData = await runRes.json();
        const runId = runData.id;
        console.log('[API] Started run:', runId);

        // 4. Poll for completion (simple polling loop)
        let runStatus = runData.status;
        let attempts = 0;
        let maxAttempts = 20;
        while (runStatus !== 'completed' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'OpenAI-Beta': 'assistants=v2'
                }
            });
            const statusData = await statusRes.json();
            runStatus = statusData.status;
            attempts++;
        }

        // Fetch messages for the reply text
        const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'OpenAI-Beta': 'assistants=v2'
            }
        });
        const messagesData = await messagesRes.json();

        if (!messagesData || !Array.isArray(messagesData.data)) {
            // Return full API response for debugging
            console.error('[API] Unexpected response from OpenAI (messages):', messagesData);
            return res.status(500).json({ error: 'Unexpected response from OpenAI', apiResponse: messagesData });
        }

        // Find the last assistant message
        const assistantMsg = [...messagesData.data]
            .reverse()
            .find(msg => msg.role === 'assistant');
        console.log('[API] Raw assistant message:', JSON.stringify(assistantMsg, null, 2));

        // Aggregate all text content from the assistant message
        let replyText = "No reply from assistant.";
        if (assistantMsg && Array.isArray(assistantMsg.content)) {
          const allText = assistantMsg.content
            .filter(c => c.type === 'text' && c.text && typeof c.text.value === 'string')
            .map(c => c.text.value)
            .join('\n')
            .trim();
          if (allText) replyText = allText;
        }

        // Fetch run steps to check for tool calls
        const stepsRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/steps`, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'OpenAI-Beta': 'assistants=v2'
            }
        });
        const stepsData = await stepsRes.json();
        let toolOutputs = undefined;
        if (Array.isArray(stepsData.data)) {
            for (const step of stepsData.data) {
                if (step.type === 'tool_calls' && Array.isArray(step.tool_calls)) {
                    for (const toolCall of step.tool_calls) {
                        if (toolCall.name === 'generate_product_filters' && toolCall.output) {
                            try {
                                // Output is already structured JSON
                                toolOutputs = toolOutputs || {};
                                toolOutputs[toolCall.name] = toolCall.output;
                                console.log('[API] Tool output for', toolCall.name, ':', JSON.stringify(toolCall.output, null, 2));
                            } catch (e) {
                                console.error('[API] Failed to process tool output:', e);
                            }
                        }
                    }
                }
            }
        }

        const response = toolOutputs
            ? { reply: replyText, toolOutputs }
            : { reply: replyText };

        console.log('[API] Final response to client:', JSON.stringify(response, null, 2));
        res.status(200).json(response);

    } catch (err) {
        console.error('[API] Error:', err);
        res.status(500).json({ error: err.message || 'Unknown error' });
    }
});

export default app;
