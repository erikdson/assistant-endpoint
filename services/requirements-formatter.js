/**
 * Requirements Formatter Service
 * 
 * Transforms raw requirements into human-readable, structured text
 * with proper business level organization and formatting
 */

class RequirementsFormatter {
  constructor() {
    this.unitMappings = this.getUnitMappings();
    this.fieldMappings = this.getFieldMappings();
  }

  /**
   * Format requirements with business context and level awareness
   * @param {Object} requirements - Raw requirements object
   * @param {Object} context - Business context (level, etc.)
   * @returns {Object} Formatted requirements organized by level
   */
  formatRequirements(requirements, context = {}) {
    const level = context.level || 'solution';
    const organized = this.organizeByLevel(requirements, context);
    
    return {
      byLevel: organized,
      consolidated: this.consolidateRequirements(organized),
      summary: this.generateSummary(organized),
      formattedText: this.generateFormattedText(organized, level)
    };
  }

  /**
   * Organize requirements by business level with intelligent categorization
   */
  organizeByLevel(requirements, context = {}) {
    const organized = {
      account: {},
      opportunity: {},
      solution: {}
    };

    // Categorize each requirement based on its nature
    Object.entries(requirements).forEach(([key, value]) => {
      const category = this.categorizeRequirement(key, value, context);
      organized[category][key] = this.formatRequirementValue(key, value);
    });

    return organized;
  }

  /**
   * Categorize a requirement into account, opportunity, or solution level
   */
  categorizeRequirement(key, value, context = {}) {
    const currentLevel = context.level || 'solution';
    
    // Account-level requirements (strategic/policy)
    const accountFields = [
      'companyPolicy', 'complianceStandards', 'fleetStandardization', 
      'corporatePreferences', 'vendorPreferences', 'maintenanceStrategy',
      'safetyStandards', 'operatorTraining'
    ];

    // Opportunity-level requirements (project-specific)
    const opportunityFields = [
      'projectTimeline', 'deliveryDeadline', 'siteConstraints', 
      'locationRequirements', 'seasonalUsage', 'projectBudget',
      'businessCase', 'roi', 'paybackPeriod'
    ];

    // Solution-level requirements (technical specifications)
    const solutionFields = [
      'loadCapacity', 'liftHeight', 'aisleWidth', 'powerSource',
      'operatingEnvironment', 'floorSurface', 'loadType', 'attachments',
      'operatingHours', 'fuelType', 'tireType', 'mastType'
    ];

    if (accountFields.includes(key)) {
      return 'account';
    } else if (opportunityFields.includes(key)) {
      return 'opportunity';
    } else if (solutionFields.includes(key)) {
      return 'solution';
    }

    // Default to current context level
    return currentLevel;
  }

  /**
   * Consolidate requirements with proper precedence
   */
  consolidateRequirements(organized) {
    const consolidated = {};
    
    // Apply precedence: Account (base) < Opportunity < Solution (highest)
    Object.assign(consolidated, organized.account || {});
    Object.assign(consolidated, organized.opportunity || {});
    Object.assign(consolidated, organized.solution || {});
    
    return consolidated;
  }

  /**
   * Generate a summary of requirements by level
   */
  generateSummary(organized) {
    const summary = {
      total: 0,
      byLevel: {
        account: Object.keys(organized.account || {}).length,
        opportunity: Object.keys(organized.opportunity || {}).length,
        solution: Object.keys(organized.solution || {}).length
      }
    };
    
    summary.total = summary.byLevel.account + summary.byLevel.opportunity + summary.byLevel.solution;
    
    return summary;
  }

  /**
   * Generate formatted text representation
   */
  generateFormattedText(organized, currentLevel = 'solution') {
    let text = '';
    
    if (Object.keys(organized.account).length > 0) {
      text += '🏢 **Account Level** (Strategic Requirements):\n';
      text += this.formatLevelRequirements(organized.account);
      text += '\n';
    }
    
    if (Object.keys(organized.opportunity).length > 0) {
      text += '💼 **Opportunity Level** (Project Requirements):\n';
      text += this.formatLevelRequirements(organized.opportunity);
      text += '\n';
    }
    
    if (Object.keys(organized.solution).length > 0) {
      text += '⚙️ **Solution Level** (Technical Specifications):\n';
      text += this.formatLevelRequirements(organized.solution);
      text += '\n';
    }

    const consolidated = this.consolidateRequirements(organized);
    if (Object.keys(consolidated).length > 0) {
      text += '🔄 **Consolidated Requirements** (Final Active Set):\n';
      text += this.formatLevelRequirements(consolidated, '✓');
    }

    return text.trim();
  }

  /**
   * Format requirements for a specific level
   */
  formatLevelRequirements(requirements, prefix = '•') {
    return Object.entries(requirements)
      .map(([key, value]) => {
        const displayKey = this.getDisplayName(key);
        const displayValue = this.getDisplayValue(key, value);
        return `${prefix} **${displayKey}**: ${displayValue}`;
      })
      .join('\n');
  }

