# Docker Management Scripts for UltraSooq Backend (PowerShell)

param(
    [Parameter(Position=0)]
    [string]$Command,
    
    [Parameter(Position=1)]
    [string]$Environment = "dev"
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

# Check if Docker is running
function Test-Docker {
    try {
        docker info | Out-Null
        return $true
    }
    catch {
        Write-Error "Docker is not running. Please start Docker and try again."
        exit 1
    }
}

# Development environment functions
function Start-DevEnvironment {
    Write-Status "Starting development environment..."
    Test-Docker
    
    if (-not (Test-Path ".env")) {
        Write-Warning ".env file not found. Creating from .env.dev..."
        Copy-Item ".env.dev" ".env"
    }
    
    docker-compose -f docker-compose.dev.yml up -d
    
    Write-Status "Waiting for services to be ready..."
    Start-Sleep -Seconds 10
    
    Write-Status "Running database migrations..."
    docker-compose -f docker-compose.dev.yml exec -T app npx prisma migrate deploy
    
    Write-Status "Development environment is ready!"
    Write-Status "Application: http://localhost:3000"
    Write-Status "Database: localhost:5432"
    Write-Status "Redis: localhost:6379"
}

function Stop-DevEnvironment {
    Write-Status "Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    Write-Status "Development environment stopped."
}

function Show-DevLogs {
    param([string]$Service = "app")
    docker-compose -f docker-compose.dev.yml logs -f $Service
}

# Production environment functions
function Start-ProdEnvironment {
    Write-Status "Starting production environment..."
    Test-Docker
    
    if (-not (Test-Path ".env")) {
        Write-Error ".env file not found. Please copy .env.example and configure it."
        exit 1
    }
    
    docker-compose up -d
    
    Write-Status "Waiting for services to be ready..."
    Start-Sleep -Seconds 15
    
    Write-Status "Running database migrations..."
    docker-compose exec -T app npx prisma migrate deploy
    
    Write-Status "Production environment is ready!"
    Write-Status "Application: http://localhost:3000"
}

function Stop-ProdEnvironment {
    Write-Status "Stopping production environment..."
    docker-compose down
    Write-Status "Production environment stopped."
}

function Show-ProdLogs {
    param([string]$Service = "app")
    docker-compose logs -f $Service
}

# Database operations
function Invoke-DatabaseMigrate {
    param([string]$Env)
    Write-Status "Running database migrations..."
    
    if ($Env -eq "dev") {
        docker-compose -f docker-compose.dev.yml exec app npx prisma migrate deploy
    } else {
        docker-compose exec app npx prisma migrate deploy
    }
    
    Write-Status "Migrations completed."
}

function Reset-Database {
    param([string]$Env)
    
    if ($Env -ne "dev") {
        Write-Error "Database reset is only available in development mode."
        exit 1
    }
    
    Write-Warning "This will reset the database and delete all data!"
    $response = Read-Host "Are you sure? (y/N)"
    
    if ($response -eq "y" -or $response -eq "Y") {
        docker-compose -f docker-compose.dev.yml exec app npx prisma migrate reset --force
    }
}

function Invoke-DatabaseSeed {
    param([string]$Env)
    Write-Status "Seeding database..."
    
    if ($Env -eq "dev") {
        docker-compose -f docker-compose.dev.yml exec app npm run seed
    } else {
        docker-compose exec app npm run seed
    }
    
    Write-Status "Database seeded."
}

# Utility functions
function Invoke-Cleanup {
    Write-Status "Cleaning up Docker resources..."
    docker system prune -f
    docker volume prune -f
    Write-Status "Cleanup completed."
}

function Invoke-Rebuild {
    param([string]$Env)
    Write-Status "Rebuilding application..."
    
    if ($Env -eq "dev") {
        docker-compose -f docker-compose.dev.yml down
        docker-compose -f docker-compose.dev.yml build --no-cache
        docker-compose -f docker-compose.dev.yml up -d
    } else {
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
    }
    
    Write-Status "Rebuild completed."
}

function Backup-Database {
    param([string]$Env)
    Write-Status "Creating database backup..."
    
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = "backup_$timestamp.sql"
    
    if ($Env -eq "dev") {
        docker-compose -f docker-compose.dev.yml exec -T postgres pg_dump -U postgres ultrasooq_dev | Out-File -FilePath $backupFile -Encoding utf8
    } else {
        docker-compose exec -T postgres pg_dump -U postgres ultrasooq | Out-File -FilePath $backupFile -Encoding utf8
    }
    
    Write-Status "Database backup created: $backupFile"
}

function Show-Status {
    param([string]$Env)
    
    if ($Env -eq "prod") {
        docker-compose ps
    } else {
        docker-compose -f docker-compose.dev.yml ps
    }
}

function Open-Shell {
    param([string]$Env)
    
    if ($Env -eq "prod") {
        docker-compose exec app sh
    } else {
        docker-compose -f docker-compose.dev.yml exec app sh
    }
}

# Show help
function Show-Help {
    Write-Host "UltraSooq Backend Docker Management Script (PowerShell)"
    Write-Host ""
    Write-Host "Usage: .\docker-scripts.ps1 [COMMAND] [ENVIRONMENT]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  start [dev|prod]     Start the environment (default: dev)"
    Write-Host "  stop [dev|prod]      Stop the environment"
    Write-Host "  logs [dev|prod]      Show logs"
    Write-Host "  restart [dev|prod]   Restart the environment"
    Write-Host "  rebuild [dev|prod]   Rebuild and restart"
    Write-Host ""
    Write-Host "Database Commands:"
    Write-Host "  db-migrate [dev|prod]  Run database migrations"
    Write-Host "  db-reset dev           Reset database (dev only)"
    Write-Host "  db-seed [dev|prod]     Seed database"
    Write-Host "  db-backup [dev|prod]   Backup database"
    Write-Host ""
    Write-Host "Utility Commands:"
    Write-Host "  cleanup              Clean up Docker resources"
    Write-Host "  status [dev|prod]    Show service status"
    Write-Host "  shell [dev|prod]     Open shell in app container"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\docker-scripts.ps1 start dev"
    Write-Host "  .\docker-scripts.ps1 logs prod"
    Write-Host "  .\docker-scripts.ps1 db-migrate dev"
}

# Main script logic
switch ($Command) {
    "start" {
        if ($Environment -eq "prod") {
            Start-ProdEnvironment
        } else {
            Start-DevEnvironment
        }
    }
    "stop" {
        if ($Environment -eq "prod") {
            Stop-ProdEnvironment
        } else {
            Stop-DevEnvironment
        }
    }
    "logs" {
        if ($Environment -eq "prod") {
            Show-ProdLogs
        } else {
            Show-DevLogs
        }
    }
    "restart" {
        if ($Environment -eq "prod") {
            Stop-ProdEnvironment
            Start-ProdEnvironment
        } else {
            Stop-DevEnvironment
            Start-DevEnvironment
        }
    }
    "rebuild" {
        Invoke-Rebuild $Environment
    }
    "db-migrate" {
        Invoke-DatabaseMigrate $Environment
    }
    "db-reset" {
        Reset-Database $Environment
    }
    "db-seed" {
        Invoke-DatabaseSeed $Environment
    }
    "db-backup" {
        Backup-Database $Environment
    }
    "cleanup" {
        Invoke-Cleanup
    }
    "status" {
        Show-Status $Environment
    }
    "shell" {
        Open-Shell $Environment
    }
    default {
        Show-Help
    }
}