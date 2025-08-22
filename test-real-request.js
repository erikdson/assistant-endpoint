// Test script to make a real request to our API
import fetch from 'node-fetch';

const testRequest = async () => {
  try {
    console.log('Making request to real API endpoint...');
    
    const response = await fetch('http://localhost:3001/api/responses/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Please list the current requirements in a nice markdown format with bullet points.',
        requirements: {
          loadCapacity: '4500 kg',
          liftHeight: '3600 mm'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log('Response received, streaming content...');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('Stream ended');
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content') {
                console.log('Content token received:', JSON.stringify(parsed.text));
                console.log('  - Contains newlines:', parsed.text.includes('\n'));
                console.log('  - Char codes:', parsed.text.split('').map(c => c.charCodeAt(0)));
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
};

testRequest();