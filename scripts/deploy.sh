#!/bin/bash
# Media Transcription Studio - Docker Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    print_status "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Docker is installed and running"
}

# Check for NVIDIA Docker (for GPU support)
check_nvidia_docker() {
    if command -v nvidia-docker &> /dev/null || docker info | grep -q nvidia; then
        print_success "NVIDIA Docker runtime detected - GPU acceleration available"
        return 0
    else
        print_warning "NVIDIA Docker runtime not found - GPU acceleration not available"
        return 1
    fi
}

# Setup environment file
setup_environment() {
    print_status "Setting up environment configuration..."
    
    if [ ! -f .env.local ]; then
        if [ -f .env.docker ]; then
            cp .env.docker .env.local
            print_status "Copied .env.docker to .env.local"
        else
            print_error ".env.docker template not found"
            exit 1
        fi
    fi
    
    print_warning "Please edit .env.local with your configuration:"
    echo "  - Set secure passwords for DB_PASSWORD and REDIS_PASSWORD"
    echo "  - Configure NEXTAUTH_SECRET with a secure random string"
    echo "  - Add your OPENAI_API_KEY if you want AI summaries"
    echo "  - Add your HF_TOKEN for speaker diarization"
    echo "  - Update NEXTAUTH_URL with your domain"
    echo ""
    read -p "Press Enter to continue after editing .env.local, or Ctrl+C to exit..."
}

# Generate SSL certificates for development
generate_ssl_certs() {
    print_status "Setting up SSL certificates..."
    
    if [ ! -d "ssl" ]; then
        mkdir -p ssl
    fi
    
    if [ ! -f "ssl/cert.pem" ] || [ ! -f "ssl/key.pem" ]; then
        print_status "Generating self-signed SSL certificates for development..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ssl/key.pem \
            -out ssl/cert.pem \
            -subj "/CN=localhost/O=Media Transcription Studio/C=US" \
            2>/dev/null
        
        print_success "SSL certificates generated"
        print_warning "These are self-signed certificates for development only"
        print_warning "For production, use proper SSL certificates from a CA"
    else
        print_success "SSL certificates already exist"
    fi
}

# Build Docker images
build_images() {
    print_status "Building Docker images..."
    
    # Build CPU version
    docker-compose build app
    
    # Build GPU version if NVIDIA Docker is available
    if check_nvidia_docker; then
        print_status "Building GPU-enabled image..."
        docker-compose --profile gpu build app-gpu
    fi
    
    print_success "Docker images built successfully"
}

# Start services
start_services() {
    local profile=""
    
    print_status "Starting services..."
    
    # Ask user which profile to use
    echo "Which deployment profile would you like to use?"
    echo "1) Basic (app + database + redis)"
    echo "2) With Nginx reverse proxy"
    echo "3) With background worker"
    echo "4) GPU-enabled transcription"
    echo "5) Full stack (nginx + worker + GPU)"
    echo "6) Development with tools"
    
    read -p "Enter your choice (1-6): " choice
    
    case $choice in
        1)
            profile=""
            ;;
        2)
            profile="nginx"
            ;;
        3)
            profile="worker"
            ;;
        4)
            if check_nvidia_docker; then
                profile="gpu"
            else
                print_error "GPU profile selected but NVIDIA Docker not available"
                exit 1
            fi
            ;;
        5)
            if check_nvidia_docker; then
                profile="nginx,worker,gpu"
            else
                print_error "GPU profile selected but NVIDIA Docker not available"
                exit 1
            fi
            ;;
        6)
            profile="dev-tools"
            ;;
        *)
            print_warning "Invalid choice, using basic profile"
            profile=""
            ;;
    esac
    
    # Start services with selected profile
    if [ -n "$profile" ]; then
        docker-compose --profile "$profile" up -d
    else
        docker-compose up -d
    fi
    
    print_success "Services started successfully"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    # Wait for database
    print_status "Waiting for database..."
    timeout=60
    while ! docker-compose exec -T db pg_isready -U transcriber > /dev/null 2>&1; do
        sleep 1
        timeout=$((timeout - 1))
        if [ $timeout -eq 0 ]; then
            print_error "Database failed to start within 60 seconds"
            exit 1
        fi
    done
    print_success "Database is ready"
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    timeout=30
    while ! docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
        sleep 1
        timeout=$((timeout - 1))
        if [ $timeout -eq 0 ]; then
            print_error "Redis failed to start within 30 seconds"
            exit 1
        fi
    done
    print_success "Redis is ready"
    
    # Wait for application
    print_status "Waiting for application..."
    timeout=60
    while ! curl -f http://localhost:3000/api/health > /dev/null 2>&1; do
        sleep 2
        timeout=$((timeout - 2))
        if [ $timeout -le 0 ]; then
            print_error "Application failed to start within 60 seconds"
            exit 1
        fi
    done
    print_success "Application is ready"
}

# Show status and URLs
show_status() {
    print_success "Media Transcription Studio is now running!"
    echo ""
    echo "Access URLs:"
    echo "  Application: http://localhost:3000"
    echo "  Health Check: http://localhost:3000/api/health"
    
    if docker-compose ps | grep -q nginx; then
        echo "  Nginx Proxy: http://localhost:80 (HTTPS: https://localhost:443)"
    fi
    
    if docker-compose ps | grep -q adminer; then
        echo "  Database Admin: http://localhost:8080"
    fi
    
    if docker-compose ps | grep -q redis-commander; then
        echo "  Redis Admin: http://localhost:8081"
    fi
    
    echo ""
    echo "Useful commands:"
    echo "  View logs: docker-compose logs -f"
    echo "  Stop services: docker-compose down"
    echo "  Restart app: docker-compose restart app"
    echo "  Database shell: docker-compose exec db psql -U transcriber -d transcriber_db"
    echo ""
    print_status "Check the DEPLOYMENT.md file for more detailed documentation"
}

# Main deployment function
deploy() {
    print_status "Starting Media Transcription Studio deployment..."
    
    check_docker
    setup_environment
    generate_ssl_certs
    build_images
    start_services
    wait_for_services
    show_status
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "start")
        start_services
        wait_for_services
        show_status
        ;;
    "stop")
        print_status "Stopping services..."
        docker-compose down
        print_success "Services stopped"
        ;;
    "restart")
        print_status "Restarting services..."
        docker-compose down
        start_services
        wait_for_services
        show_status
        ;;
    "build")
        build_images
        ;;
    "logs")
        docker-compose logs -f "${2:-app}"
        ;;
    "status")
        docker-compose ps
        ;;
    "health")
        curl -s http://localhost:3000/api/health | jq '.' 2>/dev/null || curl -s http://localhost:3000/api/health
        ;;
    *)
        echo "Usage: $0 {deploy|start|stop|restart|build|logs|status|health}"
        echo ""
        echo "Commands:"
        echo "  deploy  - Full deployment (default)"
        echo "  start   - Start services"
        echo "  stop    - Stop services"
        echo "  restart - Restart services"
        echo "  build   - Build Docker images"
        echo "  logs    - Show logs (optionally specify service)"
        echo "  status  - Show service status"
        echo "  health  - Check application health"
        exit 1
        ;;
esac