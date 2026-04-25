#!/bin/bash

echo "========================================"
echo "   ELMC 3D Platform - Automatic Setup"
echo "========================================"
echo ""

echo "[1/5] Checking Python installation..."
python3 --version
echo ""

echo "[2/5] Setting up virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created!"
else
    echo "Virtual environment already exists."
fi
echo ""

echo "[3/5] Activating virtual environment..."
source venv/bin/activate
echo "Virtual environment activated!"
echo ""

echo "[4/5] Installing dependencies..."
if [ -f "requirements.txt" ]; then
    pip install --upgrade pip
    pip install -r requirements.txt
else
    echo "requirements.txt not found, installing defaults..."
    pip install django==5.2.13 djangorestframework mongoengine Pillow requests python-decouple
fi
echo ""

echo "[5/5] Starting Django server..."
echo ""
echo "========================================"
echo "   Server is starting..."
echo "   Access at: http://127.0.0.1:8000/"
echo "========================================"
echo ""

python manage.py runserver