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
cd footsteps-web
pnpm install
cd ..

# Note: Data processing requires datasets to be downloaded first
echo ""
echo "📊 To process data:"
echo "  Ensure HYDE data is available in data/raw/hyde-3.5/"
echo "  python footstep-generator/generate_footstep_tiles.py"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the application:"
echo "  cd footsteps-web && pnpm dev"
echo ""
echo "🚨 IMPORTANT: The app requires historical datasets to display data."
echo ""
echo "To process data (after obtaining HYDE data):"
echo "  python footstep-generator/generate_footstep_tiles.py  # Complete tile generation"
echo ""
echo "Open http://localhost:3000 to view the Globe of Humans! 🌍"
