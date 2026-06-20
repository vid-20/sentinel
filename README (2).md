# SENTINEL — AI-Powered Traffic Enforcement Intelligence Platform

SENTINEL is an operational intelligence and decision-support platform designed to reduce parking-induced congestion. It aggregates and cleans historical parking citation data and incident data, fetches real-time road characteristics via MapmyIndia (Mappls) APIs, trains an XGBoost risk prediction model, estimates spatial congestion impact, cross-validates predictions, flags monitoring blind spots, and generates optimal traffic officer deployment schedules.

---

## Architecture Flow

```
Parking Citation Records
↓
Data Cleaning + Feature Engineering (H3 Spatial Grid)
↓
MapmyIndia API Integration Layer (Road Attributes Cache)
↓
Risk Prediction Engine (XGBoost Classifier)
↓
Congestion Impact Engine (Mathematical Road Priority Multiplier)
↓
Monitoring Gap Detection Engine (Blind Spot Alerts)
↓
Enforcement Allocation Engine (Greedy Officer Knapsack Optimizer)
↓
Interactive React + TypeScript Dashboard (Heatmaps & Patrol Pins)
```

---

## Core Modules & Engine Specifications

1. **Data processing pipeline**: Loads, cleans, and deduplicates ~300k parking citations and ~8k ASTraM incidents, bound within Bengaluru coordinates.
2. **Feature Engineering**: Calculates `hour`, `weekday`, `month`, `is_weekend`, `h3_grid_id` (res 8), and fetches road metadata.
3. **MapmyIndia Integration**: Interacts with the Mappls OAuth Token and Reverse Geocoding APIs. Caches road network attributes (class, category, one-way, service status) in PostgreSQL to optimize performance. Includes a dynamic fallback to **OSM Overpass API** if developer keys are not supplied.
4. **Risk Prediction Engine**: Trains an **XGBoost Classifier** on spatiotemporal parameters and outputs a 0-100% risk index.
5. **Congestion Impact Engine**: Normalizes risk against road importance and capacity reduction multipliers:
   $$\text{Impact} = \text{Risk} \times \text{Importance} \times \text{Reduction}$$
6. **Monitoring Gap Detection**: Flags grids where predicted risk is high but historical citations/patrols are extremely low.
7. **Enforcement Allocation Engine**: Computes optimal officer allocations using a greedy knapsack prioritization function.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Database Settings
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=sentinel
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# MapmyIndia API Keys (Required for Premium SDK calls, else falls back to OSM Overpass)
MAPMYINDIA_CLIENT_ID=your_client_id_here
MAPMYINDIA_CLIENT_SECRET=your_client_secret_here
```

---

## Setup & Running the Platform

Ensure [Docker](https://www.docker.com/) is installed and running.

### 1. Build and Start Services
From the root workspace directory, run:
```bash
docker-compose up --build
```
This will build and run:
*   **PostGIS DB** on port `5432`
*   **FastAPI Backend** on port `8000`
*   **Vite React Frontend** on port `5173`

---

## Operational Walkthrough

Once the containers are online, open the dashboard at `http://localhost:5173` and execute the following steps in sequence:

1.  **Ingest Clean Data**: Click **Ingest Clean Data** on the header. This reads the raw CSVs, extracts temporal features, computes H3 grid cells, and loads them into PostgreSQL (takes ~5-10 seconds for the ~300k rows).
2.  **Train XGBoost Model**: Click **Train XGBoost Model**. This compiles the spatial dataset, runs negative sampling, trains the XGBoost binary classifier, and prints training metrics (AUC and Accuracy) directly to the UI.
3.  **Explore Map and Allocations**: The dashboard will automatically reload. Use the **Patrols Slider** to dynamically adjust the number of available officers (e.g. from 20 to 30) and see deployments optimize on the map and side-panel instantly.

---

## REST API Endpoints

The FastAPI backend exposes the following endpoints:

*   `POST /api/upload-datasets`: Ingests and processes the raw citations and ASTraM CSV files.
*   `POST /api/train-model`: Trains the XGBoost model and serializes the state to disk.
*   `POST /api/predict-risk`: Predicts risk probability for a specific latitude, longitude, and timestamp.
*   `POST /api/calculate-impact`: Calculates congestion impact score and classification.
*   `POST /api/validate-hotspots`: Cross-validates predictions with ASTraM incident coordinates.
*   `POST /api/detect-monitoring-gap`: Identifies enforcement gaps/blind spots.
*   `POST /api/allocate-officers`: Computes optimal officer deployments.
*   `GET /api/dashboard-data`: Consolidated payload endpoint for the dashboard UI.
