#!/bin/bash

# Globe of Humans - Complete Setup Script
echo "🌍 Setting up Globe of Humans..."
echo "=================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Poetry
if ! command -v poetry &> /dev/null; then
    echo "❌ Poetry not found. Installing Poetry..."
    curl -sSL https://install.python-poetry.org | python3 -
    echo "✅ Poetry installed"
else
    echo "✅ Poetry found"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js ≥ 20"
    exit 1
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js ≥ 20"
        exit 1
    fi
    echo "✅ Node.js $(node --version) found"
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
    echo "✅ pnpm installed"
else
    echo "✅ pnpm found"
fi

# Install Python dependencies
echo ""
echo "🐍 Installing Python dependencies..."
poetry install --only main

# Install frontend dependencies
echo ""
echo "⚛️ Installing frontend dependencies..."
cd humans-globe-viz
pnpm install
cd ..

# Note: Data processing requires datasets to be downloaded first
echo ""
echo "📊 To process data, first download datasets:"
echo "  poetry run fetch-data"
echo "Then process the data:"
echo "  poetry run process-hyde"
echo "  poetry run process-cities"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the application:"
echo "  cd humans-globe-viz && pnpm dev"
echo ""
echo "🚨 IMPORTANT: The app requires historical datasets to display data."
echo ""
echo "To download and process data:"
echo "  poetry run fetch-data          # Download HYDE & Reba datasets"
echo "  poetry run process-hyde         # Generate population density"
echo "  poetry run process-cities       # Generate human dots"
echo "  poetry run make-tiles          # Create vector tiles (optional)"
echo ""
echo "Open http://localhost:3000 to view the Globe of Humans! 🌍"
