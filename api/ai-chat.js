import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { OpenAI } from 'openai';
import ConversationService from '../services/conversation-service.js';
import PromptBuilderService from '../services/prompt-builder-service.js';
import RequirementsFormatter from '../services/requirements-formatter.js';

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize services for sophisticated prompt building
const conversationService = new ConversationService();
const promptBuilder = new PromptBuilderService();
const requirementsFormatter = new RequirementsFormatter();

// Vercel AI SDK compatible endpoint
router.post('/ai-chat', async (req, res) => {
  try {
    console.log('[AI Chat] Raw request body received:', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : 'no body'
    });
    
    const { messages, requirements = {}, context = {} } = req.body;

    console.log('[AI Chat] Parsed request data:', {
      messages: messages?.length || 0,
      requirements: Object.keys(requirements).length,
      context: Object.keys(context).length,
      requirementsPreview: requirements,
      contextPreview: context
    });

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Format requirements with business context
    const formattedRequirements = requirementsFormatter.formatRequirements(requirements, context);
    console.log('[AI Chat] Formatted requirements:', {
      total: formattedRequirements.summary.total,
      byLevel: formattedRequirements.summary.byLevel,
      consolidated: Object.keys(formattedRequirements.consolidated).length
    });

    // Build sophisticated system message with the new prompt builder
    const systemMessage = promptBuilder.buildSystemPrompt({
      requirements: formattedRequirements.consolidated,
      context,
      customInstructions: null
    });
    
    console.log('[AI Chat] Dynamic system message generated:');
    console.log('[AI Chat] - Length:', systemMessage.length);
    console.log('[AI Chat] - Requirements section included:', Object.keys(requirements).length > 0);
    console.log('[AI Chat] - Context level:', context.level || 'solution');
    console.log('[AI Chat] - Preview:', systemMessage.substring(0, 300) + '...');
    
    // Get tools from conversation service
    const tools = conversationService.tools.getAllTools();
    
    // Create OpenAI completion with streaming and tool support
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        ...messages
      ],
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    });

    let toolCalls = {};
    let accumulatedContent = '';
    
    // Stream the response in a format compatible with Vercel AI SDK
    for await (const chunk of response) {
      const choice = chunk.choices[0];
      
      // Handle content streaming
      if (choice?.delta?.content) {
        const content = choice.delta.content;
        accumulatedContent += content;
        // Write each chunk of content directly as plain text
        res.write(content);
      }
      
      // Handle tool calls
      if (choice?.delta?.tool_calls) {
        for (const toolCallDelta of choice.delta.tool_calls) {
          const index = toolCallDelta.index;
          const callId = toolCallDelta.id;
          
          if (callId) {
            // Initialize new tool call
            toolCalls[callId] = {
              id: callId,
              type: toolCallDelta.type,
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: toolCallDelta.function?.arguments || ''
              }
            };
          } else {
            // Find existing tool call to accumulate arguments
            const existingCallId = Object.keys(toolCalls)[index] || Object.keys(toolCalls)[0];
            if (existingCallId && toolCalls[existingCallId]) {
              if (toolCallDelta.function?.name) {
                toolCalls[existingCallId].function.name += toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                toolCalls[existingCallId].function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        }
      }
      
      // Check if the stream is done
      if (choice?.finish_reason) {
        // Process tool calls if any
        if (Object.keys(toolCalls).length > 0) {
          console.log('[AI Chat] Processing tool calls:', Object.keys(toolCalls));
          
          for (const [callId, toolCall] of Object.entries(toolCalls)) {
            try {
              console.log(`[AI Chat] Processing tool call ${callId}:`, {
                name: toolCall.function.name,
                argumentsLength: toolCall.function.arguments.length,
                argumentsPreview: toolCall.function.arguments.substring(0, 100)
              });
              
              // Validate JSON before parsing
              const args = toolCall.function.arguments.trim();
              if (!args) {
                throw new Error('Tool call arguments are empty');
              }
              
              let parsedArgs;
              try {
                parsedArgs = JSON.parse(args);
              } catch (parseError) {
                throw new Error(`Failed to parse tool arguments: ${parseError.message}. Raw args: ${args.substring(0, 200)}...`);
              }
              
              const result = await conversationService.tools.executeCustomTool(
                toolCall.function.name,
                parsedArgs,
                requirements // Pass requirements as context for recommend_products tool
              );
              
              console.log(`[AI Chat] Tool ${toolCall.function.name} executed successfully:`, result);
              
              // Write tool output as a special marker that frontend can detect
              res.write(`\n\n--- TOOL_OUTPUT_START:${toolCall.function.name} ---\n`);
              res.write(JSON.stringify(result, null, 2));
              res.write(`\n--- TOOL_OUTPUT_END:${toolCall.function.name} ---\n\n`);
              
            } catch (error) {
              console.error(`[AI Chat] Error executing tool ${toolCall.function.name}:`, error);
              res.write(`\n\n--- TOOL_ERROR:${toolCall.function.name} ---\n`);
              res.write(`Error: ${error.message}`);
              res.write(`\n--- TOOL_ERROR_END:${toolCall.function.name} ---\n\n`);
            }
          }
        }
        break;
      }
    }
    
    res.end();
    
  } catch (error) {
    console.error('[AI Chat Error]', error);
    res.status(500).json({ 
      error: 'Failed to process chat request',
      details: error.message 
    });
  }
});

export default router;