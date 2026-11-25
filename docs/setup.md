# TENORIX Setup Guide

## Local Development

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```

2. **Start the Backend API:**
   ```bash
   npm run dev:backend
   ```
   The API starts on `http://localhost:4000` and automatically initializes `backend/data/db.json` with 3 computed demo seed records if no storage file exists yet.

3. **Start the Frontend:**
   ```bash
   npm run dev:frontend
   ```
   Open `http://localhost:5173`.

## Running Tests & Builds

- **Run backend unit & API integration tests:**
  ```bash
  npm test
  ```
- **Build backend and frontend for production:**
  ```bash
  npm run build
  ```
