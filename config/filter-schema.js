/**
 * Product Filter Schema Configuration
 * Defines the complete schema for generate_product_filters tool with detailed instructions
 */

export const FILTER_FIELD_DEFINITIONS = {
  loadCapacity: {
    type: "range",
    unit: "kg",
    range: [1000, 15000],
    description: "Required maximum load capacity in kilograms (kg). Convert units: '9 tons' = 9000 kg, '3.5 tons' = 3500 kg",
    example: "For '5 ton forklift' use [5000, 5000]"
  },
  liftHeight: {
    type: "range", 
    unit: "mm",
    range: [2000, 8000],
    description: "Required maximum lift height in millimeters (mm). Convert units: '6 meters' = 6000 mm, '5m' = 5000 mm",
    example: "For '3-4 meter lift' use [3000, 4000]"
  },
  operatingEnvironment: {
    type: "singleselect",
    options: ["indoor", "outdoor", "mixed"],
    description: "Where the forklift operates. Use: 'indoor' for enclosed spaces, 'outdoor' for outside-only, 'mixed' for both warehouse + yard",
    example: "For 'warehouse yard operations' use 'outdoor'"
  },
  floorSurface: {
    type: "singleselect", 
    options: ["smooth-concrete", "rough-concrete", "asphalt", "gravel"],
    description: "Ground surface type. Use most demanding condition mentioned",
    example: "For 'rough concrete floors' use 'rough-concrete'"
  },
  aisleWidth: {
    type: "range",
    unit: "mm", 
    range: [2000, 5000],
    description: "Minimum aisle width for maneuvering in millimeters (mm). Narrow aisles need tighter turning",
    example: "For 'narrow aisles' use [2000, 3000]"
  },
  budgetRange: {
    type: "range",
    unit: "USD",
    description: "Budget range with min/max properties in USD currency",
    example: "For '$50k-80k budget' use {min: 50000, max: 80000}"
  },
  loadType: {
    type: "singleselect",
    options: ["pallets", "bulk", "containers", "machinery", "mixed"],
    description: "Type of load handled. Use 'mixed' when multiple types mentioned",
    example: "For 'standard goods' use 'pallets'"
  },
  attachments: {
    type: "multiselect",
    options: ["forks", "clamp", "rotator", "side-shift", "push-pull"],
    description: "Required forklift attachments. Multiple values allowed",
    example: "For 'clamp attachment for paper rolls' use ['clamp']"
  },
  operatingHours: {
    type: "singleselect",
    options: ["light", "medium", "heavy", "continuous"],
    description: "Daily duty cycle: 'light'=1-4 hours/day, 'medium'=4-8 hours/day, 'heavy'=8+ hours/day, 'continuous'=24/7",
    example: "For 'heavy duty use' use 'heavy'"
  },
  powerSource: {
    type: "singleselect",
    options: ["electric", "diesel", "lpg", "hybrid"],
    description: "Fuel type: 'electric' for indoor/sustainable, 'diesel' for outdoor/heavy-duty",
    example: "For indoor operations typically use 'electric'"
  },
  deliveryUrgency: {
    type: "singleselect",
    options: ["immediate", "standard", "planned", "flexible"],
    description: "Timeline: 'immediate'=stock units, 'planned'=scheduled projects, 'flexible'=long lead times OK",
    example: "For 'flexible delivery timeline' use 'flexible'"
  }
};

/**
 * Generate system prompt instructions for filter generation
 */
export function generateFilterInstructions() {
  let instructions = `

## CRITICAL: Product Filter Generation Instructions
When users mention product requirements, ALWAYS use the generate_product_filters tool with these exact specifications:

### Field Mapping Rules:
`;

  for (const [field, config] of Object.entries(FILTER_FIELD_DEFINITIONS)) {
    instructions += `
**${field}**: ${config.type.toUpperCase()} ${config.unit ? `(${config.unit})` : ''}
- ${config.description}
- ${config.example}`;
    if (config.options) {
      instructions += `
- Valid options: [${config.options.join(', ')}]`;
    }
  }

  instructions += `

### Critical Format Rules:
1. **Range Fields** (loadCapacity, liftHeight, aisleWidth): 
   - type: "range"
   - value: [min, max] array with numbers
   - Convert ALL units: tons→kg, meters→mm

2. **Single Select Fields**: 
   - type: "singleselect" 
   - value: string from valid options only
   - Match closest valid option, never use custom text

3. **Multi Select Fields** (attachments):
   - type: "multiselect"
   - value: array of strings from valid options

4. **Budget Range**:
   - type: "range" 
   - value: {min: number, max: number} object

### Conversion Examples:
- "3.5 ton forklift" → loadCapacity: [3500, 3500]
- "5 meter lift" → liftHeight: [5000, 5000]
- "outdoor yard" → operatingEnvironment: "outdoor"
- "rough concrete" → floorSurface: "rough-concrete"
- "clamp attachment" → attachments: ["clamp"]
- "heavy duty" → operatingHours: "heavy"

NEVER use custom text values - only use the predefined enum options!
`;

  return instructions;
}