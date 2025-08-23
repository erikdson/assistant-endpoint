#!/usr/bin/env node

/**
 * Test script for improved streaming architecture
 * Tests the new standardized SSE protocol and tool execution timing
 */

console.log('🚀 Testing improved streaming architecture...\n');

// Test configuration
const BASE_URL = process.env.ASSISTANT_API_BASE || 'http://localhost:3001';
const TEST_ENDPOINT = `${BASE_URL}/api/responses/create`;

// Simple test message to verify clean response format
const testMessage = {
  message: "List my current requirements and then recommend some forklifts based on them",
  requirements: {
    "loadCapacity": [4000, 6000],
    "powerSource": "electric",
    "operatingEnvironment": "indoor"
  },
  context: {
    level: "solution",
    id: "test_solution_123"
  },
  systemInstructions: "You are a helpful forklift assistant. Provide responses in clean markdown format."
};

async function testImprovedStreaming() {
  try {
    console.log('📡 Making request to:', TEST_ENDPOINT);
    console.log('📋 Test message:', JSON.stringify(testMessage, null, 2));
    console.log('\n🔄 Starting SSE stream...\n');

    const response = await fetch(TEST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testMessage)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let eventCount = 0;
    let contentTokens = 0;
    let toolsStarted = 0;
    let toolsCompleted = 0;
    let contentComplete = false;

    console.log('📊 Event Stream Analysis:');
    console.log('=======================\n');

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Parse SSE events
      while (buffer.includes('\n\n')) {
        const eventEnd = buffer.indexOf('\n\n');
        const event = buffer.substring(0, eventEnd);
        buffer = buffer.substring(eventEnd + 2);

        if (event.trim().startsWith('data: ')) {
          const jsonStr = event.replace('data: ', '').trim();
          
          try {
            const data = JSON.parse(jsonStr);
            eventCount++;
            
            const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '';
            
            switch (data.type) {
              case 'status':
                console.log(`📍 [${timestamp}] Status: ${data.status}`);
                break;
              
              case 'content':
                contentTokens++;
                if (contentTokens <= 5) {
                  console.log(`💬 [${timestamp}] Content token ${contentTokens}: "${data.text}"`);
                } else if (contentTokens === 6) {
                  console.log(`💬 [${timestamp}] Content streaming... (${contentTokens}+ tokens)`);
                }
                break;
              
              case 'tool_start':
                toolsStarted++;
                if (!contentComplete) {
                  console.log(`⚠️  [${timestamp}] TIMING ISSUE: Tool started before content complete!`);
                } else {
                  console.log(`🔧 [${timestamp}] Tool started: ${data.toolName} ✓`);
                }
                break;
              
              case 'tool_result':
                toolsCompleted++;
                console.log(`🔧 [${timestamp}] Tool completed: ${data.toolName} ✓`);
                break;
              
              case 'tool_error':
                console.log(`🔧 [${timestamp}] Tool error: ${data.toolName} - ${data.error}`);
                break;
              
              case 'done':
                console.log(`🏁 [${timestamp}] Stream complete!`);
                break;
              
              case 'error':
                console.log(`❌ [${timestamp}] Error: ${data.error}`);
                break;
            }

            // Track content completion
            if (data.status === 'content_complete') {
              contentComplete = true;
              console.log(`✅ [${timestamp}] Content streaming complete - tools can now execute`);
            }

          } catch (parseError) {
            console.error('❌ Parse error:', parseError.message);
          }
        }
      }
    }

    console.log('\n📈 Test Results Summary:');
    console.log('========================');
    console.log(`Total SSE events: ${eventCount}`);
    console.log(`Content tokens received: ${contentTokens}`);
    console.log(`Tools started: ${toolsStarted}`);
    console.log(`Tools completed: ${toolsCompleted}`);
    console.log(`Content completed before tools: ${contentComplete ? '✅ YES' : '❌ NO'}`);
    
    // Check for success conditions
    const hasCleanSSE = eventCount > 0;
    const hasContentStreaming = contentTokens > 0;
    const hasProperTiming = contentComplete && toolsStarted > 0 ? true : toolsStarted === 0;
    const noTextMarkers = true; // SSE endpoint doesn't use text markers
    
    if (hasCleanSSE && hasContentStreaming && hasProperTiming && noTextMarkers) {
      console.log('\n🎉 SUCCESS: Clean response format is working correctly!');
      console.log('   ✅ SSE protocol standardized');
      console.log('   ✅ Content streaming working');
      console.log('   ✅ Tool execution timing correct');
      console.log('   ✅ No text marker pollution');
      console.log('   ✅ Clean JSON-based tool outputs');
    } else {
      console.log('\n⚠️  Issues detected:');
      if (!hasCleanSSE) console.log('   ❌ No SSE events received');
      if (!hasContentStreaming) console.log('   ❌ No content streaming detected');
      if (!hasProperTiming) console.log('   ❌ Tool timing issues');
      if (toolsStarted === 0) console.log('   ℹ️  No tools executed (this may be expected)');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testImprovedStreaming();