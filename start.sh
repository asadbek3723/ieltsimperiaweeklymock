#!/bin/bash
# Production-ready Start script for IELTS Platform (macOS & Linux compatible)

echo "Starting Application..."

cleanup() {
    echo "Shutting down background processes..."
    kill $(jobs -p) 2>/dev/null || true
    exit
}
trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting Backend..."
(cd backend && node dist/server.js) &

# Start frontend
echo "Starting Frontend..."
(cd frontend && node node_modules/vite/bin/vite.js) &

echo "Application started! Access it via: http://localhost:5173"
wait
