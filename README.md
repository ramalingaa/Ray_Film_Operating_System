# ReelGraph

A story graph for film: from a one-line logline to a pre-production package,
with every fact traced to its source line and every conflict flagged.

The current phase is the **continuity checker** proof of concept
(`docs/spec-continuity-poc.md`): ingest a Fountain screenplay plus costume and
location sheets, extract a story bible with any LLM, and flag continuity
conflicts with exact citations. See `ARCHITECTURE.md` for the full design.

## Quick start

```bash
npm install
cp .env.example .env    # add the key(s) for the models you route to
npm run db:migrate
npm test
npm run ingest          # parse + extract data/script.fountain
npm run checks
npm run dev
```

## Models

Any stage can run on any model: `anthropic:…`, `openai:…`, `gemini:…`,
`openrouter:…`, `groq:…`, `together:…`, `deepseek:…`, `mistral:…`,
`fireworks:…`, `xai:…`, and local `ollama:…`, `lmstudio:…`, `vllm:…`.
Set `MODEL_EXTRACT` and `MODEL_JUDGE` in `.env`.
