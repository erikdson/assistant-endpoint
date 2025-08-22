// Test script to understand newline handling
console.log('Testing newline representations:');

const actualNewline = '\n';
const escapedNewline = '\\n';

console.log('1. Actual newline char code:', actualNewline.charCodeAt(0)); // Should be 10
console.log('2. Escaped newline char codes:', escapedNewline.split('').map(c => c.charCodeAt(0))); // Should be [92, 110]

const testContent = '\n\n';
console.log('3. Double newline char codes:', testContent.split('').map(c => c.charCodeAt(0))); // Should be [10, 10]

console.log('4. JSON.stringify actual newlines:', JSON.stringify(actualNewline));
console.log('5. JSON.stringify escaped newlines:', JSON.stringify(escapedNewline));
console.log('6. JSON.stringify double newlines:', JSON.stringify(testContent));

// Test how they appear in SSE messages
const message1 = { type: 'content', text: actualNewline };
const message2 = { type: 'content', text: testContent };

console.log('7. SSE with actual newline:', JSON.stringify(message1));
console.log('8. SSE with double newlines:', JSON.stringify(message2));