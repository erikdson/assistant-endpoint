// Unified product catalog - single source of truth for both backend and frontend

export const products = [
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
    dimensions: {
      length: 2650,
      width: 1160,
      height: 2150
    },
    listPrice: 53000,
    complianceStandards: ["EN 1005", "NIOSH", "ISO 9241"],
    semanticTags: [
      "high load capacity",
      "meets safety compliance", 
      "ideal for mixed environments",
      "extended battery range",
      "quiet operation"
    ],
    description: "High-performance electric forklift with advanced battery technology and superior lifting capabilities.",
    aisleWidth: 2500,
    floorSurface: ['smooth-concrete', 'rough-concrete'],
    loadType: 'pallets',
    attachments: ['forks', 'clamp'],
    operatingHours: 'medium'
  },
  {
    id: "prod-TG-553",
    modelName: "TG-553",
    powerSource: "electric", 
    loadCapacity: 6000,
    liftHeight: 4200,
    turningRadius: 2100,
    tireType: "SE",
    operatingEnvironment: "indoor",
    soundLevel: 64,
    dimensions: {
      length: 2500,
      width: 1085,
      height: 2100
    },
    listPrice: 48000,
    complianceStandards: ["EN 1005", "NIOSH"],
    semanticTags: [
      "optimized for indoor use",
      "tight turning radius",
      "compact design", 
      "quiet operation",
      "high maneuverability"
    ],
    description: "Compact electric forklift perfect for tight spaces and precision handling with excellent visibility.",
    aisleWidth: 2500,
    floorSurface: ['smooth-concrete'],
    loadType: 'pallets',
    attachments: ['forks', 'clamp'],
    operatingHours: 'medium'
  },
  {
    id: "prod-LE-7000-Pro",
    modelName: "LE-7000-Pro",
    powerSource: "electric",
    loadCapacity: 7000,
    liftHeight: 4800,
    turningRadius: 2300,
    tireType: "Pneumatic",
    operatingEnvironment: "mixed",
    soundLevel: 68,
    dimensions: {
      length: 2750,
      width: 1200,
      height: 2200
    },
    listPrice: 56000,
    complianceStandards: ["EN 1005", "NIOSH", "ISO 9241"],
    semanticTags: [
      "high performance",
      "electric power",
      "mixed environment",
      "professional grade",
      "efficient operation"
    ],
    description: "Professional-grade electric forklift designed for demanding logistics operations.",
    aisleWidth: 2600,
    floorSurface: ['smooth-concrete', 'rough-concrete', 'asphalt'],
    loadType: 'mixed',
    attachments: ['forks', 'side-shift'],
    operatingHours: 'heavy'
  },
  {
    id: "prod-AX-4500-HD",
    modelName: "AX-4500-HD",
    powerSource: "diesel",
    loadCapacity: 4500,
    liftHeight: 5000,
    turningRadius: 2400,
    tireType: "Pneumatic",
    operatingEnvironment: "outdoor",
    soundLevel: 78,
    dimensions: {
      length: 2800,
      width: 1250,
      height: 2300
    },
    listPrice: 45000,
    complianceStandards: ["EN 1005", "ISO 9241"],
    semanticTags: [
      "diesel power",
      "outdoor operations",
      "heavy duty",
      "rough terrain",
      "high durability"
    ],
    description: "Heavy-duty diesel forklift built for outdoor operations and rough terrain.",
    aisleWidth: 2800,
    floorSurface: ['rough-concrete', 'asphalt', 'gravel'],
    loadType: 'bulk',
    attachments: ['forks', 'clamp'],
    operatingHours: 'continuous'
  },
  {
    id: "prod-GT-6000-Eco",
    modelName: "GT-6000-Eco",
    powerSource: "hybrid",
    loadCapacity: 6000,
    liftHeight: 4600,
    turningRadius: 2200,
    tireType: "SE",
    operatingEnvironment: "mixed",
    soundLevel: 65,
    dimensions: {
      length: 2600,
      width: 1150,
      height: 2180
    },
    listPrice: 52000,
    complianceStandards: ["EN 1005", "NIOSH", "ISO 9241"],
    semanticTags: [
      "hybrid power",
      "eco-friendly",
      "fuel efficient",
      "mixed environment",
      "sustainable"
    ],
    description: "Eco-friendly hybrid forklift combining electric and fuel efficiency for sustainable operations.",
    aisleWidth: 2550,
    floorSurface: ['smooth-concrete', 'rough-concrete'],
    loadType: 'pallets',
    attachments: ['forks', 'side-shift', 'rotator'],
    operatingHours: 'heavy'
  }
];