  /**
   * Format a requirement value with proper units and formatting
   */
  formatRequirementValue(key, value) {
    // Handle different value types
    if (Array.isArray(value)) {
      return value.map(v => this.formatSingleValue(key, v)).join(', ');
    }
    
    if (typeof value === 'object' && value !== null) {
      // Handle range objects
      if (value.min !== undefined && value.max !== undefined) {
        return {
          min: this.formatSingleValue(key, value.min),
          max: this.formatSingleValue(key, value.max),
          formatted: `${this.formatSingleValue(key, value.min)} - ${this.formatSingleValue(key, value.max)}`
        };
      }
      
      // Handle other objects
      return value;
    }
    
    return this.formatSingleValue(key, value);
  }

  /**
   * Format a single value with appropriate units
   */
  formatSingleValue(key, value) {
    const units = this.unitMappings[key];
    
    if (units && typeof value === 'number') {
      return `${value.toLocaleString()} ${units}`;
    }
    
    return String(value);
  }

  /**
   * Get display name for a requirement field
   */
  getDisplayName(key) {
    return this.fieldMappings[key] || this.camelCaseToTitle(key);
  }

  /**
   * Get display value for a requirement
   */
  getDisplayValue(key, value) {
    if (typeof value === 'object' && value?.formatted) {
      return value.formatted;
    }
    
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
   * Convert camelCase to Title Case
   */
  camelCaseToTitle(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, char => char.toUpperCase())
      .trim();
  }

  /**
   * Get unit mappings for different requirement fields
   */
  getUnitMappings() {
    return {
      loadCapacity: 'kg',
      liftHeight: 'mm',
      aisleWidth: 'mm',
      weight: 'kg',
      length: 'mm',
      width: 'mm',
      height: 'mm',
      price: 'USD',
      budget: 'USD',
      budgetMin: 'USD',
      budgetMax: 'USD',
      speed: 'km/h',
      runtime: 'hours',
      chargeTime: 'hours',
      fuelCapacity: 'L',
      batteryCapacity: 'Ah'
    };
  }

  /**
   * Get field display name mappings
   */
  getFieldMappings() {
    return {
      loadCapacity: 'Load Capacity',
      liftHeight: 'Lift Height',
      aisleWidth: 'Aisle Width',
      operatingEnvironment: 'Operating Environment',
      floorSurface: 'Floor Surface',
      powerSource: 'Power Source',
      fuelType: 'Fuel Type',
      tireType: 'Tire Type',
      mastType: 'Mast Type',
      loadType: 'Load Type',
      attachments: 'Attachments',
      operatingHours: 'Operating Hours',
      deliveryUrgency: 'Delivery Urgency',
      budgetRange: 'Budget Range',
      companyPolicy: 'Company Policy',
      complianceStandards: 'Compliance Standards',
      fleetStandardization: 'Fleet Standardization',
      vendorPreferences: 'Vendor Preferences',
      maintenanceStrategy: 'Maintenance Strategy',
      safetyStandards: 'Safety Standards',
      operatorTraining: 'Operator Training',
      projectTimeline: 'Project Timeline',
      deliveryDeadline: 'Delivery Deadline',
      siteConstraints: 'Site Constraints',
      locationRequirements: 'Location Requirements',
      seasonalUsage: 'Seasonal Usage',
      projectBudget: 'Project Budget',
      businessCase: 'Business Case',
      roi: 'ROI Target',
      paybackPeriod: 'Payback Period'
    };
  }

  /**
   * Validate requirements format and structure
   */
  validateRequirements(requirements) {
    const errors = [];
    const warnings = [];
    
    if (!requirements || typeof requirements !== 'object') {
      errors.push('Requirements must be an object');
      return { valid: false, errors, warnings };
    }
    
    // Check for common requirement issues
    Object.entries(requirements).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        warnings.push(`${key} has empty value`);
      }
      
      // Validate numeric requirements
      const numericFields = ['loadCapacity', 'liftHeight', 'aisleWidth'];
      if (numericFields.includes(key) && typeof value !== 'number' && !Array.isArray(value)) {
        warnings.push(`${key} should be numeric`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get requirement field metadata
   */
  getFieldMetadata(fieldName) {
    const metadata = {
      category: this.categorizeRequirement(fieldName),
      displayName: this.getDisplayName(fieldName),
      unit: this.unitMappings[fieldName],
      type: this.getFieldType(fieldName),
      validation: this.getFieldValidation(fieldName)
    };
    
    return metadata;
  }

  /**
   * Get field type for validation
   */
  getFieldType(fieldName) {
    const numericFields = ['loadCapacity', 'liftHeight', 'aisleWidth', 'weight', 'price', 'budget'];
    const arrayFields = ['attachments', 'floorSurface', 'operatingEnvironment'];
    const stringFields = ['powerSource', 'fuelType', 'tireType', 'mastType'];
    
    if (numericFields.includes(fieldName)) return 'numeric';
    if (arrayFields.includes(fieldName)) return 'array';
    if (stringFields.includes(fieldName)) return 'string';
    
    return 'mixed';
  }

  /**
   * Get field validation rules
   */
  getFieldValidation(fieldName) {
    const validations = {
      loadCapacity: { min: 0, max: 50000, required: false },
      liftHeight: { min: 0, max: 20000, required: false },
      aisleWidth: { min: 1000, max: 10000, required: false },
      powerSource: { 
        options: ['electric', 'diesel', 'lpg', 'hybrid'],
        required: false 
      }
    };
    
    return validations[fieldName] || { required: false };
  }
}

export default RequirementsFormatter;