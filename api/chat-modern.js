import express from 'express';
import multer from 'multer';
import { openai } from '@ai-sdk/openai';
import { streamText, tool, convertToModelMessages } from 'ai';
import { z } from 'zod';
import cors from 'cors';
import PromptBuilderService from '../services/prompt-builder-service.js';

const router = express.Router();

// Initialize prompt builder service
const promptBuilder = new PromptBuilderService();

// Configure multer for file uploads with enhanced limits and filtering
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 25 * 1024 * 1024, // 25MB limit (increased for larger documents)
    files: 10 // Allow up to 10 files
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedMimes = [
      'text/plain', 'text/csv', 'application/json',
      'application/pdf', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream' // For files with unknown MIME type
    ];
    
    const allowedExtensions = ['txt', 'csv', 'json', 'pdf', 'xls', 'xlsx', 'docx'];
    const ext = file.originalname.split('.').pop().toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} (${ext}) not supported. Allowed: ${allowedExtensions.join(', ')}`), false);
    }
  }
});

// Configure CORS for development
router.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}));

// Tool schemas using Zod
const generateProductFiltersSchema = z.object({
  filters: z.array(z.object({
    field: z.enum([
      'loadCapacity', 'liftHeight', 'operatingEnvironment', 'floorSurface',
      'aisleWidth', 'budgetRange', 'loadType', 'attachments', 'operatingHours',
      'powerSource', 'deliveryUrgency'
    ]),
    type: z.enum(['singleselect', 'multiselect', 'range', 'text']),
    label: z.string(),
    value: z.any()
  }))
});

const recommendProductsSchema = z.object({
  requirements: z.object({
    loadCapacity: z.array(z.number()).optional(),
    budgetRange: z.object({
      min: z.number(),
      max: z.number()
    }).optional(),
    powerSource: z.enum(['electric', 'diesel', 'lpg', 'hybrid']).optional(),
    operatingEnvironment: z.enum(['indoor', 'outdoor', 'mixed']).optional(),
    liftHeight: z.array(z.number()).optional()
  }),
  maxResults: z.number().default(6)
});

const suggestFollowUpSchema = z.object({
  actionType: z.enum([
    'apply_requirements', 'generate_quote', 'schedule_demo',
    'request_info', 'configure_product', 'compare_products'
  ]),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  userMessage: z.string(),
  actionData: z.object({}).optional(),
  confidence: z.number().min(0).max(1).default(0.8)
});

// Enhanced document extraction for multiple file types
async function extractTextFromFile(file) {
  console.log(`[File Processing] Processing ${file.originalname} (${file.mimetype})`);
  
  try {
    // Get file extension for fallback detection
    const ext = file.originalname.split('.').pop().toLowerCase();
    
    if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv' || ext === 'txt' || ext === 'csv') {
      return file.buffer.toString('utf-8');
    } else if (file.mimetype === 'application/json' || ext === 'json') {
      const jsonContent = JSON.parse(file.buffer.toString('utf-8'));
      return `JSON Content: ${JSON.stringify(jsonContent, null, 2)}`;
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.mimetype === 'application/vnd.ms-excel' || ext === 'xlsx' || ext === 'xls') {
      // For Excel files, we'll need the xlsx library that's already installed
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const csvData = XLSX.utils.sheet_to_csv(worksheet);
      return `Excel Data (${sheetName}):\n${csvData}`;
    } else if (file.mimetype === 'application/pdf' || ext === 'pdf') {
      // PDF processing using pdf-parse (already installed)
      const pdfParse = await import('pdf-parse');
      const pdfData = await pdfParse.default(file.buffer);
      return `PDF Content (${pdfData.numpages} pages):\n${pdfData.text}`;
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
      // Word documents using mammoth (already installed)
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return `Word Document Content:\n${result.value}`;
    } else {
      console.log(`[File Processing] Unsupported file type: ${file.mimetype}`);
      return `File: ${file.originalname} (${file.mimetype}) - Content extraction not supported for this file type.`;
    }
  } catch (error) {
    console.error(`[File Processing] Error processing ${file.originalname}:`, error.message);
    return `File: ${file.originalname} - Error during processing: ${error.message}`;
  }
}

// Enhanced input validation middleware
function validateRequest(req, res, next) {
  console.log('[Validation] Full request body:', JSON.stringify(req.body, null, 2));
  
  // Handle both AI SDK format (messages array) and legacy format (single message)
  let message;
  
  if (req.body.messages && Array.isArray(req.body.messages)) {
    // AI SDK format - extract last user message
    const userMessages = req.body.messages.filter(msg => msg.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (lastUserMessage && lastUserMessage.parts) {
      // Handle parts format (AI SDK 5.0 format)
      const textPart = lastUserMessage.parts.find(part => part.type === 'text');
      message = textPart ? textPart.text : '';
    } else if (lastUserMessage && lastUserMessage.content) {
      // Handle content format (legacy)
      message = lastUserMessage.content;
    }
    
    // Store processed message back in req.body for consistency
    req.body.processedMessage = message;
  } else {
    // Legacy format
    message = req.body.message;
    req.body.processedMessage = message;
  }
  
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Invalid request',
      details: 'Message is required and must be a non-empty string'
    });
  }
  
  if (message.length > 10000) {
    return res.status(400).json({ 
      error: 'Message too long',
      details: 'Message must be less than 10,000 characters'
    });
  }
  
  next();
}

// AI SDK v5 compatible endpoint (handles standard AI SDK format without files)
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('[AI SDK v5] Processing AI SDK request');
    console.log('[AI SDK v5] Request body keys:', Object.keys(req.body));
    
    const { messages = [] } = req.body;
    
    if (!messages || messages.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request',
        details: 'Messages array is required'
      });
    }

    // Extract the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({ 
        error: 'Invalid request',
        details: 'Last message must be from user'
      });
    }

    // Extract text content from message parts
    const textParts = lastMessage.parts?.filter(part => part.type === 'text') || [];
    const messageText = textParts.map(part => part.text).join('\\n');
    
    console.log('[AI SDK v5] Message text:', messageText);
    
    // Check for file attachments in message parts
    const fileParts = lastMessage.parts?.filter(part => part.type === 'file' || part.type === 'image') || [];
    let documentContext = '';
    
    if (fileParts.length > 0) {
      console.log(`[AI SDK v5] Found ${fileParts.length} file attachment(s)`);
      
      // Process each file part (data URLs)
      for (const filePart of fileParts) {
        try {
          if (filePart.url && filePart.url.startsWith('data:')) {
            // Extract content from data URL
            const [header, base64Data] = filePart.url.split(',');
            const mimeType = filePart.mediaType || header.split(';')[0].replace('data:', '');
            
            // Decode base64 content
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Create a file-like object for processing
            const fileObject = {
              originalname: `attachment_${Date.now()}`, // Generate a filename
              mimetype: mimeType,
              buffer: buffer,
              size: buffer.length
            };
            
            console.log(`[AI SDK v5] Processing data URL file: ${mimeType}, size: ${buffer.length}`);
            const extractedText = await extractTextFromFile(fileObject);
            documentContext += `\\n\\n--- File: ${fileObject.originalname} (${mimeType}) ---\\n${extractedText}\\n--- End of file ---`;
          }
        } catch (error) {
          console.error(`[AI SDK v5] Error processing file attachment:`, error);
          documentContext += `\\n\\n--- File attachment (extraction failed: ${error.message}) ---`;
        }
      }
      
      // Remove file parts from the last message since we've processed them into text
      // Create a new message with only text parts
      const cleanedLastMessage = {
        ...lastMessage,
        parts: textParts
      };
      
      // Update the messages array with the cleaned message
      const messagesWithoutFiles = [...messages.slice(0, -1), cleanedLastMessage];
      messages.splice(0, messages.length, ...messagesWithoutFiles);
    }

    // Build system message with basic context in AI SDK v5 UI format
    const systemMessage = {
      role: 'system',
      parts: [
        {
          type: 'text',
          text: promptBuilder.buildSystemPrompt({
            requirements: {},
            context: {},
            documentContext: documentContext
          })
        }
      ]
    };

    // Prepare messages for AI SDK - convert UI messages to core messages
    const uiMessages = [
      systemMessage,
      ...messages
    ];
    
    // Convert to model messages format
    const modelMessages = convertToModelMessages(uiMessages);

    console.log('[AI SDK v5] Starting AI SDK streamText...');

    // Use AI SDK Core for streaming
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: modelMessages,
      tools: {
        generate_product_filters: tool({
          description: 'Convert user requirements into structured filter criteria for the CPQ system.',
          inputSchema: generateProductFiltersSchema,
          execute: async ({ filters }) => {
            console.log('[AI SDK v5] Tool: generate_product_filters executed');
            return {
              success: true,
              filters: filters,
              message: 'Product filters generated successfully',
              confidence: 0.9
            };
          }
        }),
        recommend_products: tool({
          description: 'Find matching forklift products based on user requirements.',
          inputSchema: recommendProductsSchema,
          execute: async ({ requirements, maxResults }) => {
            console.log('[AI SDK v5] Tool: recommend_products executed');
            
            const mockProducts = [
              {
                id: 'FL-001',
                name: 'Toyota 8FGCU25',
                capacity: 2500,
                liftHeight: 3000,
                powerSource: requirements.powerSource || 'electric',
                price: 45000,
                matchScore: 0.95
              },
              {
                id: 'FL-002',
                name: 'Hyster H50FT',
                capacity: 2270,
                liftHeight: 3200,
                powerSource: 'diesel',
                price: 52000,
                matchScore: 0.87
              }
            ];

            return {
              success: true,
              recommendations: mockProducts.slice(0, maxResults),
              totalMatches: mockProducts.length,
              reasoning: 'Selected based on load capacity and power source requirements',
              topCriteria: Object.keys(requirements)
            };
          }
        }),
        suggest_follow_up_action: tool({
          description: 'Suggest contextual follow-up actions when the user would benefit from guidance.',
          inputSchema: suggestFollowUpSchema,
          execute: async (params) => {
            console.log('[AI SDK v5] Tool: suggest_follow_up_action executed');
            return {
              success: true,
              ...params,
              timestamp: new Date().toISOString()
            };
          }
        })
      },
    });

    console.log('[AI SDK v5] Streaming to client...');
    const streamStartTime = Date.now();

    // Convert to UI stream response format
    const uiResponse = result.toUIMessageStreamResponse({
      sendSources: false,
      sendReasoning: false,
    });
    
    // Copy headers from AI SDK response
    for (const [key, value] of uiResponse.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // Stream the UI response
    let chunkCount = 0;
    let totalBytes = 0;
    const reader = uiResponse.body.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      if (res.destroyed) {
        console.log('[AI SDK v5] Client disconnected during streaming');
        break;
      }
      
      res.write(value);
      chunkCount++;
      totalBytes += value.length;
    }
    
    res.end();
    
    // Log performance metrics
    const totalTime = Date.now() - startTime;
    const streamTime = Date.now() - streamStartTime;
    
    console.log(`[AI SDK v5] Request completed in ${totalTime}ms (streaming: ${streamTime}ms)`);
    console.log(`[AI SDK v5] Streamed ${chunkCount} chunks, ${totalBytes} bytes total`);

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[AI SDK v5] Error after ${totalTime}ms:`, error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        requestTime: totalTime
      });
    }
  }
});