// Get all product IDs for validation
export const getValidProductIds = () => products.map(p => p.id);

// Get product by ID
export const getProductById = (id) => products.find(p => p.id === id);

// Get products matching filters - Enhanced with range-based filtering support
export const getProductsByFilters = (filters) => {
  return products.filter(product => {
    // Power source filtering
    if (filters.powerSource && product.powerSource !== filters.powerSource) {
      return false;
    }
    
    // Operating environment filtering (mixed environment products match any requirement)
    if (filters.operatingEnvironment && 
        product.operatingEnvironment !== filters.operatingEnvironment && 
        product.operatingEnvironment !== 'mixed') {
      return false;
    }
    
    // Load capacity range filtering
    if (filters.loadCapacity) {
      if (Array.isArray(filters.loadCapacity) && filters.loadCapacity.length === 2) {
        const [minCapacity, maxCapacity] = filters.loadCapacity;
        if (product.loadCapacity < minCapacity || product.loadCapacity > maxCapacity) {
          return false;
        }
      } else if (typeof filters.loadCapacity === 'number') {
        // Legacy support - treat single number as minimum capacity
        if (product.loadCapacity < filters.loadCapacity) {
          return false;
        }
      }
    }
    
    // Lift height range filtering
    if (filters.liftHeight && Array.isArray(filters.liftHeight) && filters.liftHeight.length === 2) {
      const [minHeight, maxHeight] = filters.liftHeight;
      if (product.liftHeight < minHeight || product.liftHeight > maxHeight) {
        return false;
      }
    }
    
    // Budget range filtering
    if (filters.budgetRange) {
      let minBudget, maxBudget;
      
      if (typeof filters.budgetRange === 'object' && filters.budgetRange.min !== undefined) {
        // Object format: { min: 40000, max: 60000 }
        minBudget = filters.budgetRange.min;
        maxBudget = filters.budgetRange.max;
      } else if (Array.isArray(filters.budgetRange) && filters.budgetRange.length === 2) {
        // Array format: [40000, 60000]
        [minBudget, maxBudget] = filters.budgetRange;
      }
      
      if (minBudget !== undefined && maxBudget !== undefined) {
        if (product.listPrice < minBudget || product.listPrice > maxBudget) {
          return false;
        }
      }
    }
    
    // Aisle width range filtering
    if (filters.aisleWidth && Array.isArray(filters.aisleWidth) && filters.aisleWidth.length === 2) {
      const [minWidth, maxWidth] = filters.aisleWidth;
      if (product.aisleWidth < minWidth || product.aisleWidth > maxWidth) {
        return false;
      }
    }
    
    // Floor surface filtering
    if (filters.floorSurface) {
      if (!product.floorSurface || !product.floorSurface.includes(filters.floorSurface)) {
        return false;
      }
    }
    
    // Load type filtering
    if (filters.loadType && product.loadType !== filters.loadType && product.loadType !== 'mixed') {
      return false;
    }
    
    // Attachments filtering (product must support all requested attachments)
    if (filters.attachments && Array.isArray(filters.attachments)) {
      const requiredAttachments = filters.attachments;
      const productAttachments = product.attachments || [];
      
      for (const required of requiredAttachments) {
        if (!productAttachments.includes(required)) {
          return false;
        }
      }
    }
    
    // Operating hours filtering
    if (filters.operatingHours) {
      // Define operating hours hierarchy: light < medium < heavy < continuous
      const hoursHierarchy = { light: 1, medium: 2, heavy: 3, continuous: 4 };
      const requiredLevel = hoursHierarchy[filters.operatingHours] || 1;
      const productLevel = hoursHierarchy[product.operatingHours] || 1;
      
      // Product must support the required operating hours level or higher
      if (productLevel < requiredLevel) {
        return false;
      }
    }
    
    return true;
  });
};