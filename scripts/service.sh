#!/usr/bin/env bash
# Runs inside the dev container. Usage: service.sh run <language> | service.sh test <language> [unit|integration|e2e]
set -euo pipefail

action=${1:-}
language=${2:-}
level=${3:-unit}

cd "/work/service/$language" 2>/dev/null || { echo "no service/$language directory"; exit 1; }

java_cp="$GSON_JAR:$AMQP_JAR:$SLF4J_JARS"

start() {
  case "$language" in
    go) exec go run . ;;
    typescript) npm install --silent --no-audit --no-fund; exec node server.ts ;;
    python) exec python3 server.py ;;
    java) javac -cp "$JUNIT_JAR:$java_cp" *.java && exec java -cp ".:$java_cp" Server ;;
    csharp) exec dotnet run --project candidate.csproj ;;
    *) echo "unknown language: $language"; exit 1 ;;
  esac
}

run_tests() {
  case "$language:$level" in
    go:unit) go test -count=1 -skip '^Test(Integration|E2E)' ./... ;;
    go:integration) go test -count=1 -run '^TestIntegration' ./... ;;
    go:e2e) go test -count=1 -run '^TestE2E' ./... ;;

    typescript:*) npm install --silent --no-audit --no-fund; node --test "test/$level/**/*.test.ts" ;;

    python:*) pytest -q "tests/$level" ;;

    java:*)
      javac -cp "$JUNIT_JAR:$java_cp" *.java
      case "$level" in
        unit) tags=(--exclude-tag integration --exclude-tag e2e) ;;
        *) tags=(--include-tag "$level") ;;
      esac
      java -jar "$JUNIT_JAR" execute --class-path ".:$java_cp" --scan-class-path "${tags[@]}" --details=tree --disable-banner ;;

    csharp:unit) dotnet test tests --filter 'Category!=integration&Category!=e2e' ;;
    csharp:*) dotnet test tests --filter "Category=$level" ;;

    *) echo "unknown language: $language"; exit 1 ;;
  esac
}

consumers() {
  curl -s -u guest:guest "http://localhost:15672/api/queues/%2F/device-status" | jq -r '.consumers // 0'
}

e2e() {
  # The broker's consumer count trails a disconnect by a few seconds.
  for _ in $(seq 1 10); do
    [ "$(consumers)" = "0" ] && break
    sleep 1
  done
  if [ "$(consumers)" != "0" ]; then
    echo "something is already consuming device-status. stop 'make run' first, e2e starts its own consumer."
    exit 1
  fi

  log=/tmp/e2e-consumer.log
  # Its own process group, so stopping it also stops what go run or dotnet run spawned.
  setsid "$0" run "$language" > "$log" 2>&1 &
  consumer_pid=$!
  trap 'kill -- -$consumer_pid 2>/dev/null || true' EXIT

  for _ in $(seq 1 120); do
    [ "$(consumers)" != "0" ] && break
    kill -0 "$consumer_pid" 2>/dev/null || { echo "your consumer exited before it attached:"; cat "$log"; exit 1; }
    sleep 0.5
  done
  [ "$(consumers)" != "0" ] || { echo "your consumer never attached to device-status:"; cat "$log"; exit 1; }

  if ! run_tests; then
    echo
    echo "--- your consumer's output (full log in $log) ---"
    tail -n 40 "$log"
    exit 1
  fi
}

case "$action" in
  run) start ;;
  test) if [ "$level" = e2e ]; then e2e; else run_tests; fi ;;
  *) echo "usage: service.sh run <language> | service.sh test <language> [unit|integration|e2e]"; exit 1 ;;
esac
