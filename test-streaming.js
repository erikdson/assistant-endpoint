// Quick test to verify the Responses API streaming works
import fetch from 'node-fetch';

const testStreaming = async () => {
  console.log('🚀 Testing Responses API streaming...');
  
  try {
    const response = await fetch('http://localhost:3001/api/responses/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Tell me about forklifts in exactly 20 words.',
        requirements: {},
        context: { level: 'solution', id: 'test' }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('✅ Response received, processing stream...');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let chunkCount = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));

      for (const line of lines) {
        const data = line.replace('data: ', '').trim();
        try {
          const parsed = JSON.parse(data);
          chunkCount++;
          
          if (parsed.type === 'content') {
            process.stdout.write(parsed.text); // Show word-by-word streaming
          } else {
            console.log(`\n[${chunkCount}] ${parsed.type}:`, parsed);
          }
        } catch (e) {
          console.log(`[Raw] ${data}`);
        }
      }
    }

    console.log('\n✅ Streaming test completed!');
    console.log(`📊 Total chunks received: ${chunkCount}`);
    
  } catch (error) {
    console.error('❌ Streaming test failed:', error.message);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testStreaming();
}

export default testStreaming;