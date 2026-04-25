@echo off
title ELMC 3D - Platform Launcher
color 0A

echo ========================================
echo    ELMC 3D Platform - Automatic Setup
echo ========================================
echo.

:: Verificare Python
echo [1/7] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed!
    echo.
    echo Please install Python 3.11 or higher from:
    echo https://www.python.org/downloads/
    echo.
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)
python --version
echo.

echo [2/7] Checking pip...
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] pip is not available!
    pause
    exit /b 1
)
pip --version
echo.

echo [3/7] Checking Django installation...
python -c "import django" >nul 2>&1
if %errorlevel% neq 0 (
    echo Django not found - will be installed with dependencies
) else (
    echo Django is installed
)
echo.

echo [4/7] Setting up virtual environment...
if exist "venv\" (
    echo Virtual environment already exists.
) else (
    echo Creating virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
    echo Virtual environment created successfully!
)
echo.

echo [5/7] Activating virtual environment...
call venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate virtual environment!
    pause
    exit /b 1
)
echo Virtual environment activated!
echo.

echo [6/7] Installing dependencies...
if exist "requirements.txt" (
    echo Installing from requirements.txt...
    pip install --upgrade pip
    pip install -r requirements.txt
) else (
    echo requirements.txt not found!
    echo Installing default dependencies...
    pip install django==5.2.13
    pip install djangorestframework==3.17.1
    pip install mongoengine==0.29.1
    pip install pymongo==4.10.1
    pip install Pillow==11.1.0
    pip install requests==2.32.3
    pip install python-decouple==3.8
    pip install drf-yasg==1.21.8
    pip install django-cors-headers==4.6.0
    pip install gunicorn==23.0.0
)
if %errorlevel% neq 0 (
    echo [WARNING] Some dependencies may have failed to install
)
echo Dependencies installation completed!
echo.

:: Colectare fisiere statice (optional)
echo [7/7] Preparing static files...
if exist "manage.py" (
    python manage.py collectstatic --noinput >nul 2>&1
    echo Static files collected
) else (
    echo Warning: manage.py not found in current directory
)
echo.

:: Pornire server
cls
echo ========================================
echo    ELMC 3D Platform - Server Started
echo ========================================
echo.
echo    Access the application at:
echo.
echo    http://127.0.0.1:8000/
echo    http://localhost:8000/
echo.
echo    API Documentation:
echo    http://127.0.0.1:8000/api/docs/
echo.
echo ========================================
echo.
echo    Press Ctrl+C to stop the server
echo ========================================
echo.

python manage.py runserver

pause