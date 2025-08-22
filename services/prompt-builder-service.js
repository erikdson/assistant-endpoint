/**
 * Dynamic Prompt Builder Service
 * 
 * Creates sophisticated, context-aware system prompts for the AI assistant
 * with proper requirements formatting and level-aware instructions
 */

class PromptBuilderService {
  constructor() {
    this.basePrompt = this.getBasePrompt();
  }

  /**
   * Build a comprehensive system prompt with context and requirements
   * @param {Object} options - Configuration options
   * @param {Object} options.requirements - Raw requirements object
   * @param {Object} options.context - Session context (level, ids, etc.)
   * @param {string} options.customInstructions - Additional instructions
   * @returns {string} Complete system prompt
   */
  buildSystemPrompt(options = {}) {
    const { requirements = {}, context = {}, customInstructions = '' } = options;

    let prompt = this.basePrompt;

    // Add requirements section if available
    if (Object.keys(requirements).length > 0) {
      prompt += this.buildRequirementsSection(requirements, context);
    }

    // Add context-specific instructions
    if (context.level) {
      prompt += this.buildContextInstructions(context);
    }

    // Add session context information
    if (Object.keys(context).length > 0) {
      prompt += this.buildSessionContext(context);
    }

    // Add custom instructions if provided
    if (customInstructions) {
      prompt += `\n\n## Additional Instructions:\n${customInstructions}`;
    }

    // Add technical instructions
    prompt += this.getTechnicalInstructions();

    return prompt;
  }

