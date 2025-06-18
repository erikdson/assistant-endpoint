# Figma Make + OpenAI API Backend

A minimal Node.js Express backend for securely proxying chat requests to the OpenAI Assistant API.

## Running locally

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your OpenAI API key.
3. Run: `npx vercel dev` (or `npm run dev`)
4. POST to `http://localhost:3000/api/chat` with `{ "message": "Your message" }`

## Deploying to Vercel

- Import this repo on Vercel.
- Add your `OPENAI_API_KEY` in the Vercel environment settings.

## Security

**Never commit your real `.env` to source control.**
