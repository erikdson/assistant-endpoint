import OpenAIService from './openai-service.js';
import ToolService from './tool-service.js';
import { generateFilterInstructions } from '../config/filter-schema.js';

/**
 * Conversation Service - Orchestrates conversations using different OpenAI APIs
 * Provides a unified interface for both Assistant API and Responses API
 */
class ConversationService {
  constructor() {
    this.openai = new OpenAIService();
    this.tools = new ToolService();
    this.useResponsesAPI = process.env.USE_RESPONSES_API === 'true';
  }

  // Start a new conversation
  async startConversation(message, options = {}) {

    if (this.useResponsesAPI) {
      return this.startResponsesConversation(message, options);
    } else {
      return this.startAssistantConversation(message, options);
    }
  }

  // Assistant API conversation flow
  async startAssistantConversation(message, options) {
    const { threadId, fileIds, systemInstructions } = options;
    
    // Create or use existing thread
    let currentThreadId = threadId;
    if (!currentThreadId || !currentThreadId.startsWith('thread_')) {
      const threadData = await this.openai.createThread();
      currentThreadId = threadData.id;
    }

    // Add system instructions if provided
    if (systemInstructions) {
      await this.openai.addMessage(currentThreadId, systemInstructions);
    }

    // Add user message with attachments
    await this.openai.addMessage(currentThreadId, message, fileIds);

    // Start assistant run with custom tools
    const customTools = this.tools.getCustomTools();
    const runData = await this.openai.runAssistant(currentThreadId, customTools);

    return {
      threadId: currentThreadId,
      runId: runData.id,
      type: 'assistant'
    };
  }

  // Responses API conversation flow
  async startResponsesConversation(message, options) {
    const { requirements, context, systemInstructions } = options;
    
    // Build messages array
    const messages = [];
    
    // Add system message with context
    if (systemInstructions || Object.keys(requirements).length > 0) {
      const systemContent = this.buildSystemMessage(systemInstructions, requirements, context);
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

    // Get all available tools (custom + built-in)
    const allTools = this.tools.getAllTools();
    
    // Create streaming response
    const response = await this.openai.createResponse(messages, allTools);
    
    return {
      response,
      type: 'responses',
      messages
    };
  }

  // Poll for Assistant API completion
  async pollForCompletion(threadId, runId) {
    let status = 'queued';
    let attempts = 0;
    const maxAttempts = 30;
    
    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
      
      const statusData = await this.openai.getRunStatus(threadId, runId);
      status = statusData.status;
      
      // Handle tool calls if needed
      if (status === 'requires_action' && statusData.required_action?.submit_tool_outputs) {
        const toolCalls = statusData.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = await this.tools.processToolCalls(toolCalls);
        
        if (toolOutputs.length > 0) {
          await this.openai.submitToolOutputs(threadId, runId, toolOutputs);
        }
      }
      
      attempts++;
    }
    
    if (status !== 'completed') {
      throw new Error('Assistant run did not complete in time');
    }
    
    return status;
  }

  // Get conversation results
  async getConversationResults(threadId, runId) {
    // Get messages
    const messagesData = await this.openai.getMessages(threadId);
    
    // Get tool outputs if available
    let toolOutputs = {};
    if (runId) {
      const stepsData = await this.openai.getRunSteps(threadId, runId);
      toolOutputs = this.extractToolOutputs(stepsData);
    }
    
    // Process and return results
    const assistantMessages = messagesData.data
      .filter(msg => msg.role === 'assistant')
      .map(msg => ({
        id: msg.id,
        content: msg.content.map(c => c.text?.value || '').join('\\n'),
        timestamp: new Date(msg.created_at * 1000)
      }));
    
    return {
      messages: assistantMessages,
      toolOutputs: Object.keys(toolOutputs).length > 0 ? toolOutputs : null
    };
  }

