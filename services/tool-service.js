import { getValidProductIds, getProductById, getProductsByFilters } from '../products.js';
import { FILTER_FIELD_DEFINITIONS } from '../config/filter-schema.js';

/**
 * Tool Service - Manages both built-in and custom tools
 * Provides a unified interface for tool execution and management
 */
class ToolService {
  constructor() {
    this.customTools = this.initializeCustomTools();
    this.builtInTools = this.initializeBuiltInTools();
  }

  // Initialize custom function tools (existing TOOL_FUNCTIONS)
  initializeCustomTools() {
    return {
      generate_product_filters: {
        name: "generate_product_filters",
        description: "Convert user requirements into structured filter criteria for the CPQ system. Use this tool when users want to SET or UPDATE their requirements, specify new constraints, or modify existing criteria. Do NOT use for product recommendation requests.",
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
        description: "Find matching forklift products from the catalog based on user requirements. Input user requirements (loadCapacity, budgetRange, powerSource, etc.) and this tool will query the product database to find and score matching products. Do NOT provide product recommendations in the input - this tool generates them. Use for: 'recommend products', 'what products', 'show me forklifts', 'suggest equipment'.",
        parameters: {
          type: "object",
          properties: {
            requirements: {
              type: "object",
              description: "User requirements to match against products",
              properties: {
                loadCapacity: {
                  type: "array",
                  items: { type: "number" },
                  description: "Load capacity range in kg [min, max]"
                },
                budgetRange: {
                  type: "object",
                  properties: {
                    min: { type: "number" },
                    max: { type: "number" }
                  },
                  description: "Budget range in currency"
                },
                powerSource: {
                  type: "string",
                  enum: ["electric", "diesel", "lpg", "hybrid"],
                  description: "Preferred power source"
                },
                operatingEnvironment: {
                  type: "string", 
                  enum: ["indoor", "outdoor", "mixed"],
                  description: "Operating environment"
                },
                liftHeight: {
                  type: "array",
                  items: { type: "number" },
                  description: "Lift height range in mm [min, max]"
                }
              }
            },
            maxResults: {
              type: "number",
              default: 6,
              description: "Maximum number of recommendations to return (default: 6)"
            }
          },
          required: ["requirements"],
          additionalProperties: false
        }
      },
      suggest_follow_up_action: {
        name: "suggest_follow_up_action", 
        description: "Suggest contextual follow-up actions when the user would benefit from guidance. Only call this when: 1) User uploads documents but doesn't specify what to do next, 2) User asks open-ended questions about next steps, 3) Complex workflows need clarification. Do NOT call if user gives clear instructions (like 'apply these requirements' or 'recommend products').",
        parameters: {
          type: "object",
          properties: {
            actionType: {
              type: "string",
              enum: ["apply_requirements", "generate_quote", "schedule_demo", "request_info", "configure_product", "compare_products"],
              description: "Type of follow-up action to suggest"
            },
            priority: {
              type: "string",
              enum: ["high", "medium", "low"],
              default: "medium",
              description: "Priority level of the suggested action"
            },
            userMessage: {
              type: "string",
              description: "Friendly message to display to the user explaining the suggested action"
            },
            actionData: {
              type: "object",
              description: "Additional data needed for the action",
              properties: {
                requirements: {
                  type: "object",
                  description: "Extracted requirements for apply_requirements action"
                },
                productIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "Product IDs for product-related actions"
                },
                context: {
                  type: "string",
                  description: "Additional context about the action"
                }
              },
              additionalProperties: true
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              default: 0.8,
              description: "Confidence score for the suggested action (0.0 to 1.0)"
            }
          },
          required: ["actionType", "userMessage"],
          additionalProperties: false
        }
      }
    };
  }

  // Initialize built-in tools (file_search, code_interpreter, etc.)
  initializeBuiltInTools() {
    return {
      file_search: {
        type: "file_search",
        description: "Search through uploaded files and documents"
      },
      code_interpreter: {
        type: "code_interpreter", 
        description: "Execute Python code and analyze data"
      }
    };
  }

  // Get all tools in the format expected by the API
  getAllTools() {
    // For Chat Completions API, only return function tools
    // Built-in tools like file_search are not supported in Chat Completions
    const customToolsArray = Object.values(this.customTools).map(tool => ({
      type: "function",
      function: tool
    }));
    
    return customToolsArray;
  }

  // Get only custom function tools
  getCustomTools() {
    return Object.values(this.customTools).map(tool => ({
      type: "function",
      function: tool
    }));
  }

  // Get only built-in tools
  getBuiltInTools() {
    return Object.values(this.builtInTools);
  }

  // Execute a custom tool function
  async executeCustomTool(toolName, args, systemRequirements = null) {
    switch (toolName) {
      case 'generate_product_filters':
        return this.executeGenerateProductFilters(args);
      
      case 'recommend_products':
        return this.executeRecommendProducts(args, systemRequirements);
      
      case 'suggest_follow_up_action':
        return this.executeSuggestFollowUpAction(args);
      
      default:
        throw new Error(`Unknown custom tool: ${toolName}`);
    }
  }

  // Validate and correct filter values based on schema
  validateAndCorrectFilters(filters) {
    const correctedFilters = [];
    
    for (const filter of filters) {
      const fieldConfig = FILTER_FIELD_DEFINITIONS[filter.field];
      if (!fieldConfig) {
        console.warn(`[ToolService] Unknown filter field: ${filter.field}`);
        continue;
      }
      
      const correctedFilter = { ...filter };
      
      // Correct type based on schema
      correctedFilter.type = fieldConfig.type;
      
      // Validate and correct values based on field type
      if (fieldConfig.type === 'singleselect' && fieldConfig.options) {
        // Ensure value is one of the valid options
        if (!fieldConfig.options.includes(filter.value)) {
          // Try to map common variations - only for string values
          const valueLower = typeof filter.value === 'string' ? filter.value.toLowerCase() : '';
          const mapping = {
            'outdoor warehouse yard': 'outdoor',
            'outdoor yard': 'outdoor',
            'warehouse yard': 'outdoor',
            'rough concrete': 'rough-concrete',
            'smooth concrete': 'smooth-concrete',
            'clamp attachment': 'clamp',
            'heavy duty': 'heavy',
            'light duty': 'light',
            'full shift': 'heavy',
            '24/7': 'continuous',
            'multi-shift': 'continuous'
          };
          
          correctedFilter.value = mapping[valueLower] || fieldConfig.options[0];
          console.log(`[ToolService] Corrected ${filter.field} value from "${filter.value}" to "${correctedFilter.value}"`);
        }
      } else if (fieldConfig.type === 'multiselect' && fieldConfig.options) {
        // Ensure all values are from valid options
        if (!Array.isArray(filter.value)) {
          correctedFilter.value = [filter.value].filter(v => fieldConfig.options.includes(v));
        } else {
          correctedFilter.value = filter.value.filter(v => fieldConfig.options.includes(v));
        }
      } else if (fieldConfig.type === 'range') {
        // Handle different range formats based on field
        if (filter.field === 'budgetRange') {
          // budgetRange uses {min, max} object format
          if (typeof filter.value === 'object' && filter.value !== null && !Array.isArray(filter.value)) {
            // Already in correct object format
            correctedFilter.value = filter.value;
          } else if (Array.isArray(filter.value) && filter.value.length === 2) {
            // Convert array to object format for budget
            correctedFilter.value = { min: filter.value[0], max: filter.value[1] };
          } else if (filter.min && filter.max) {
            // AI sometimes puts min/max as separate properties
            correctedFilter.value = { min: filter.min, max: filter.max };
          } else if (filter.max && !filter.min) {
            // AI provides only max budget (user sets maximum budget)
            correctedFilter.value = { min: 0, max: filter.max };
          } else if (filter.min && !filter.max) {
            // AI provides only min budget (user sets minimum budget)
            correctedFilter.value = { min: filter.min, max: 100000 };
          } else {
            correctedFilter.value = { min: 0, max: 100000 }; // Default budget
          }
        } else {
          // Other ranges (loadCapacity, liftHeight, etc.) use [min, max] array format
          if (Array.isArray(filter.value) && filter.value.length === 2) {
            // Already in correct array format
            correctedFilter.value = filter.value;
          } else if (typeof filter.value === 'object' && filter.value !== null && filter.value.min && filter.value.max) {
            // Convert object to array format
            correctedFilter.value = [filter.value.min, filter.value.max];
          } else if (filter.min && filter.max) {
            // AI sometimes puts min/max as separate properties
            correctedFilter.value = [filter.min, filter.max];
          } else if (typeof filter.value === 'number') {
            correctedFilter.value = [filter.value, filter.value];
          } else {
            correctedFilter.value = [1000, 5000]; // Default range
          }
          
          // Apply unit conversions for array ranges
          if (fieldConfig.unit === 'kg' && correctedFilter.value[0] < 100) {
            // Likely tons, convert to kg
            correctedFilter.value = correctedFilter.value.map(v => v * 1000);
            console.log(`[ToolService] Converted ${filter.field} from tons to kg: ${correctedFilter.value}`);
          } else if (fieldConfig.unit === 'mm' && correctedFilter.value[0] < 100) {
            // Likely meters, convert to mm
            correctedFilter.value = correctedFilter.value.map(v => v * 1000);
            console.log(`[ToolService] Converted ${filter.field} from meters to mm: ${correctedFilter.value}`);
          }
        }
        
        // Remove extra min/max properties that shouldn't be in the schema
        delete correctedFilter.min;
        delete correctedFilter.max;
      }
      
      correctedFilters.push(correctedFilter);
    }
    
    return correctedFilters;
  }

  // Execute generate_product_filters tool
  executeGenerateProductFilters(args) {
    const originalFilters = args.filters || [];
    const correctedFilters = this.validateAndCorrectFilters(originalFilters);
    
    console.log(`[ToolService] Filter validation: ${originalFilters.length} input, ${correctedFilters.length} corrected`);
    
    return {
      filters: correctedFilters,
      explanation: args.explanation || "Filters generated based on your requirements",
      confidence: args.confidence || 0.8,
      timestamp: new Date().toISOString(),
      corrections: correctedFilters.length !== originalFilters.length ? 'Applied automatic corrections' : undefined
    };
  }

  // Execute recommend_products tool
  executeRecommendProducts(args, systemRequirements = null) {
    console.log('[ToolService] Processing recommend_products with args:', args);
    console.log('[ToolService] System requirements context:', systemRequirements);
    
    // Handle both new format (requirements-based) and old format (LLM trying to send recommendations)
    let requirements = {};
    let maxResults = args.maxResults || 6;
    let reasoning = args.reasoning || "Product recommendations based on your requirements";
    
    if (args.requirements) {
      // New format: LLM sends requirements, tool finds products
      requirements = args.requirements;
      console.log('[ToolService] Using LLM-provided requirements:', requirements);
    } else if (args.recommendations !== undefined) {
      // Old format: LLM tries to send fake recommendations (could be empty array)
      console.log('[ToolService] LLM sent old format with recommendations array:', args.recommendations.length, 'items');
      
      // Always ignore LLM's fake recommendations and use system requirements
      if (systemRequirements && Object.keys(systemRequirements).length > 0) {
        requirements = systemRequirements;
        console.log('[ToolService] Using system requirements:', requirements);
      } else {
        requirements = {}; // Fallback to show all products
        console.log('[ToolService] No system requirements available, showing all products');
      }
      
      maxResults = 6; // Force showing more products
      reasoning = args.reasoning || "Product recommendations based on your requirements";
    } else {
      // No requirements provided, show all products
      console.log('[ToolService] No requirements provided, showing all products');
      requirements = {};
      maxResults = 6;
    }
    
    // Normalize requirements for filtering (ensure proper formats)
    const normalizedRequirements = { ...requirements };
    
    // Fix budgetRange format - ensure both min and max are present
    if (normalizedRequirements.budgetRange) {
      if (typeof normalizedRequirements.budgetRange === 'number') {
        // Single number means max budget
        normalizedRequirements.budgetRange = { min: 0, max: normalizedRequirements.budgetRange };
      } else if (typeof normalizedRequirements.budgetRange === 'object' && normalizedRequirements.budgetRange.max && !normalizedRequirements.budgetRange.min) {
        // Has max but no min
        normalizedRequirements.budgetRange.min = 0;
      } else if (typeof normalizedRequirements.budgetRange === 'object' && normalizedRequirements.budgetRange.min && !normalizedRequirements.budgetRange.max) {
        // Has min but no max
        normalizedRequirements.budgetRange.max = 100000; // Default high value
      }
    }
    
    console.log('[ToolService] Normalized requirements for filtering:', normalizedRequirements);
    
    // First filter products that meet hard requirements, then score them
    const filteredProducts = getProductsByFilters(normalizedRequirements);
    console.log('[ToolService] Filtered products by requirements:', filteredProducts.map(p => p.id));
    
    // If no products match the hard requirements, get all products and score them (with lower scores for near-misses)
    const productsToScore = filteredProducts.length > 0 ? filteredProducts : getValidProductIds().map(id => getProductById(id)).filter(Boolean);
    console.log('[ToolService] Products to score:', productsToScore.map(p => p.id));
    
    const scoredProducts = productsToScore.map(product => {
      // Products that passed filtering start with a higher base score
      const passedFiltering = filteredProducts.length > 0 && filteredProducts.some(p => p.id === product.id);
      let score = passedFiltering ? 40 : 0;
      let matchReasons = [];
      let criteriaMet = [];
      
      if (passedFiltering) {
        matchReasons.push('Meets all hard requirements');
        criteriaMet.push('Requirements Match');
      }
      
      // Load capacity matching (30% weight)
      if (requirements.loadCapacity && Array.isArray(requirements.loadCapacity)) {
        const [minCapacity, maxCapacity] = requirements.loadCapacity;
        if (product.loadCapacity >= minCapacity && product.loadCapacity <= maxCapacity) {
          score += 30;
          matchReasons.push(`Perfect load capacity match (${product.loadCapacity}kg)`);
          criteriaMet.push('Load Capacity');
        } else if (product.loadCapacity >= minCapacity * 0.8 && product.loadCapacity <= maxCapacity * 1.2) {
          score += 20; // Close match
          matchReasons.push(`Good load capacity fit (${product.loadCapacity}kg)`);
        }
      }
      
      // Budget matching (25% weight)
      if (requirements.budgetRange) {
        const { min: minBudget, max: maxBudget } = requirements.budgetRange;
        if (product.listPrice >= minBudget && product.listPrice <= maxBudget) {
          score += 25;
          matchReasons.push(`Within budget ($${product.listPrice.toLocaleString()})`);
          criteriaMet.push('Budget Range');
        } else if (product.listPrice <= maxBudget * 1.1) {
          score += 15; // Slightly over budget but close
          matchReasons.push(`Near budget range ($${product.listPrice.toLocaleString()})`);
        }
      }
      
      // Power source matching (20% weight)
      if (requirements.powerSource && product.powerSource === requirements.powerSource) {
        score += 20;
        matchReasons.push(`${product.powerSource} power as requested`);
        criteriaMet.push('Power Source');
      }
      
      // Operating environment matching (15% weight)
      if (requirements.operatingEnvironment) {
        if (product.operatingEnvironment === requirements.operatingEnvironment || 
            product.operatingEnvironment === 'mixed') {
          score += 15;
          matchReasons.push(`Suitable for ${requirements.operatingEnvironment} use`);
          criteriaMet.push('Operating Environment');
        }
      }
      
      // Lift height matching (10% weight)
      if (requirements.liftHeight && Array.isArray(requirements.liftHeight)) {
        const [minHeight, maxHeight] = requirements.liftHeight;
        if (product.liftHeight >= minHeight && product.liftHeight <= maxHeight) {
          score += 10;
          matchReasons.push(`Adequate lift height (${product.liftHeight}mm)`);
          criteriaMet.push('Lift Height');
        }
      }
      
      // Cap score at 100
      score = Math.min(100, score);
      
      return {
        product,
        score,
        matchReasons,
        criteriaMet
      };
    });
    
    // Sort by score and take top results
    const topProducts = scoredProducts
      .filter(item => item.score > 0) // Only include products with some match
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
    
    // Format recommendations
    const recommendations = topProducts.map(item => ({
      productId: item.product.id,
      matchScore: Math.round(item.score),
      matchReason: item.matchReasons.join(', ') || 'General compatibility with requirements',
      highlights: [
        `${item.product.loadCapacity}kg capacity`,
        `${item.product.liftHeight}mm lift height`,
        `${item.product.powerSource} power`,
        `$${item.product.listPrice.toLocaleString()}`,
        ...(item.product.semanticTags || []).slice(0, 2)
      ],
      primaryBenefit: item.product.description || `Reliable ${item.product.powerSource} forklift solution`,
      considerations: item.score < 70 ? ['May require evaluation for specific requirements'] : []
    }));
    
    // Determine top criteria that were used
    const allCriteria = topProducts.flatMap(item => item.criteriaMet);
    const topCriteria = [...new Set(allCriteria)].slice(0, 3);
    
    const result = {
      recommendations,
      reasoning: reasoning || `Found ${recommendations.length} products matching your requirements`,
      totalMatches: scoredProducts.filter(item => item.score > 0).length,
      topCriteria,
      generatedAt: new Date().toISOString()
    };
    
    console.log('[ToolService] Generated recommendations result:', {
      count: result.recommendations.length,
      productIds: result.recommendations.map(r => r.productId),
      scores: result.recommendations.map(r => r.matchScore),
      reasoning: result.reasoning,
      topCriteria: result.topCriteria
    });
    
    return result;
  }

  // Execute suggest_follow_up_action tool
  executeSuggestFollowUpAction(args) {
    console.log('[ToolService] Processing suggest_follow_up_action with args:', args);
    
    // Validate required fields
    if (!args.actionType || !args.userMessage) {
      throw new Error('actionType and userMessage are required for suggest_follow_up_action');
    }
    
    // Validate actionType is from allowed enum
    const validActionTypes = ["apply_requirements", "generate_quote", "schedule_demo", "request_info", "configure_product", "compare_products"];
    if (!validActionTypes.includes(args.actionType)) {
      throw new Error(`Invalid actionType: ${args.actionType}. Must be one of: ${validActionTypes.join(', ')}`);
    }
    
    // Validate priority if provided
    const validPriorities = ["high", "medium", "low"];
    const priority = args.priority || "medium";
    if (!validPriorities.includes(priority)) {
      throw new Error(`Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`);
    }
    
    // Validate confidence if provided
    const confidence = args.confidence || 0.8;
    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence must be between 0.0 and 1.0');
    }
    
    const result = {
      actionType: args.actionType,
      priority,
      userMessage: args.userMessage,
      actionData: args.actionData || {},
      confidence,
      timestamp: new Date().toISOString(),
      id: `action_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    };
    
    console.log('[ToolService] Generated follow-up action:', result);
    
    return result;
  }

  // Process tool calls from OpenAI API response
  async processToolCalls(toolCalls) {
    const results = [];
    
    for (const toolCall of toolCalls) {
      const { id: tool_call_id, type, function: func } = toolCall;
      
      if (type === 'function' && func) {
        try {
          const args = typeof func.arguments === 'string' 
            ? JSON.parse(func.arguments) 
            : func.arguments;
          
          const result = await this.executeCustomTool(func.name, args);
          
          results.push({
            tool_call_id,
            output: JSON.stringify(result)
          });
        } catch (error) {
          console.error(`[ToolService] Error executing tool ${func.name}:`, error);
          results.push({
            tool_call_id,
            output: JSON.stringify({ error: error.message })
          });
        }
      }
    }
    
    return results;
  }
}

export default ToolService;