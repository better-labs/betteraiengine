# Experiment 001: Baseline Prediction

## Overview
Baseline prediction experiment using GPT-4o via OpenRouter and LangChain to analyze Polymarket markets and generate structured predictions.

## Functionality
- Uses OpenAI GPT-4o model through OpenRouter API
- Analyzes Polymarket market data (question, description, volume, liquidity)
- Generates structured predictions with:
  - Outcome (YES/NO/UNCERTAIN)
  - Confidence level (0-100)
  - Probability (0-100)
  - Detailed reasoning
  - Key factors
  - Data quality assessment
- Saves predictions and raw request/response data to database
- Handles both JSON and text response formats
- Logs failures and saves failed prediction records

## Model Configuration
- Model: `openai/gpt-4o`
- Temperature: 0.7
- Provider: OpenRouter

## Environment Variables Required
- `OPENROUTER_API_KEY`
- `SITE_URL` (optional, defaults to localhost:3000)
- `SITE_NAME` (optional, defaults to "BetterAI Engine")