  // Extract tool outputs from run steps
  extractToolOutputs(stepsData) {
    const toolOutputs = {};
    
    if (Array.isArray(stepsData.data)) {
      for (const step of stepsData.data) {
        if (step.type === 'tool_calls' && Array.isArray(step.step_details?.tool_calls)) {
          for (const toolCall of step.step_details.tool_calls) {
            const toolName = toolCall.name || (toolCall.function?.name);
            let output = toolCall.output || (toolCall.function?.output);
            
            if (typeof output === 'string') {
              try { 
                output = JSON.parse(output); 
              } catch {}
            }
            
            if (toolName && output) {
              toolOutputs[toolName] = output;
            }
          }
        }
      }
    }
    
    return toolOutputs;
  }

  // Process streaming response from Responses API
  async processStreamingResponse(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              await onChunk(parsed);
            } catch (error) {
              console.error('[ConversationService] Parse error:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Build system message with context and requirements
  buildSystemMessage(systemInstructions, requirements, context) {
    // Comprehensive system instructions for professional markdown formatting
    let systemMessage = systemInstructions || `You are an expert forklift sales assistant for a Configure Price Quote (CPQ) system. You provide professional, conversational guidance to help customers find the perfect forklift solutions.

## Core Behavior:
- Always be professional, knowledgeable, and helpful
- Provide clear, actionable advice based on customer needs
- Use proper business communication tone
- Focus on matching customer requirements with product capabilities
- Ask clarifying questions when requirements are unclear

## Response Format Requirements:
**CRITICAL**: You MUST format ALL responses using proper markdown syntax. This ensures professional presentation in our CPQ interface.

### Required Formatting:
1. **Headers**: Use # ## ### for section organization
2. **Lists**: Always use numbered lists (1. 2. 3.) for recommendations, steps, or multiple options
3. **Emphasis**: Use **bold** for key terms, product names, and important specifications
4. **Structure**: Organize information logically with clear sections

### Example Response Format:
\`\`\`
## Forklift Recommendation

Based on your requirements, I recommend the following options:

1. **Toyota 8FGCU25** - Ideal for your warehouse needs
   - **Capacity**: 5,000 lbs
   - **Fuel Type**: Propane
   - **Key Features**: Compact design, excellent maneuverability

2. **Hyster H50FT** - Heavy-duty option for demanding applications
   - **Capacity**: 5,000 lbs  
   - **Fuel Type**: Diesel
   - **Key Features**: Robust construction, outdoor capabilities

## Next Steps

1. **Review** the specifications above
2. **Consider** your specific operating environment
3. **Schedule** a demonstration for hands-on evaluation
\`\`\`

### Formatting Rules:
- Use numbered lists for sequential items, recommendations, or multiple options
- Use **bold** for product names, specifications, and key terms
- Organize content with logical headers
- Ensure lists have proper spacing and structure
- End responses with clear next steps when appropriate`;

    if (Object.keys(requirements).length > 0) {
      systemMessage += `\n\n## Current Customer Requirements:\n${JSON.stringify(requirements, null, 2)}`;
    }
    
    if (Object.keys(context).length > 0) {
      systemMessage += `\n\n## Session Context:\n${JSON.stringify(context, null, 2)}`;
    }
    
    // Add comprehensive filter generation instructions
    systemMessage += generateFilterInstructions();
    
    systemMessage += `\n\n## Technical Instructions:
- ALWAYS use generate_product_filters for product-related requests
- Include recommend_products for specific product suggestions  
- Maintain professional CPQ sales assistant persona
- Format responses with proper markdown for optimal presentation`;
    
    return systemMessage;
  }

  // Upload files for conversation
  async uploadFiles(files) {
    const fileIds = [];
    
    for (const file of files) {
      const uploadResult = await this.openai.uploadFile(file.buffer, file.originalname);
      fileIds.push(uploadResult.id);
    }
    
    return fileIds;
  }
}

export default ConversationService;