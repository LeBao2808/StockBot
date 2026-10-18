This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## StockMate MCP

The assistant uses the OpenAI Responses API for natural Vietnamese replies and tool selection. It can choose the `compare_portfolio_holding`, `get_stock_quote`, or `summarize_portfolio` capability; the application executes those calls through its MCP client. Configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in `.env` to enable the LLM.

The MCP server is also available at `http://localhost:3000/api/mcp` using Streamable HTTP.

Set a long random `STOCKMATE_MCP_TOKEN` in `.env` before connecting an external MCP client. Send it as `Authorization: Bearer <token>`. The tool accepts `{ "symbol": "AAPL" }` and reads the saved holding from MongoDB, then fetches the current quote from Finnhub. Keep the endpoint private and do not share the token.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
