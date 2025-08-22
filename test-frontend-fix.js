#!/usr/bin/env node

// Test script to verify the frontend fix works correctly
import fetch from 'node-fetch';

console.log('🧪 Testing Frontend Markdown Rendering Fix');
console.log('==========================================');

async function testEndpoint(name, url, payload) {
  console.log(`\n📡 Testing ${name}...`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let contentTokens = [];
    let finalContent = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content') {
                contentTokens.push(parsed.text);
                finalContent += parsed.text;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }
    
    // Analysis
    console.log(`✅ ${name} completed successfully`);
    console.log(`   📊 Total content tokens: ${contentTokens.length}`);
    console.log(`   📏 Final content length: ${finalContent.length} chars`);
    console.log(`   🔍 Contains newlines: ${finalContent.includes('\n') ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   🔍 Contains double newlines: ${finalContent.includes('\n\n') ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   📄 Line count: ${finalContent.split('\n').length}`);
    
    // Show newline tokens specifically
    const newlineTokens = contentTokens.filter(token => token.includes('\n'));
    if (newlineTokens.length > 0) {
      console.log(`   🟢 Newline tokens found: ${newlineTokens.length}`);
      newlineTokens.forEach((token, i) => {
        console.log(`      ${i + 1}. ${JSON.stringify(token)} (chars: ${token.split('').map(c => c.charCodeAt(0))})`);
      });
    } else {
      console.log(`   ❌ No newline tokens found`);
    }
    
    // Show sample of final content
    console.log(`   📝 Content preview:`);
    console.log(`      "${finalContent.substring(0, 200)}${finalContent.length > 200 ? '...' : ''}"`);
    
    return {
      success: true,
      containsNewlines: finalContent.includes('\n'),
      containsDoubleNewlines: finalContent.includes('\n\n'),
      lineCount: finalContent.split('\n').length,
      tokenCount: contentTokens.length,
      newlineTokenCount: newlineTokens.length,
      content: finalContent
    };
    
  } catch (error) {
    console.log(`❌ ${name} failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  // Test debug endpoint
  const debugResult = await testEndpoint(
    'Debug Endpoint',
    'http://localhost:3001/api/responses/debug-markdown',
    {}
  );
  
  // Test real endpoint
  const realResult = await testEndpoint(
    'Real OpenAI Endpoint', 
    'http://localhost:3001/api/responses/create',
    {
      message: 'Please list the current requirements in markdown format with bullet points.',
      requirements: {
        loadCapacity: '4500 kg',
        liftHeight: '3600 mm'
      }
    }
  );
  
  console.log('\n🎯 TEST RESULTS SUMMARY');
  console.log('=======================');
  
  if (debugResult.success && realResult.success) {
    const debugGood = debugResult.containsNewlines && debugResult.lineCount > 1;
    const realGood = realResult.containsNewlines && realResult.lineCount > 1;
    
    console.log(`Debug Endpoint: ${debugGood ? '✅ PASS' : '❌ FAIL'} (newlines: ${debugResult.containsNewlines}, lines: ${debugResult.lineCount})`);
    console.log(`Real Endpoint:  ${realGood ? '✅ PASS' : '❌ FAIL'} (newlines: ${realResult.containsNewlines}, lines: ${realResult.lineCount})`);
    
    if (debugGood && realGood) {
      console.log('\n🎉 SUCCESS! Frontend should now render markdown correctly!');
      console.log('   - Newlines are preserved in streaming content');
      console.log('   - Multiple lines detected in both endpoints');
      console.log('   - MarkdownRenderer should parse content properly');
    } else {
      console.log('\n⚠️  Some issues remain:');
      if (!debugGood) console.log('   - Debug endpoint still has newline issues');
      if (!realGood) console.log('   - Real endpoint still has newline issues');
    }
  } else {
    console.log('❌ One or more endpoints failed to respond');
  }
  
  console.log('\n💡 Next steps:');
  console.log('   1. Open frontend at http://localhost:5175/');
  console.log('   2. Test the AI assistant with a message like "list requirements"');
  console.log('   3. Check browser dev tools for StreamingBuffer debug logs');
  console.log('   4. Verify that markdown renders with proper formatting');
}

runTests().catch(console.error);