// Modern AI SDK Core-based streaming endpoint (with file upload support)
router.post('/create', upload.array('files', 10), validateRequest, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('[AI SDK Core] Processing new request');
    console.log('[AI SDK Core] Request body keys:', Object.keys(req.body));
    
    // Use the processed message from validation
    const message = req.body.processedMessage;
    
    // Parse JSON strings from FormData (when files are uploaded, data comes as strings)
    let requirements = req.body.requirements || {};
    let context = req.body.context || {};
    
    if (typeof requirements === 'string') {
      try {
        requirements = JSON.parse(requirements);
      } catch (e) {
        console.warn('[AI SDK Core] Failed to parse requirements JSON:', e.message);
        requirements = {};
      }
    }
    
    if (typeof context === 'string') {
      try {
        context = JSON.parse(context);
      } catch (e) {
        console.warn('[AI SDK Core] Failed to parse context JSON:', e.message);
        context = {};
      }
    }
    
    console.log('[AI SDK Core] Processed message:', message);

    // Initialize file processing errors array
    let fileProcessingErrors = [];

    // Validate requirements object structure
    if (requirements && typeof requirements !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid requirements format',
        details: 'Requirements must be an object'
      });
    }

    // Validate context object structure
    if (context && typeof context !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid context format',
        details: 'Context must be an object'
      });
    }

    console.log('[AI SDK Core] Message:', message);
    console.log('[AI SDK Core] Requirements:', Object.keys(requirements));
    console.log('[AI SDK Core] Context:', Object.keys(context));
    console.log('[AI SDK Core] Files:', req.files?.length || 0);

    // Process uploaded files if present with enhanced error handling
    let documentContext = '';
    
    if (req.files && req.files.length > 0) {
      console.log('[AI SDK Core] Processing', req.files.length, 'uploaded files');
      
      for (const file of req.files) {
        try {
          // Add file size check
          if (file.size === 0) {
            console.warn(`[File Processing] Skipping empty file: ${file.originalname}`);
            fileProcessingErrors.push(`${file.originalname}: File is empty`);
            continue;
          }
          
          const extractedText = await extractTextFromFile(file);
          documentContext += `\\n\\n--- File: ${file.originalname} ---\\n${extractedText}\\n--- End of ${file.originalname} ---`;
        } catch (error) {
          console.error(`[File Processing] Error processing ${file.originalname}:`, error.message);
          fileProcessingErrors.push(`${file.originalname}: ${error.message}`);
          documentContext += `\\n\\n--- File: ${file.originalname} (extraction failed: ${error.message}) ---`;
        }
      }
      
      // Log file processing summary
      if (fileProcessingErrors.length > 0) {
        console.log(`[File Processing] Completed with ${fileProcessingErrors.length} errors:`, fileProcessingErrors);
      }
    }

    // Build system message
    const systemContent = buildSystemMessage(requirements, context, documentContext);

    // Prepare messages
    const messages = [
      {
        role: 'system',
        content: systemContent
      },
      {
        role: 'user',
        content: message
      }
    ];

    console.log('[AI SDK Core] Starting AI SDK streamText...');

    // Use AI SDK Core for streaming with corrected tool syntax
    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages,
      tools: {
        generate_product_filters: tool({
          description: 'Convert user requirements into structured filter criteria for the CPQ system.',
          inputSchema: generateProductFiltersSchema,
          execute: async ({ filters }) => {
            console.log('[AI SDK Core] Tool: generate_product_filters executed with', filters.length, 'filters');
            return {
              success: true,
              filters,
              explanation: `Generated ${filters.length} filter criteria based on requirements`,
              confidence: 0.9
            };
          }
        }),
        recommend_products: tool({
          description: 'Find matching forklift products based on user requirements.',
          inputSchema: recommendProductsSchema,
          execute: async ({ requirements, maxResults }) => {
            console.log('[AI SDK Core] Tool: recommend_products executed');
            
            // Mock product recommendations
            const mockProducts = [
              {
                id: 'FL-001',
                name: 'Toyota 8FGCU25',
                capacity: 2500,
                liftHeight: 3000,
                powerSource: requirements.powerSource || 'electric',
                price: 45000,
                matchScore: 0.95
              },
              {
                id: 'FL-002',
                name: 'Hyster H50FT',
                capacity: 2270,
                liftHeight: 3200,
                powerSource: 'diesel',
                price: 52000,
                matchScore: 0.87
              }
            ];

            return {
              success: true,
              recommendations: mockProducts.slice(0, maxResults),
              totalMatches: mockProducts.length,
              reasoning: 'Selected based on load capacity and power source requirements',
              topCriteria: Object.keys(requirements)
            };
          }
        }),
        suggest_follow_up_action: tool({
          description: 'Suggest contextual follow-up actions when the user would benefit from guidance.',
          inputSchema: suggestFollowUpSchema,
          execute: async (params) => {
            console.log('[AI SDK Core] Tool: suggest_follow_up_action executed');
            return {
              success: true,
              ...params,
              timestamp: new Date().toISOString()
            };
          }
        })
      },
      temperature: 0.7,
      maxTokens: 4000
    });

    console.log('[AI SDK Core] Streaming to client...');
    const streamStartTime = Date.now();

    // Set proper streaming headers with additional performance hints
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Use AI SDK's built-in UI message stream response (the correct method for AI Elements!)
    const uiResponse = result.toUIMessageStreamResponse({
      sendSources: false,
      sendReasoning: false,
    });
    
    // Copy headers from AI SDK response
    for (const [key, value] of uiResponse.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // Stream the UI response
    let chunkCount = 0;
    let totalBytes = 0;
    
    try {
      const reader = uiResponse.body?.getReader();
      if (!reader) {
        throw new Error('No UI response body reader available');
      }
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        if (res.destroyed) {
          console.log('[AI SDK Core] Client disconnected during streaming');
          break;
        }
        
        res.write(value);
        chunkCount++;
        totalBytes += value.length;
      }
      
      res.end();
      
      // Log performance metrics
      const totalTime = Date.now() - startTime;
      const streamTime = Date.now() - streamStartTime;
      
      console.log(`[AI SDK Core] Request completed in ${totalTime}ms (streaming: ${streamTime}ms)`);
      console.log(`[AI SDK Core] Streamed ${chunkCount} chunks, ${totalBytes} bytes total`);
      
    } catch (streamError) {
      console.error('[AI SDK Core] Streaming error:', streamError);
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Streaming error',
          message: streamError.message
        });
      } else {
        // Headers already sent, can't send JSON response
        res.write(`\\n\\n[Error: ${streamError.message}]`);
        res.end();
      }
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[AI SDK Core] Error after ${totalTime}ms:`, error);
    
    // Enhanced error responses based on error type
    let statusCode = 500;
    let errorResponse = {
      error: 'Internal server error',
      message: error.message,
      requestTime: totalTime
    };
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorResponse.error = 'Validation error';
    } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
      statusCode = 429;
      errorResponse.error = 'Rate limit exceeded';
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
      errorResponse.error = 'Request timeout';
    }
    
    if (fileProcessingErrors && fileProcessingErrors.length > 0) {
      errorResponse.fileErrors = fileProcessingErrors;
    }
    
    res.status(statusCode).json(errorResponse);
  }
});

// Enhanced health check with system information
router.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.json({ 
    status: 'healthy', 
    api: 'ai-sdk-core',
    version: '2.0',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    },
    features: {
      fileUpload: true,
      toolCalling: true,
      streaming: true,
      supportedFormats: ['txt', 'csv', 'json', 'pdf', 'xlsx', 'docx']
    }
  });
});

// Mock forklift products data (matching frontend Product type)
const mockProducts = [
  {
    id: "prod-VD-005-X",
    modelName: "VD-005-X",
    powerSource: "electric",
    loadCapacity: 7000,
    liftHeight: 4500,
    turningRadius: 2200,
    tireType: "Pneumatic",
    operatingEnvironment: "mixed",
    soundLevel: 66,
    dimensions: { length: 2650, width: 1160, height: 2150 },
    listPrice: 53000,
    complianceStandards: ["EN 1005", "NIOSH", "ISO 9241"],
    matchScore: 90,
    semanticTags: ["high load capacity", "meets safety compliance", "ideal for mixed environments"],
    description: "High-performance electric forklift with advanced battery technology.",
    aisleWidth: 2500,
    floorSurface: ['smooth-concrete', 'rough-concrete'],
    loadType: 'pallets',
    attachments: ['forks', 'clamp'],
    operatingHours: 'medium'
  },
  {
    id: "prod-LK-127-U",
    modelName: "LK-127-U", 
    powerSource: "electric",
    loadCapacity: 8000,
    liftHeight: 5000,
    turningRadius: 2400,
    tireType: "SE",
    operatingEnvironment: "indoor",
    soundLevel: 70,
    dimensions: { length: 2700, width: 1120, height: 2200 },
    listPrice: 51000,
    complianceStandards: ["EN 1005", "ISO 9241"],
    matchScore: 87,
    semanticTags: ["high load capacity", "optimized for indoor use", "high maneuverability"],
    description: "Versatile electric forklift designed for medium to heavy-duty applications.",
    aisleWidth: 2500,
    floorSurface: ['smooth-concrete'],
    loadType: 'pallets',
    attachments: ['forks', 'clamp'],
    operatingHours: 'medium'
  },
  {
    id: "prod-HD-450-D",
    modelName: "HD-450-D",
    powerSource: "diesel",
    loadCapacity: 4500,
    liftHeight: 4000,
    turningRadius: 2800,
    tireType: "Pneumatic", 
    operatingEnvironment: "outdoor",
    soundLevel: 85,
    dimensions: { length: 2900, width: 1200, height: 2300 },
    listPrice: 45000,
    complianceStandards: ["EN 1005"],
    fuelEfficiency: 8.9,
    matchScore: 72,
    semanticTags: ["optimized for outdoor use", "high fuel efficiency", "meets safety compliance"],
    description: "Heavy-duty diesel forklift designed for outdoor applications.",
    aisleWidth: 2500,
    floorSurface: ['rough-concrete', 'asphalt'],
    loadType: 'pallets',
    attachments: ['forks', 'clamp'],
    operatingHours: 'medium'
  },
  {
    id: "prod-HY-520-H",
    modelName: "HY-520-H",
    powerSource: "hybrid",
    loadCapacity: 5200,
    liftHeight: 4500,
    turningRadius: 2350,
    tireType: "Pneumatic",
    operatingEnvironment: "mixed", 
    soundLevel: 72,
    dimensions: { length: 2650, width: 1180, height: 2200 },
    listPrice: 58000,
    complianceStandards: ["EN 1005", "NIOSH", "ISO 9241"],
    fuelEfficiency: 12.5,
    matchScore: 65,
    semanticTags: ["low emissions", "high fuel efficiency", "ideal for mixed environments"],
    description: "Advanced hybrid forklift combining electric and combustion power.",
    aisleWidth: 2500,
    floorSurface: ['smooth-concrete'],
    loadType: 'pallets',
    attachments: ['forks', 'clamp'],
    operatingHours: 'medium'
  }
];

// Products API endpoint
router.get('/products', (req, res) => {
  console.log('[Products API] Fetching products list');
  
  try {
    // Add some basic filtering if query parameters are provided
    let filteredProducts = [...mockProducts];
    
    const { powerSource, minPrice, maxPrice, limit } = req.query;
    
    if (powerSource) {
      filteredProducts = filteredProducts.filter(p => p.powerSource === powerSource);
    }
    
    if (minPrice) {
      filteredProducts = filteredProducts.filter(p => p.listPrice >= parseInt(minPrice));
    }
    
    if (maxPrice) {
      filteredProducts = filteredProducts.filter(p => p.listPrice <= parseInt(maxPrice));
    }
    
    if (limit) {
      filteredProducts = filteredProducts.slice(0, parseInt(limit));
    }
    
    console.log(`[Products API] Returning ${filteredProducts.length} products`);
    
    res.json({
      success: true,
      products: filteredProducts,
      total: filteredProducts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Products API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

// Individual product endpoint
router.get('/products/:id', (req, res) => {
  console.log('[Products API] Fetching product:', req.params.id);
  
  try {
    const product = mockProducts.find(p => p.id === req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        productId: req.params.id
      });
    }
    
    res.json({
      success: true,
      product,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Products API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
      message: error.message
    });
  }
});

// Helper function to build system message
function buildSystemMessage(requirements, context, documentContext = '') {
  let systemContent = `You are an expert forklift sales assistant for a Configure Price Quote (CPQ) system. You provide professional, conversational guidance to help customers find the perfect forklift solutions.

