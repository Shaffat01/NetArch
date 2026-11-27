#!/bin/bash
# NetArch startup script for Linux
set -e

echo "=== NetArch NOC Topology ==="
echo ""

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Install backend deps
echo "Installing backend dependencies..."
source .venv/bin/activate
pip install -q -r backend/requirements.txt

# Install frontend deps if node_modules missing
if [ ! -d "net-diagram-app/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd net-diagram-app
    npm install
    cd ..
fi

echo ""
echo "Starting backend (port 8000) and frontend (port 8090)..."
echo "  Backend: http://localhost:8000"
echo "  Frontend: http://localhost:8090"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Start backend in background
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Start frontend
cd net-diagram-app
npm run dev -- --host 0.0.0.0 --port 8090 &
FRONTEND_PID=$!
cd ..

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Stopped.'; exit" INT TERM
wait
