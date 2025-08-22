import fetch from 'node-fetch';
import { FormData } from 'formdata-node';

/**
 * OpenAI Service Layer - Abstracts OpenAI API interactions
 * Supports both legacy Assistant API and new Responses API
 */
class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.assistantId = process.env.OPENAI_ASSISTANT_ID;
    this.useResponsesAPI = process.env.USE_RESPONSES_API === 'true';
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  // Common headers for OpenAI API requests
  getHeaders(includeAssistantBeta = false) {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    
    if (includeAssistantBeta) {
      headers['OpenAI-Beta'] = 'assistants=v2';
    }
    
    return headers;
  }

  // Legacy Assistant API Methods
  async createThread() {
    const response = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create thread: ${response.status}`);
    }
    
    return await response.json();
  }

  async addMessage(threadId, message, attachments = null) {
    const payload = {
      role: 'user',
      content: message
    };
    
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      payload.attachments = attachments.map(fileId => ({
        file_id: fileId,
        tools: [{ type: 'file_search' }]
      }));
    }
    
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add message: ${response.status}`);
    }
    
    return await response.json();
  }

  async runAssistant(threadId, tools = []) {
    const payload = {
      assistant_id: this.assistantId
    };
    
    // Add tools if provided (for custom function tools)
    if (tools.length > 0) {
      payload.tools = tools;
    }
    
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to run assistant: ${response.status}`);
    }
    
    return await response.json();
  }

  async getRunStatus(threadId, runId) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
      headers: this.getHeaders(true)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get run status: ${response.status}`);
    }
    
    return await response.json();
  }

  async submitToolOutputs(threadId, runId, toolOutputs) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ tool_outputs: toolOutputs })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to submit tool outputs: ${response.status}`);
    }
    
    return await response.json();
  }

  async getMessages(threadId) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: this.getHeaders(true)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.status}`);
    }
    
    return await response.json();
  }

  async getRunSteps(threadId, runId) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/steps`, {
      headers: this.getHeaders(true)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get run steps: ${response.status}`);
    }
    
    return await response.json();
  }

  // New Responses API Methods (Phase 2)
  async createResponse(messages, tools = [], model = 'gpt-4o') {
    if (!this.useResponsesAPI) {
      throw new Error('Responses API not enabled. Set USE_RESPONSES_API=true');
    }
    
    const payload = {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true // Enable streaming by default
    };
    
    console.log('[OpenAI Service] Creating response with payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenAI Service] Chat completions error:', errorText);
      throw new Error(`Failed to create response: ${response.status} - ${errorText}`);
    }
    
    return response; // Return response object for streaming
  }

  // File upload helper
  async uploadFile(fileBuffer, filename, purpose = 'assistants') {
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: 'application/octet-stream' }), filename);
    formData.append('purpose', purpose);
    
    const response = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.status}`);
    }
    
    return await response.json();
  }
}

export default OpenAIService;