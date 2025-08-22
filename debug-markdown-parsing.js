#!/usr/bin/env node

// Test script to understand how MarkdownRenderer should handle the streaming content

const testContent1 = "Here are your current consolidated requirements:\n\n";
const testContent2 = "Here are your current consolidated requirements:\n\n- **Load Capacity**: 5000\n";
const testContent3 = "Here are your current consolidated requirements:\n\n- **Load Capacity**: 5000\n- **Lift Height**: 3800\n";

function analyzeMarkdownParsing(content, label) {
  console.log(`\n=== ${label} ===`);
  console.log('Content:', JSON.stringify(content));
  
  const lines = content.split('\n');
  console.log('Lines:', lines.map((line, i) => `${i}: ${JSON.stringify(line)}`));
  
  // Simulate the MarkdownRenderer logic
  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      console.log(`Line ${lineIndex}: EMPTY - would flush lists`);
      return;
    }
    
    if (trimmedLine.startsWith('- ')) {
      console.log(`Line ${lineIndex}: LIST ITEM - "${trimmedLine}"`);
      return;
    }
    
    console.log(`Line ${lineIndex}: PARAGRAPH - "${trimmedLine}"`);
  });
}

analyzeMarkdownParsing(testContent1, "After first flush (header + \\n\\n)");
analyzeMarkdownParsing(testContent2, "After second flush (header + first list item)");
analyzeMarkdownParsing(testContent3, "After third flush (header + two list items)");

console.log('\n=== ANALYSIS ===');
console.log('The issue is that content2 has no empty line between header and list item.');
console.log('Line 0: "Here are your current consolidated requirements:" - PARAGRAPH');
console.log('Line 1: "" - EMPTY (flushes list, but no active list)'); 
console.log('Line 2: "- **Load Capacity**: 5000" - LIST ITEM');
console.log('');
console.log('This should work correctly. The empty line should separate them.');
console.log('The problem might be that the list is not being flushed properly between renders.');