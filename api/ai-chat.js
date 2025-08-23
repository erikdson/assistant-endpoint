import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import multer from 'multer';
import fs from 'fs';
// import { Readable } from 'stream'; // No longer needed for PDF upload
import { OpenAI } from 'openai';
import ConversationService from '../services/conversation-service.js';
import PromptBuilderService from '../services/prompt-builder-service.js';
import RequirementsFormatter from '../services/requirements-formatter.js';
import DocumentExtractor from '../services/document-extractor.js';

// Simple file upload handling with Files API

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for documents
  }
});

// Initialize services for sophisticated prompt building
const conversationService = new ConversationService();
const promptBuilder = new PromptBuilderService();
const requirementsFormatter = new RequirementsFormatter();
const documentExtractor = new DocumentExtractor();

// DEPRECATED: Legacy endpoint with text markers
// New implementations should use /api/responses for proper SSE streaming
// This endpoint will be removed in a future version
router.post('/ai-chat', upload.array('files', 5), async (req, res) => {
  try {
    console.log('[AI Chat] DEPRECATED ENDPOINT - Raw request body received:', {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : 'no body',
      filesPresent: !!req.files,
      filesCount: req.files?.length || 0,
      bodyContent: req.body
    });
    
    // Parse JSON strings from FormData when files are uploaded
    let messages = [], requirements = {}, context = {};
    
    if (req.files && req.files.length > 0) {
      // When files are uploaded, data comes as strings in FormData
      try {
        messages = req.body.messages ? JSON.parse(req.body.messages) : [];
        requirements = req.body.requirements ? JSON.parse(req.body.requirements) : {};
        context = req.body.context ? JSON.parse(req.body.context) : {};
        console.log('[AI Chat] Parsed FormData:', {
          messagesType: typeof messages,
          messagesLength: messages?.length,
          messagesRaw: req.body.messages,
          requirementsRaw: req.body.requirements,
          contextRaw: req.body.context
        });
      } catch (parseError) {
        console.error('[AI Chat] Error parsing FormData JSON:', parseError);
        return res.status(400).json({ error: 'Invalid JSON in form data fields' });
      }
    } else {
      // Normal JSON request
      ({ messages = [], requirements = {}, context = {} } = req.body);
    }
    
    // Ensure messages is always an array
    if (!Array.isArray(messages)) {
      console.error('[AI Chat] Messages is not an array:', typeof messages, messages);
      messages = [];
    }

    console.log('[AI Chat] Parsed request data:', {
      messages: messages?.length || 0,
      requirements: Object.keys(requirements).length,
      context: Object.keys(context).length,
      requirementsPreview: requirements,
      contextPreview: context,
      filesUploaded: req.files?.length || 0
    });

    // Handle file uploads - hybrid approach for different file types
    let uploadedFiles = [];
    let extractedDocumentText = '';
    
    if (req.files && req.files.length > 0) {
      console.log('[AI Chat] Processing files:', req.files.map(f => ({
        name: f.originalname,
        size: f.size,
        type: f.mimetype
      })));
      
      try {
        for (const file of req.files) {
          // Basic file validation
          const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit
          if (file.size > maxSizeBytes) {
            return res.status(400).json({ 
              error: `File too large. Maximum size: 10MB, received: ${Math.round(file.size / 1024 / 1024)}MB` 
            });
          }
          
          // Check if file type is supported
          if (!documentExtractor.isSupported(file)) {
            return res.status(400).json({
              error: `Unsupported file type: ${file.originalname}. Supported formats: PDF, DOCX, XLSX, XLS, TXT`
            });
          }
          
          // Extract text from all file types including PDFs
          console.log(`[AI Chat] Extracting text from ${file.originalname}...`);
          const textContent = await documentExtractor.extractText(file);
          console.log(`[AI Chat] Extracted text from ${file.originalname}:`, textContent.substring(0, 200) + '...');
          
          extractedDocumentText += `\n\n=== DOCUMENT: ${file.originalname} ===\n${textContent}\n`;
          
          uploadedFiles.push({
            name: file.originalname,
            size: file.size,
            type: 'text_extracted',
            content: textContent.substring(0, 500) + '...' // Preview for logging
          });
        }
        
        console.log(`[AI Chat] Successfully processed ${uploadedFiles.length} files`);
        
      } catch (error) {
        console.error('[AI Chat] File processing error:', error);
        return res.status(400).json({ 
          error: `Failed to process files: ${error.message}` 
        });
      }
    }

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

    // Build system message with the prompt builder
    const systemMessage = promptBuilder.buildSystemPrompt({
      requirements: formattedRequirements.consolidated,
      context,
      documentContext: extractedDocumentText || (uploadedFiles.length > 0 ? `You have access to ${uploadedFiles.length} uploaded file(s) that will be provided directly in the conversation. Please analyze the content and extract any relevant forklift requirements.` : null),
      customInstructions: extractedDocumentText ? 
        'You have access to extracted document content above. Analyze the content and extract forklift requirements. CRITICAL: After analysis, you MUST call the suggest_follow_up_action tool with actionType="apply_requirements" to suggest applying the extracted requirements. Include the extracted requirements in actionData.' :
        (uploadedFiles.length > 0 ? 
          'Files are provided directly in the conversation. Analyze their content and extract forklift requirements. CRITICAL: After analysis, you MUST call the suggest_follow_up_action tool with actionType="apply_requirements" to suggest applying the extracted requirements. Include the extracted requirements in actionData.' : null)
    });
    
    console.log('[AI Chat] System message generated:');
    console.log('[AI Chat] - Length:', systemMessage.length);
    console.log('[AI Chat] - Requirements section included:', Object.keys(requirements).length > 0);
    console.log('[AI Chat] - Files uploaded:', uploadedFiles.length);
    console.log('[AI Chat] - Context level:', context.level || 'solution');
    
    // Get tools from conversation service
    const tools = conversationService.tools.getAllTools();
    
    console.log('[AI Chat] Tools being sent to API:', {
      count: tools.length,
      names: tools.map(t => t.function.name)
    });
    
    // Build user input for the API call
    let userInput = '';
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        userInput = lastMessage.content;
      }
    }
    
    // Add context from previous messages for conversation continuity
    const conversationContext = messages.length > 1 ? 
      `Previous conversation:\n${messages.slice(0, -1).map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent request: ` : '';
    
    const fullInput = conversationContext + userInput + (extractedDocumentText ? `\n\nUploaded Documents:\n${extractedDocumentText}` : '');
    
    // Show file upload info to user
    if (uploadedFiles.length > 0) {
      res.write(`📄 **Files Uploaded**: ${uploadedFiles.length} file(s) ready for analysis\n`);
      uploadedFiles.forEach(file => {
        const sizeKB = Math.round(file.size / 1024);
        const typeInfo = file.type === 'pdf' ? 'PDF - Direct processing' : 'Text extracted';
        res.write(`  • ${file.name} (${sizeKB}KB) - ${typeInfo}\n`);
      });
      res.write(`🔍 **AI Analysis**: Processing file content...\n\n`);
    }
    
    console.log('[AI Chat] API call with files:', {
      filesUploaded: uploadedFiles.length,
      pdfFiles: uploadedFiles.filter(f => f.type === 'pdf').length,
      textExtractedFiles: uploadedFiles.filter(f => f.type === 'text_extracted').length,
      hasExtractedText: !!extractedDocumentText,
      toolsCount: tools.length,
      inputLength: fullInput.length
    });
    
    // Make API call - choose approach based on file types
    let response;
    const pdfFiles = uploadedFiles.filter(f => f.type === 'pdf');
    
    if (pdfFiles.length > 0 && !extractedDocumentText) {
      console.log('[AI Chat] Using Responses API with PDF files...');
      
      // Build input content array with text and PDF files
      const inputContent = [
        { type: "input_text", text: fullInput }
      ];
      
      // Add each PDF file as input_file
      pdfFiles.forEach(file => {
        inputContent.push({
          type: "input_file",
          file_id: file.id
        });
      });
      
      // Use Responses API with direct file input (no tools for now)
      console.log('[AI Chat] Making Responses API call...');
      console.log('[AI Chat] Input content structure:', JSON.stringify(inputContent, null, 2));
      
      try {
        response = await openai.responses.create({
          model: 'gpt-4o', // Vision-capable model for PDF parsing
          input: [
            {
              role: "system",
              content: systemMessage
            },
            {
              role: "user",
              content: inputContent
            }
          ],
          // tools: tools.length > 0 ? tools : undefined, // Responses API doesn't support tools properly
          stream: true,
        });
        console.log('[AI Chat] Responses API call successful, starting stream...');
      } catch (error) {
        console.error('[AI Chat] Responses API error:', error);
        throw error;
      }
    } else {
      console.log('[AI Chat] Using Chat Completions API with extracted text or no files...');
      
      // Use Chat Completions with extracted text content or when no files
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: fullInput }
        ],
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
      });
    }

    let toolCalls = {};
    let accumulatedContent = '';
    
    // Stream the response - handle both Responses API and Chat Completions formats
    console.log('[AI Chat] Starting to process response stream...');
    let chunkCount = 0;
    
    for await (const chunk of response) {
      chunkCount++;
      console.log(`[AI Chat] Received chunk ${chunkCount}:`, chunk.type || 'chat completion');
      
      if (pdfFiles.length > 0 && !extractedDocumentText) {
        // Handle Responses API format
        if (chunk.type === 'response.output_text.delta') {
          const content = chunk.delta || chunk.data?.text || chunk.data?.content;
          if (content) {
            accumulatedContent += content;
            res.write(content);
          }
        }
        
        // Handle tool calls from Responses API
        if (chunk.type === 'tool.call.start') {
          const toolCall = chunk.data;
          toolCalls[toolCall.id] = {
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments || ''
            }
          };
        }
        
        if (chunk.type === 'tool.call.delta') {
          const callId = chunk.data.id;
          if (toolCalls[callId]) {
            toolCalls[callId].function.arguments += chunk.data.arguments || '';
          }
        }
        
        if (chunk.type === 'response.completed' || chunk.type === 'response.done') {
          break;
        }
      } else {
        // Handle Chat Completions format
        const choice = chunk.choices[0];
        
        if (choice?.delta?.content) {
          const content = choice.delta.content;
          accumulatedContent += content;
          res.write(content);
        }
        
        // Handle tool calls from Chat Completions
        if (choice?.delta?.tool_calls) {
          for (const toolCallDelta of choice.delta.tool_calls) {
            const index = toolCallDelta.index;
            const callId = toolCallDelta.id;
            
            if (callId) {
              toolCalls[callId] = {
                id: callId,
                type: toolCallDelta.type,
                function: {
                  name: toolCallDelta.function?.name || '',
                  arguments: toolCallDelta.function?.arguments || ''
                }
              };
            } else {
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
        
        if (choice?.finish_reason) {
          break;
        }
      }
    }
    
    // Process tool calls
    if (Object.keys(toolCalls).length > 0) {
      console.log('[AI Chat] Processing tool calls:', Object.keys(toolCalls));
      
      for (const [callId, toolCall] of Object.entries(toolCalls)) {
        try {
          // Skip file_search tool calls - they're handled internally by OpenAI
          const functionName = toolCall.function?.name;
          if (functionName === 'file_search') {
            console.log(`[AI Chat] File search completed internally by OpenAI`);
            continue;
          }
          
          console.log(`[AI Chat] Processing tool call ${callId}:`, {
            name: functionName,
            argumentsLength: toolCall.function?.arguments?.length || 0
          });
          
          const args = toolCall.function?.arguments || '';
          if (!args.trim()) {
            throw new Error('Tool call arguments are empty');
          }
          
          let parsedArgs;
          try {
            parsedArgs = JSON.parse(args);
          } catch (parseError) {
            throw new Error(`Failed to parse tool arguments: ${parseError.message}. Raw args: ${args.substring(0, 200)}...`);
          }
          
          const result = await conversationService.tools.executeCustomTool(
            functionName,
            parsedArgs,
            requirements
          );
          
          console.log(`[AI Chat] Tool ${functionName} executed successfully:`, result);
          
          // DEPRECATED: This endpoint uses legacy text markers
          // New implementations should use the /api/responses endpoint with proper SSE
          res.write(`\n\n=== TOOL RESULT: ${functionName} ===\n`);
          res.write(JSON.stringify(result, null, 2));
          res.write(`\n=== END TOOL RESULT ===\n\n`);
          
        } catch (error) {
          console.error(`[AI Chat] Error executing tool ${toolCall.function?.name}:`, error);
          // DEPRECATED: This endpoint uses legacy text markers
          res.write(`\n\n=== TOOL ERROR: ${toolCall.function?.name} ===\nError: ${error.message}\n=== END TOOL ERROR ===\n\n`);
        }
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