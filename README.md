# BetterAI Engine

## Overview

BetterAI-Engine is a headless backend system for generating AI-powered predictions on Polymarket markets. It ingests market data from the Polymarket Gamma API, stores structured data and raw API payloads in Postgres, and runs a prediction pipeline via LangChain and OpenRouter. The system is operated through CLI commands and scheduled batch jobs.

---

## 🎯 Purpose

The purpose of BetterAI-v2 is to provide a streamlined, backend-only prediction engine for Polymarket markets. By focusing on ingestion, storage, and automated AI-driven predictions, it avoids early frontend overhead while ensuring data auditability, reproducibility, and future extensibility.

BetterAI-v2 sets the foundation for more advanced features such as multi-model research integration, portfolio monitoring, and trading automation.

---

## 🛠️ The Problems Addressed

* **Data Ingestion & Persistence**: Automated daily ingestion of Polymarket’s top markets ensures always-current market data.
* **Auditability & Compliance**: Raw JSON API responses are stored in a dedicated `polymarket_raw` table, enabling full transparency and debugging.
* **Prediction Automation**: AI models (via LangChain + OpenRouter) generate structured predictions for specified markets or events.
* **Operational Simplicity**: Headless, CLI-first design keeps setup simple without a frontend.
* **Extensibility**: The system design makes it easy to layer in future capabilities like external research integrations, trading signals, and dashboards.
