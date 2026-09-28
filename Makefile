SCAFFOLDS := go typescript python csharp java
LEVELS := unit integration e2e

.PHONY: pull up down shell logs reset state run test traffic-on traffic-off $(SCAFFOLDS) $(LEVELS)

# 'make test go e2e' passes the language and level as extra goals, which need rules of their own
LANGUAGE := $(word 2,$(MAKECMDGOALS))
LEVEL := $(or $(word 3,$(MAKECMDGOALS)),unit)

$(SCAFFOLDS) $(LEVELS):
	@:

pull:
	docker compose pull

up:
	docker compose up -d
	@echo "fleet-api        http://localhost:4001"
	@echo "deliverme-supply http://localhost:4002"
	@echo "rabbitmq         localhost:5672, management UI http://localhost:15672 (guest/guest)"
	@echo ""
	@echo "run 'make run <language>' to start your service"

run:
	@test -n "$(LANGUAGE)" || { echo "usage: make run <language>   [$(SCAFFOLDS)]"; exit 1; }
	@docker compose exec dev /work/scripts/service.sh run $(LANGUAGE)

test:
	@test -n "$(LANGUAGE)" || { echo "usage: make test <language> [unit|integration|e2e]   [$(SCAFFOLDS)]"; exit 1; }
	@docker compose exec dev /work/scripts/service.sh test $(LANGUAGE) $(LEVEL)

shell:
	docker compose exec dev bash

down:
	docker compose down

logs:
	docker compose logs -f stack

reset:
	@curl -s -X POST http://localhost:4002/v1/_debug/reset > /dev/null
	@docker compose exec -T rabbitmq rabbitmqctl purge_queue device-status > /dev/null 2>&1 || true
	@docker compose exec -T rabbitmq rabbitmqctl purge_queue device-status.dlq > /dev/null 2>&1 || true
	@echo "DeliverMe state cleared and queues purged"

traffic-on:
	@curl -s -X POST -H 'Content-Type: application/json' -d '{"enabled":true}' http://localhost:4001/v1/_debug/traffic > /dev/null
	@echo "fleet traffic on"

traffic-off:
	@curl -s -X POST -H 'Content-Type: application/json' -d '{"enabled":false}' http://localhost:4001/v1/_debug/traffic > /dev/null
	@echo "fleet traffic off"

state:
	@echo "--- queue ---"
	@docker compose exec -T rabbitmq rabbitmqctl list_queues name messages consumers 2>/dev/null | grep -v "^Listing"
	@echo "--- fleet published ---"
	@curl -s http://localhost:4001/v1/_debug/emitted
	@echo "--- DeliverMe calls ---"
	@curl -s http://localhost:4002/v1/_debug/calls
