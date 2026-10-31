#!/bin/bash
# Robust Build script for IELTS Platform
set -e

echo "Starting Build Process..."

# Backend build
echo "Building Backend..."
cd backend
npm install
npx prisma generate
npm run build
cd ..

# Frontend build
echo "Building Frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Build Completed Successfully!"