  /**
   * Get the base system prompt with core CPQ assistant instructions
   */
  getBasePrompt() {
    return `You are an expert forklift sales assistant for a Configure Price Quote (CPQ) system. You provide professional, conversational guidance to help customers find the perfect forklift solutions.

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
  }

  /**
   * Build the requirements section with proper formatting and level awareness
   */
  buildRequirementsSection(requirements, context = {}) {
    const level = context.level || 'solution';
    const requirementsByLevel = this.organizeRequirementsByLevel(requirements, context);
    
    let section = '\n\n=== CURRENT REQUIREMENTS ===\n\n';

    // Add level-specific requirements with emoji indicators
    if (requirementsByLevel.account && Object.keys(requirementsByLevel.account).length > 0) {
      section += '🏢 **ACCOUNT LEVEL** (Strategic/Policy Requirements):\n';
      section += this.formatRequirementsList(requirementsByLevel.account);
      section += '\n';
    }

    if (requirementsByLevel.opportunity && Object.keys(requirementsByLevel.opportunity).length > 0) {
      section += '💼 **OPPORTUNITY LEVEL** (Project-Specific Requirements):\n';
      section += this.formatRequirementsList(requirementsByLevel.opportunity);
      section += '\n';
    }

    if (requirementsByLevel.solution && Object.keys(requirementsByLevel.solution).length > 0) {
      section += '⚙️ **SOLUTION LEVEL** (Technical Specifications):\n';
      section += this.formatRequirementsList(requirementsByLevel.solution);
      section += '\n';
    }

    // Add consolidated requirements (final active set)
    const consolidatedRequirements = this.consolidateRequirements(requirementsByLevel);
    if (Object.keys(consolidatedRequirements).length > 0) {
      section += '🔄 **CONSOLIDATED REQUIREMENTS** (Final Active Set):\n';
      section += '   ↳ Merged from all levels with Solution > Opportunity > Account precedence\n';
      Object.entries(consolidatedRequirements).forEach(([key, value]) => {
        const displayKey = this.formatRequirementKey(key);
        const displayValue = this.formatRequirementValue(value);
        section += `✓ **${displayKey}**: ${displayValue}\n`;
      });
    }

    return section;
  }

  /**
   * Build context-specific instructions based on business level
   */
  buildContextInstructions(context) {
    const level = context.level || 'solution';
    
    let section = `\n\n=== OPERATING CONTEXT: ${level.toUpperCase()} LEVEL ===\n`;

    switch (level) {
      case 'account':
        section += `• Provide strategic guidance for account-wide forklift strategy
• Focus on policy requirements, compliance, and organizational standards
• Consider long-term relationship and fleet standardization
• ACCOUNT LEVEL = Strategic/policy requirements (primary focus)
• OPPORTUNITY LEVEL = Project-specific requirements (inherited)
• SOLUTION LEVEL = Technical specifications (inherited)`;
        break;
        
      case 'opportunity':
        section += `• Provide project-specific recommendations and business case guidance
• Focus on this specific opportunity's requirements and constraints
• Consider project timeline, budget, and success criteria
• ACCOUNT LEVEL = Strategic/policy requirements (inherited)
• OPPORTUNITY LEVEL = Project-specific requirements (primary focus)
• SOLUTION LEVEL = Technical specifications (inherited)`;
        break;
        
      case 'solution':
        section += `• Provide detailed, granular product recommendations and configuration guidance  
• Focus on technical specifications and detailed product comparisons
• ACCOUNT LEVEL = Strategic/policy requirements (inherited)
• OPPORTUNITY LEVEL = Project-specific requirements (inherited)
• SOLUTION LEVEL = Technical specifications and manual overrides (primary focus)`;
        break;
    }

    section += `
• Use CONSOLIDATED REQUIREMENTS for complete context with proper precedence hierarchy
• **CRITICAL**: Use tools appropriately based on user intent:
  - Use generate_product_filters when users want to SET/UPDATE requirements or specify constraints
  - Use recommend_products when users ask for recommendations, suggestions, want to see products, or ask "what do you recommend"
• **RECOMMENDATION REQUESTS**: Always use recommend_products for: "recommend products", "what products", "show me products", "suggest products"
• Prioritize ${level}-level specifications while respecting inherited constraints`;

    return section;
  }

  /**
   * Build session context information
   */
  buildSessionContext(context) {
    let section = '\n\n## Session Context:\n';
    
    if (context.level) {
      section += `• **Business Level**: ${context.level.charAt(0).toUpperCase() + context.level.slice(1)}\n`;
    }
    
    if (context.id) {
      section += `• **Context ID**: ${context.id}\n`;
    }
    
    if (context.threadId) {
      section += `• **Thread ID**: ${context.threadId}\n`;
    }

    // Add context-specific details if available
    if (context.account) {
      section += `• **Account**: ${context.account.name || 'Unknown'}\n`;
      if (context.account.industry) {
        section += `• **Industry**: ${context.account.industry}\n`;
      }
    }

    if (context.opportunity) {
      section += `• **Opportunity**: ${context.opportunity.name || 'Unknown'}\n`;
      if (context.opportunity.stage) {
        section += `• **Stage**: ${context.opportunity.stage}\n`;
      }
    }

    if (context.solution) {
      section += `• **Solution**: ${context.solution.name || 'Unknown'}\n`;
      if (context.solution.status) {
        section += `• **Status**: ${context.solution.status}\n`;
      }
    }

    return section;
  }

  /**
   * Get technical instructions for the AI
   */
  getTechnicalInstructions() {
    return `\n\n## Technical Instructions:
- **TOOL USAGE GUIDELINES**: Use tools appropriately based on user intent:
  • **For requirement updates**: Use generate_product_filters tool when users want to SET or UPDATE requirements, specify constraints, or modify criteria
  • **For product recommendations**: Use recommend_products tool when users ask for recommendations, suggestions, want to see products, or ask "what products do you recommend"
  • **For general questions**: Respond conversationally without tools for questions about processes, options, or general information
- **RECOMMENDATION TRIGGER WORDS**: Always use recommend_products for requests containing: "recommend", "suggest", "show me products", "what products", "which forklifts"
- **IMPORTANT**: recommend_products tool is self-contained - do NOT set filters first, it handles requirements directly
- **EXAMPLES OF WHEN TO USE recommend_products**:
  • "Can you recommend any products?" → Use recommend_products
  • "What products do you recommend?" → Use recommend_products  
  • "Show me forklift recommendations" → Use recommend_products
  • "I need forklift suggestions" → Use recommend_products
- Maintain professional CPQ sales assistant persona
- Format responses with proper markdown for optimal presentation
- Provide expert guidance on forklift selection and configuration
- Always base recommendations on the CONSOLIDATED REQUIREMENTS (final active set)`;
  }

  /**
   * Organize requirements by business level
   */
  organizeRequirementsByLevel(requirements, context = {}) {
    // This is a simplified version - in a real system, you'd have more sophisticated logic
    // to determine which requirements belong to which level based on metadata
    
    const organized = {
      account: {},
      opportunity: {},
      solution: {}
    };

    // For now, assign all requirements to the current context level
    const currentLevel = context.level || 'solution';
    organized[currentLevel] = { ...requirements };

    return organized;
  }

  /**
   * Consolidate requirements with proper precedence (Solution > Opportunity > Account)
   */
  consolidateRequirements(requirementsByLevel) {
    const consolidated = {};
    
    // Apply precedence: Account first (lowest), then Opportunity, then Solution (highest)
    Object.assign(consolidated, requirementsByLevel.account || {});
    Object.assign(consolidated, requirementsByLevel.opportunity || {});
    Object.assign(consolidated, requirementsByLevel.solution || {});
    
    return consolidated;
  }

  /**
   * Format a list of requirements for display
   */
  formatRequirementsList(requirements) {
    return Object.entries(requirements)
      .map(([key, value]) => {
        const displayKey = this.formatRequirementKey(key);
        const displayValue = this.formatRequirementValue(value);
        return `• **${displayKey}**: ${displayValue}`;
      })
      .join('\n');
  }

  /**
   * Format a requirement key for human-readable display
   */
  formatRequirementKey(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Format a requirement value for human-readable display
   */
  formatRequirementValue(value) {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    if (typeof value === 'object' && value !== null) {
      if (value.min !== undefined && value.max !== undefined) {
        return `${value.min} - ${value.max}`;
      }
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  /**
   * Generate a requirements explanation section
   */
  getRequirementsExplanation() {
    return `\n\n=== REQUIREMENTS EXPLANATION ===
• Requirements are automatically categorized by their logical business level
• **ACCOUNT LEVEL**: Strategic, policy, compliance, and organizational requirements  
• **OPPORTUNITY LEVEL**: Project-specific, location-based, and business case requirements
• **SOLUTION LEVEL**: Technical specifications and manual configuration overrides
• **CONSOLIDATED REQUIREMENTS**: Final merged set with Solution > Opportunity > Account precedence

=== IMPORTANT INSTRUCTIONS ===
• Always base recommendations on the CONSOLIDATED REQUIREMENTS (final active set)
• The consolidated view represents the complete hierarchy with proper precedence
• **TOOL USAGE GUIDELINES**: Use tools appropriately based on user intent:
  - **generate_product_filters**: When users specify requirements, needs, constraints, or technical specifications
  - **recommend_products**: Only when users explicitly ask for product recommendations, suggestions, or "show me products"
• **IMPORTANT**: Don't generate unsolicited product recommendations - only when specifically requested
• When using generate_product_filters, translate consolidated requirements into appropriate filter values
• Manual solution-level entries override inherited requirements from higher levels
• For general questions about processes or options, respond conversationally without tools`;
  }
}

export default PromptBuilderService;