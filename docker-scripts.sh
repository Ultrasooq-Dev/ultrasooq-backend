#!/bin/bash

# Docker Management Scripts for UltraSooq Backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Development environment
dev_start() {
    print_status "Starting development environment..."
    check_docker
    
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from .env.dev..."
        cp .env.dev .env
    fi
    
    docker-compose -f docker-compose.dev.yml up -d
    
    print_status "Waiting for services to be ready..."
    sleep 10
    
    print_status "Running database migrations..."
    docker-compose -f docker-compose.dev.yml exec -T app npx prisma migrate deploy
    
    print_status "Development environment is ready!"
    print_status "Application: http://localhost:3000"
    print_status "Database: localhost:5432"
    print_status "Redis: localhost:6379"
}

dev_stop() {
    print_status "Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    print_status "Development environment stopped."
}

dev_logs() {
    docker-compose -f docker-compose.dev.yml logs -f "${2:-app}"
}

# Production environment
prod_start() {
    print_status "Starting production environment..."
    check_docker
    
    if [ ! -f .env ]; then
        print_error ".env file not found. Please copy .env.example and configure it."
        exit 1
    fi
    
    docker-compose up -d
    
    print_status "Waiting for services to be ready..."
    sleep 15
    
    print_status "Running database migrations..."
    docker-compose exec -T app npx prisma migrate deploy
    
    print_status "Production environment is ready!"
    print_status "Application: http://localhost:3000"
}

prod_stop() {
    print_status "Stopping production environment..."
    docker-compose down
    print_status "Production environment stopped."
}

prod_logs() {
    docker-compose logs -f "${2:-app}"
}

# Database operations
db_migrate() {
    print_status "Running database migrations..."
    if [ "$1" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml exec app npx prisma migrate deploy
    else
        docker-compose exec app npx prisma migrate deploy
    fi
    print_status "Migrations completed."
}

db_reset() {
    print_warning "This will reset the database and delete all data!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ "$1" = "dev" ]; then
            docker-compose -f docker-compose.dev.yml exec app npx prisma migrate reset --force
        else
            print_error "Database reset is only available in development mode."
            exit 1
        fi
    fi
}

db_seed() {
    print_status "Seeding database..."
    if [ "$1" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml exec app npm run seed
    else
        docker-compose exec app npm run seed
    fi
    print_status "Database seeded."
}

# Utility functions
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker system prune -f
    docker volume prune -f
    print_status "Cleanup completed."
}

rebuild() {
    print_status "Rebuilding application..."
    if [ "$1" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml down
        docker-compose -f docker-compose.dev.yml build --no-cache
        docker-compose -f docker-compose.dev.yml up -d
    else
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
    fi
    print_status "Rebuild completed."
}

backup_db() {
    print_status "Creating database backup..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="backup_${TIMESTAMP}.sql"
    
    if [ "$1" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml exec -T postgres pg_dump -U postgres ultrasooq_dev > $BACKUP_FILE
    else
        docker-compose exec -T postgres pg_dump -U postgres ultrasooq > $BACKUP_FILE
    fi
    
    print_status "Database backup created: $BACKUP_FILE"
}

# Show help
show_help() {
    echo "UltraSooq Backend Docker Management Script"
    echo ""
    echo "Usage: ./docker-scripts.sh [COMMAND] [ENVIRONMENT]"
    echo ""
    echo "Commands:"
    echo "  start [dev|prod]     Start the environment (default: dev)"
    echo "  stop [dev|prod]      Stop the environment"
    echo "  logs [dev|prod]      Show logs"
    echo "  restart [dev|prod]   Restart the environment"
    echo "  rebuild [dev|prod]   Rebuild and restart"
    echo ""
    echo "Database Commands:"
    echo "  db:migrate [dev|prod]  Run database migrations"
    echo "  db:reset dev           Reset database (dev only)"
    echo "  db:seed [dev|prod]     Seed database"
    echo "  db:backup [dev|prod]   Backup database"
    echo ""
    echo "Utility Commands:"
    echo "  cleanup              Clean up Docker resources"
    echo "  status [dev|prod]    Show service status"
    echo "  shell [dev|prod]     Open shell in app container"
    echo ""
    echo "Examples:"
    echo "  ./docker-scripts.sh start dev"
    echo "  ./docker-scripts.sh logs prod"
    echo "  ./docker-scripts.sh db:migrate dev"
}

# Main script logic
case "$1" in
    "start")
        if [ "$2" = "prod" ]; then
            prod_start
        else
            dev_start
        fi
        ;;
    "stop")
        if [ "$2" = "prod" ]; then
            prod_stop
        else
            dev_stop
        fi
        ;;
    "logs")
        if [ "$2" = "prod" ]; then
            prod_logs
        else
            dev_logs
        fi
        ;;
    "restart")
        if [ "$2" = "prod" ]; then
            prod_stop
            prod_start
        else
            dev_stop
            dev_start
        fi
        ;;
    "rebuild")
        rebuild "$2"
        ;;
    "db:migrate")
        db_migrate "$2"
        ;;
    "db:reset")
        db_reset "$2"
        ;;
    "db:seed")
        db_seed "$2"
        ;;
    "db:backup")
        backup_db "$2"
        ;;
    "cleanup")
        cleanup
        ;;
    "status")
        if [ "$2" = "prod" ]; then
            docker-compose ps
        else
            docker-compose -f docker-compose.dev.yml ps
        fi
        ;;
    "shell")
        if [ "$2" = "prod" ]; then
            docker-compose exec app sh
        else
            docker-compose -f docker-compose.dev.yml exec app sh
        fi
        ;;
    *)
        show_help
        ;;
esac