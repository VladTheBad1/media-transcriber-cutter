# Makefile for Media Transcription Studio Docker Deployment

.PHONY: help deploy build start stop restart logs status health clean backup

# Default target
.DEFAULT_GOAL := help

# Environment
ENV_FILE := .env.local
COMPOSE_FILE := docker-compose.yml

# Colors
BLUE = \033[0;34m
GREEN = \033[0;32m
YELLOW = \033[1;33m
NC = \033[0m

help: ## Show this help message
	@echo "${BLUE}Media Transcription Studio - Docker Management${NC}"
	@echo ""
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  ${GREEN}%-15s${NC} %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Profiles:"
	@echo "  ${YELLOW}make start-nginx${NC}     - Start with Nginx reverse proxy"
	@echo "  ${YELLOW}make start-gpu${NC}       - Start with GPU acceleration"
	@echo "  ${YELLOW}make start-worker${NC}    - Start with background worker"
	@echo "  ${YELLOW}make start-full${NC}      - Start with all services"

deploy: ## Full deployment with interactive setup
	@echo "${BLUE}Starting full deployment...${NC}"
	@./scripts/deploy.sh deploy

build: ## Build Docker images
	@echo "${BLUE}Building Docker images...${NC}"
	@docker-compose build

build-gpu: ## Build GPU-enabled Docker image
	@echo "${BLUE}Building GPU Docker image...${NC}"
	@docker-compose --profile gpu build app-gpu

start: ## Start basic services (app + db + redis)
	@echo "${BLUE}Starting basic services...${NC}"
	@docker-compose up -d
	@$(MAKE) wait-ready

start-nginx: ## Start with Nginx reverse proxy
	@echo "${BLUE}Starting services with Nginx...${NC}"
	@docker-compose --profile nginx up -d
	@$(MAKE) wait-ready

start-worker: ## Start with background worker
	@echo "${BLUE}Starting services with worker...${NC}"
	@docker-compose --profile worker up -d
	@$(MAKE) wait-ready

start-gpu: ## Start with GPU acceleration
	@echo "${BLUE}Starting services with GPU...${NC}"
	@docker-compose --profile gpu up -d
	@$(MAKE) wait-ready

start-full: ## Start all services (nginx + worker + gpu)
	@echo "${BLUE}Starting all services...${NC}"
	@docker-compose --profile nginx,worker,gpu up -d
	@$(MAKE) wait-ready

start-dev: ## Start development environment
	@echo "${BLUE}Starting development environment...${NC}"
	@docker-compose -f docker-compose.yml -f docker-compose.override.yml --profile dev-tools up -d
	@$(MAKE) wait-ready

stop: ## Stop all services
	@echo "${BLUE}Stopping services...${NC}"
	@docker-compose down

restart: ## Restart services
	@echo "${BLUE}Restarting services...${NC}"
	@docker-compose restart
	@$(MAKE) wait-ready

logs: ## Show logs for all services
	@docker-compose logs -f

logs-app: ## Show application logs
	@docker-compose logs -f app

logs-db: ## Show database logs
	@docker-compose logs -f db

logs-redis: ## Show Redis logs
	@docker-compose logs -f redis

status: ## Show service status
	@docker-compose ps

health: ## Check application health
	@echo "${BLUE}Checking application health...${NC}"
	@curl -s http://localhost:3000/api/health | jq '.' 2>/dev/null || curl -s http://localhost:3000/api/health

wait-ready: ## Wait for services to be ready
	@echo "${BLUE}Waiting for services to be ready...${NC}"
	@timeout=60; \
	while ! docker-compose exec -T db pg_isready -U transcriber >/dev/null 2>&1; do \
		sleep 1; \
		timeout=$$((timeout - 1)); \
		if [ $$timeout -eq 0 ]; then \
			echo "${YELLOW}Database health check timeout${NC}"; \
			break; \
		fi; \
	done; \
	timeout=30; \
	while ! docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; do \
		sleep 1; \
		timeout=$$((timeout - 1)); \
		if [ $$timeout -eq 0 ]; then \
			echo "${YELLOW}Redis health check timeout${NC}"; \
			break; \
		fi; \
	done; \
	timeout=60; \
	while ! curl -f http://localhost:3000/api/health >/dev/null 2>&1; do \
		sleep 2; \
		timeout=$$((timeout - 2)); \
		if [ $$timeout -le 0 ]; then \
			echo "${YELLOW}Application health check timeout${NC}"; \
			break; \
		fi; \
	done
	@echo "${GREEN}Services are ready!${NC}"
	@echo ""
	@echo "Application: http://localhost:3000"
	@echo "Health Check: http://localhost:3000/api/health"

shell-app: ## Shell into application container
	@docker-compose exec app /bin/bash

shell-db: ## Shell into database container
	@docker-compose exec db psql -U transcriber -d transcriber_db

shell-redis: ## Shell into Redis container
	@docker-compose exec redis redis-cli

backup-db: ## Backup database
	@echo "${BLUE}Creating database backup...${NC}"
	@mkdir -p backups
	@docker-compose exec -T db pg_dump -U transcriber transcriber_db > backups/db_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "${GREEN}Database backup created in backups/$(NC)"

restore-db: ## Restore database (requires BACKUP_FILE variable)
ifndef BACKUP_FILE
	@echo "${YELLOW}Usage: make restore-db BACKUP_FILE=backups/db_20231201_120000.sql${NC}"
else
	@echo "${BLUE}Restoring database from $(BACKUP_FILE)...${NC}"
	@docker-compose exec -T db psql -U transcriber -d transcriber_db < $(BACKUP_FILE)
	@echo "${GREEN}Database restored successfully${NC}"
endif

clean: ## Remove all containers, volumes, and images
	@echo "${BLUE}Cleaning up Docker resources...${NC}"
	@docker-compose down -v --remove-orphans
	@docker image prune -f
	@docker volume prune -f
	@echo "${GREEN}Cleanup completed${NC}"

clean-full: ## Remove everything including images and volumes
	@echo "${BLUE}Full cleanup - removing everything...${NC}"
	@docker-compose down -v --remove-orphans --rmi all
	@docker system prune -af --volumes
	@echo "${GREEN}Full cleanup completed${NC}"

update: ## Update and redeploy application
	@echo "${BLUE}Updating application...${NC}"
	@git pull
	@docker-compose build --no-cache
	@docker-compose up -d
	@$(MAKE) wait-ready
	@echo "${GREEN}Application updated successfully${NC}"

env-setup: ## Setup environment file from template
	@if [ ! -f $(ENV_FILE) ]; then \
		cp .env.docker $(ENV_FILE); \
		echo "${GREEN}Environment file created: $(ENV_FILE)${NC}"; \
		echo "${YELLOW}Please edit $(ENV_FILE) with your configuration${NC}"; \
	else \
		echo "${YELLOW}Environment file already exists: $(ENV_FILE)${NC}"; \
	fi

ssl-setup: ## Generate SSL certificates for development
	@echo "${BLUE}Setting up SSL certificates...${NC}"
	@mkdir -p ssl
	@if [ ! -f ssl/cert.pem ]; then \
		openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
			-keyout ssl/key.pem \
			-out ssl/cert.pem \
			-subj "/CN=localhost/O=Media Transcription Studio/C=US" 2>/dev/null; \
		echo "${GREEN}SSL certificates generated${NC}"; \
	else \
		echo "${YELLOW}SSL certificates already exist${NC}"; \
	fi

install-deps: ## Install local dependencies (for development)
	@echo "${BLUE}Installing local dependencies...${NC}"
	@npm install
	@npx prisma generate

migrate: ## Run database migrations
	@echo "${BLUE}Running database migrations...${NC}"
	@docker-compose exec app npx prisma migrate deploy

reset-db: ## Reset database (WARNING: destructive)
	@echo "${YELLOW}WARNING: This will destroy all data in the database!${NC}"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo ""; \
		echo "${BLUE}Resetting database...${NC}"; \
		docker-compose exec app npx prisma migrate reset --force; \
		echo "${GREEN}Database reset completed${NC}"; \
	else \
		echo ""; \
		echo "${YELLOW}Database reset cancelled${NC}"; \
	fi

# Development helpers
dev-setup: env-setup ssl-setup ## Setup development environment
	@echo "${GREEN}Development environment setup completed${NC}"

prod-setup: env-setup ssl-setup ## Setup production environment  
	@echo "${YELLOW}Remember to:${NC}"
	@echo "  1. Edit $(ENV_FILE) with secure passwords"
	@echo "  2. Configure proper SSL certificates"
	@echo "  3. Set up firewall rules"
	@echo "  4. Configure backup strategy"