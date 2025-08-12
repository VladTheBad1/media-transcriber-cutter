# Docker Deployment Guide

## Media Transcription Studio - Production Docker Setup

This guide covers deploying the Media Transcription Studio using Docker with production-ready configurations.

## Quick Start

### 1. Prerequisites

- Docker Engine 20.10+ 
- Docker Compose 2.0+
- NVIDIA Docker Runtime (for GPU support)
- At least 8GB RAM (16GB recommended)
- 50GB+ storage for media files

### 2. Environment Setup

```bash
# Clone and setup
git clone <repository-url>
cd transcriber-cutter

# Copy environment template
cp .env.docker .env.local

# Edit environment variables
nano .env.local
```

### 3. Basic Deployment (CPU)

```bash
# Build and start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f app
```

### 4. GPU-Accelerated Deployment

```bash
# Enable GPU profile
echo "COMPOSE_PROFILES=gpu" >> .env.local

# Build and start with GPU support
docker-compose --profile gpu up -d

# Verify GPU access
docker-compose exec app-gpu python3 -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | 3000 | Application port |
| `DB_PASSWORD` | - | PostgreSQL password (required) |
| `REDIS_PASSWORD` | - | Redis password (required) |
| `NEXTAUTH_SECRET` | - | NextAuth secret key (required) |
| `OPENAI_API_KEY` | - | OpenAI API key for summaries |
| `HF_TOKEN` | - | Hugging Face token for speaker diarization |
| `PRELOAD_MODELS` | false | Download AI models on startup |
| `UPLOAD_MAX_SIZE` | 1GB | Maximum upload file size |

### Compose Profiles

Enable different deployment modes:

```bash
# Nginx reverse proxy
COMPOSE_PROFILES=nginx

# Background worker
COMPOSE_PROFILES=worker

# GPU acceleration
COMPOSE_PROFILES=gpu

# Multiple profiles
COMPOSE_PROFILES=nginx,worker,gpu
```

## Service Architecture

### Core Services

- **app**: Main Next.js application (CPU)
- **app-gpu**: GPU-accelerated version
- **db**: PostgreSQL 15 database
- **redis**: Redis for job queues

### Optional Services

- **nginx**: Reverse proxy and static file server
- **worker**: Background job processor

## Storage Volumes

| Volume | Purpose | Size Estimate |
|--------|---------|---------------|
| `media_uploads` | User uploaded files | 10-100GB |
| `media_exports` | Processed exports | 5-50GB |
| `media_temp` | Temporary processing | 5-20GB |
| `whisper_models` | AI model cache | 5-15GB |
| `postgres_data` | Database storage | 1-10GB |
| `redis_data` | Redis persistence | 100MB-1GB |

## Security Configuration

### 1. SSL/TLS Setup

```bash
# Create SSL directory
mkdir -p ssl

# Generate self-signed certificate (for testing)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout ssl/key.pem \
    -out ssl/cert.pem \
    -subj "/CN=localhost"

# For production, use Let's Encrypt:
# certbot certonly --webroot -w /var/www/certbot -d yourdomain.com
```

### 2. Firewall Configuration

```bash
# Allow only necessary ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3000/tcp  # Block direct app access
ufw deny 5432/tcp  # Block database access
```

### 3. Environment Security

```bash
# Set secure file permissions
chmod 600 .env.local
chown root:root .env.local

# Use Docker secrets for sensitive data (recommended)
echo "your-db-password" | docker secret create db_password -
```

## Performance Optimization

### 1. Resource Limits

Add to docker-compose.yml:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'
```

### 2. Database Tuning

```bash
# Optimize PostgreSQL settings
docker-compose exec db psql -U transcriber -d transcriber_db -c "
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '2GB';
ALTER SYSTEM SET work_mem = '64MB';
SELECT pg_reload_conf();
"
```

### 3. Redis Configuration

```yaml
redis:
  command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

## Monitoring and Logs

### 1. Health Checks

```bash
# Application health
curl http://localhost/health

# Database health
docker-compose exec db pg_isready -U transcriber

# Redis health  
docker-compose exec redis redis-cli ping
```

### 2. Log Management

```bash
# View application logs
docker-compose logs -f app

# View database logs
docker-compose logs -f db

# Export logs for analysis
docker-compose logs --no-color app > app.log
```

### 3. Resource Monitoring

```bash
# Container resource usage
docker stats

# Disk usage
docker system df
docker volume ls | xargs docker volume inspect | grep Mountpoint
```

## Backup and Recovery

### 1. Database Backup

```bash
# Create backup
docker-compose exec db pg_dump -U transcriber transcriber_db > backup.sql

# Automated backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T db pg_dump -U transcriber transcriber_db > "$BACKUP_DIR/db_$DATE.sql"
find "$BACKUP_DIR" -name "db_*.sql" -mtime +7 -delete
EOF
chmod +x backup.sh
```

### 2. Media Files Backup

```bash
# Backup media volumes
docker run --rm -v transcriber-cutter_media_uploads:/data -v $(pwd):/backup ubuntu tar czf /backup/media_uploads.tar.gz /data

# Restore media volumes
docker run --rm -v transcriber-cutter_media_uploads:/data -v $(pwd):/backup ubuntu tar xzf /backup/media_uploads.tar.gz -C /
```

## Troubleshooting

### Common Issues

#### 1. Out of Memory

```bash
# Check memory usage
docker stats
free -h

# Increase swap
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 2. Transcription Failures

```bash
# Check Python environment
docker-compose exec app python3 -c "import whisperx; print('WhisperX OK')"

# Check GPU availability
docker-compose exec app-gpu nvidia-smi
```

#### 3. Database Connection Issues

```bash
# Check database status
docker-compose exec db pg_isready -U transcriber

# Reset database connection
docker-compose restart app db
```

#### 4. Storage Issues

```bash
# Check disk space
df -h
docker system df

# Clean up unused resources
docker system prune -a --volumes
```

### Log Analysis

```bash
# Application errors
docker-compose logs app | grep -i error

# Database slow queries
docker-compose logs db | grep -i "slow query"

# Memory issues
dmesg | grep -i "killed process"
```

## Scaling and Load Balancing

### 1. Horizontal Scaling

```yaml
services:
  app:
    deploy:
      replicas: 3
  
  nginx:
    depends_on:
      - app
```

### 2. Load Balancer Configuration

```nginx
upstream app_backend {
    least_conn;
    server app_1:3000;
    server app_2:3000;
    server app_3:3000;
}
```

### 3. Worker Scaling

```bash
# Scale background workers
docker-compose up -d --scale worker=3
```

## Production Checklist

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Database password changed
- [ ] Redis password set
- [ ] Firewall configured
- [ ] Backup system implemented
- [ ] Monitoring enabled
- [ ] Resource limits set
- [ ] Log rotation configured
- [ ] Health checks working

## Support

For issues and support:

1. Check container logs: `docker-compose logs [service]`
2. Verify environment configuration
3. Check disk space and memory usage
4. Review firewall and network settings
5. Consult application documentation

## Updates

To update the application:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d
```