#!/bin/bash
# NetArch startup script for Linux
set -e

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-8090}"

echo "=== NetArch NOC Topology ==="
echo "  Backend port: $BACKEND_PORT"
echo "  Frontend port: $FRONTEND_PORT"
echo ""

# Kill any existing processes on our ports
echo "Cleaning up old processes..."
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 8090/tcp 2>/dev/null || true
fuser -k "$BACKEND_PORT/tcp" 2>/dev/null || true
fuser -k "$FRONTEND_PORT/tcp" 2>/dev/null || true
sleep 1

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Install backend deps
echo "Installing backend dependencies..."
source .venv/bin/activate
pip install -q -r backend/requirements.txt

# Initialize DB if empty (first run on fresh server)
cd backend
if [ ! -f "network_topology.db" ] || [ "$(stat -c%s network_topology.db 2>/dev/null || echo 0)" -lt 100000 ]; then
    echo "First run detected — initializing database..."
    python seed_dc_wan.py 2>/dev/null || echo "seed_dc_wan skipped"
    python seed_ndc.py 2>/dev/null || echo "seed_ndc skipped"
    python seed_full.py 2>/dev/null || echo "seed_full skipped"
    # Run migrations if they exist
    for m in migrate_librenms.py migrate2_fix_isp.py migrate4_paths.py migrate5_dc_ndc_sites.py migrate6_fix_serial.py migrate7_wmtc_b1.py; do
        [ -f "$m" ] && python "$m" 2>/dev/null
    done
    echo "DB initialized."
fi
cd ..

# Install frontend deps if node_modules missing
if [ ! -d "net-diagram-app/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd net-diagram-app
    npm install
    cd ..
fi

echo ""
echo "Starting backend (port $BACKEND_PORT) and frontend (port $FRONTEND_PORT)..."
echo "  Backend:  http://localhost:$BACKEND_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Start backend in background
cd backend
uvicorn main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!
cd ..

# Start frontend — set VITE_API_PORT so vite proxies correctly
cd net-diagram-app
BACKEND_PORT=$BACKEND_PORT npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
cd ..

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Stopped.'; exit" INT TERM
wait