## Core Behavior:
- Always be professional, knowledgeable, and helpful
- Provide clear, actionable advice based on customer needs
- Use proper business communication tone
- Focus on matching customer requirements with product capabilities
- Ask clarifying questions when requirements are unclear

## Response Format Requirements:
**CRITICAL**: You MUST format ALL responses using proper markdown syntax.

### Required Formatting:
1. **Headers**: Use # ## ### for section organization
2. **Lists**: Always use numbered lists (1. 2. 3.) for recommendations
3. **Emphasis**: Use **bold** for key terms and specifications
4. **Structure**: Organize information logically with clear sections`;

  // Add current requirements
  if (Object.keys(requirements).length > 0) {
    const reqText = Object.entries(requirements)
      .map(([key, value]) => {
        const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
        return `- **${displayKey}**: ${displayValue}`;
      })
      .join('\\n');
    
    systemContent += `\\n\\n## Current Customer Requirements:\\n${reqText}`;
  }

  // Add session context
  if (context.level) {
    systemContent += `\\n\\n## Session Context:\\n- **Level**: ${context.level}\\n- **ID**: ${context.id || 'Unknown'}`;
  }

  // Add document context if files were uploaded
  if (documentContext) {
    systemContent += `\\n\\n## Uploaded Documents:${documentContext}`;
  }

  return systemContent;
}


export default router;