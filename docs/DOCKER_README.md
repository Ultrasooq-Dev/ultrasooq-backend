# Docker Deployment Guide

This document provides instructions for dockerizing and deploying the UltraSooq backend application.

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Git

## 🚀 Quick Start

### Development Environment

1. **Clone and setup environment**
   ```bash
   git clone <repository-url>
   cd xmartech-ultrasooq-backend
   cp .env.dev .env
   ```

2. **Start development services**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

3. **Run database migrations**
   ```bash
   docker-compose -f docker-compose.dev.yml exec app npx prisma migrate deploy
   ```

### Production Environment

1. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

2. **Build and start services**
   ```bash
   docker-compose up -d
   ```

3. **Run database migrations**
   ```bash
   docker-compose exec app npx prisma migrate deploy
   ```

## 🏗️ Architecture

### Services

- **app**: NestJS backend application
- **postgres**: PostgreSQL database
- **redis**: Redis cache
- **nginx**: Reverse proxy (production only)

### Volumes

- **postgres_data**: Database persistence
- **redis_data**: Redis persistence
- **uploads**: File upload storage

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
LOCAL_DATABASE_URL=postgresql://postgres:password@postgres:5432/ultrasooq
JWT_SECRET=your-secret-key
SENDGRID_API_KEY=your-sendgrid-key
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
STRIPE_SECRET_KEY=your-stripe-key

# Optional
NODE_ENV=production
APP_PORT=3000
POSTGRES_PASSWORD=your-secure-password
```

### Docker Compose Profiles

- **Default**: Core services (app, postgres, redis)
- **Production**: Includes nginx reverse proxy

```bash
# Start with nginx
docker-compose --profile production up -d
```

## 📝 Common Commands

### Development

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f app

# Execute commands in container
docker-compose -f docker-compose.dev.yml exec app npm run prisma:generate

# Stop services
docker-compose -f docker-compose.dev.yml down
```

### Production

```bash
# Start production environment
docker-compose up -d

# View logs
docker-compose logs -f app

# Scale application
docker-compose up -d --scale app=3

# Update application
docker-compose pull && docker-compose up -d

# Stop services
docker-compose down
```

### Database Operations

```bash
# Run migrations
docker-compose exec app npx prisma migrate deploy

# Generate Prisma client
docker-compose exec app npx prisma generate

# Reset database (development only)
docker-compose exec app npx prisma migrate reset

# Access database directly
docker-compose exec postgres psql -U postgres -d ultrasooq
```

## 🔍 Monitoring & Health Checks

### Health Check Endpoints

- **Application**: `http://localhost:3000/health`
- **Database**: Built-in PostgreSQL health check
- **Redis**: Built-in Redis health check

### Service Status

```bash
# Check service health
docker-compose ps

# View resource usage
docker stats

# Check logs
docker-compose logs -f [service-name]
```

## 🛠️ Troubleshooting

### Common Issues

1. **Port conflicts**
   ```bash
   # Check port usage
   netstat -tulpn | grep :3000
   
   # Change ports in .env file
   APP_PORT=3001
   ```

2. **Database connection issues**
   ```bash
   # Check database logs
   docker-compose logs postgres
   
   # Verify connection
   docker-compose exec app node -e "console.log(process.env.LOCAL_DATABASE_URL)"
   ```

3. **Permission issues**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER ./uploads
   ```

### Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v --remove-orphans

# Remove images
docker-compose down --rmi all

# Rebuild from scratch
docker-compose build --no-cache
docker-compose up -d
```

## 🚀 Deployment Strategies

### Blue-Green Deployment

1. **Deploy new version**
   ```bash
   docker-compose -f docker-compose.blue.yml up -d
   ```

2. **Switch traffic**
   ```bash
   # Update nginx configuration
   # Switch from green to blue
   ```

### Rolling Updates

```bash
# Update with zero downtime
docker-compose up -d --scale app=2
docker-compose up -d --no-deps app
docker-compose up -d --scale app=1
```

## 🔒 Security Considerations

- Change default passwords in `.env`
- Use secrets management for sensitive data
- Enable SSL/TLS in nginx configuration
- Regularly update base images
- Implement proper network segmentation
- Use non-root user in containers

## 📈 Performance Optimization

- Enable gzip compression in nginx
- Configure Redis for session storage
- Use connection pooling for database
- Implement proper caching strategies
- Monitor resource usage and scale accordingly

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Docker and application logs
3. Verify environment configuration
4. Contact the development team