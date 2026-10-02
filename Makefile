DPM ?= dpm
LEDGER_PORT ?= 6865
JSON_PORT ?= 7575
DEMO_DAR := daml/pari-demo/.daml/dist/pari-demo-0.1.0.dar
CAST := web/.pari/cast.json

.PHONY: build test sandbox seed

# Build the Pari model, its tests and the demo package.
build:
	cd daml && $(DPM) build --all

# Run every Daml Script test (needs a Java 17+ runtime on PATH).
test: build
	cd daml/pari-tests && $(DPM) test

# A local Canton sandbox with Pari loaded and the JSON Ledger API on $(JSON_PORT).
sandbox: build
	$(DPM) sandbox --ledger-api-port $(LEDGER_PORT) --json-api-port $(JSON_PORT) --dar $(DEMO_DAR)

# Seed the running sandbox with the demo deal and write its party ids for the web app.
seed:
	@mkdir -p $(dir $(CAST))
	$(DPM) script --dar $(DEMO_DAR) --script-name Pari.Demo:sandbox \
		--ledger-host localhost --ledger-port $(LEDGER_PORT) --wall-clock-time --output-file $(CAST)
