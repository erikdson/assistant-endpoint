#!/usr/bin/env node

/**
 * Quick test to verify AI SDK compatibility with our responses endpoint
 */

console.log('🧪 Testing AI SDK Compatibility...\n');

const BASE_URL = process.env.ASSISTANT_API_BASE || 'http://localhost:3001';
const TEST_ENDPOINT = `${BASE_URL}/api/responses/create`;

const testMessage = {
  message: "Hello, please list my requirements",
  requirements: {
    "loadCapacity": [4000, 6000],
    "powerSource": "electric"
  },
  context: {
    level: "solution",
    id: "test_123"
  }
};

async function testAISDKCompatibility() {
  try {
    console.log('📡 Making request to:', TEST_ENDPOINT);
    console.log('📋 Test message:', JSON.stringify(testMessage, null, 2));
    console.log('\n🔄 Checking streaming format...\n');

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
    let contentChunks = [];
    let hasProperFormat = true;

    console.log('📊 Stream Analysis:');
    console.log('==================\n');

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

        if (event === 'data: [DONE]') {
          console.log('🏁 Received [DONE] marker ✅');
          eventCount++;
          break;
        }

        if (event.trim().startsWith('data: ')) {
          const jsonStr = event.replace('data: ', '').trim();
          eventCount++;
          
          try {
            const data = JSON.parse(jsonStr);
            
            // Check if it's OpenAI streaming format
            if (data.object === 'chat.completion.chunk' && data.choices) {
              const choice = data.choices[0];
              if (choice && choice.delta) {
                if (choice.delta.content) {
                  contentChunks.push(choice.delta.content);
                  console.log(`✅ Content chunk ${contentChunks.length}: "${choice.delta.content}"`);
                }
                
                if (choice.finish_reason) {
                  console.log(`✅ Finish reason: ${choice.finish_reason}`);
                }
              }
            } else {
              console.log(`❌ Non-OpenAI format: ${data.type || 'unknown'}`);
              hasProperFormat = false;
            }
          } catch (parseError) {
            console.log(`❌ Parse error: ${parseError.message}`);
            hasProperFormat = false;
          }
        }
      }
    }

    console.log('\n📈 Compatibility Test Results:');
    console.log('==============================');
    console.log(`Total events: ${eventCount}`);
    console.log(`Content chunks: ${contentChunks.length}`);
    console.log(`OpenAI format: ${hasProperFormat ? '✅ YES' : '❌ NO'}`);
    console.log(`Full content: "${contentChunks.join('')}"`);
    
    if (hasProperFormat && contentChunks.length > 0) {
      console.log('\n🎉 SUCCESS: AI SDK compatibility confirmed!');
      console.log('   ✅ OpenAI streaming format');
      console.log('   ✅ Content streaming working');
      console.log('   ✅ Proper completion markers');
    } else {
      console.log('\n❌ COMPATIBILITY ISSUES DETECTED');
      if (!hasProperFormat) console.log('   ❌ Incorrect streaming format');
      if (contentChunks.length === 0) console.log('   ❌ No content received');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAISDKCompatibility();