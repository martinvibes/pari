DPM ?= dpm
LEDGER_PORT ?= 6865
JSON_PORT ?= 7575
DEMO_DAR := daml/pari-demo/.daml/dist/pari-demo-0.2.0.dar
CAST := web/.pari/cast.json
SMOKE_CAST := web/.pari/smoke-cast.json
SEED := $(DPM) script --dar $(DEMO_DAR) --script-name Pari.Demo:sandbox \
	--ledger-host localhost --ledger-port $(LEDGER_PORT) --wall-clock-time --output-file

.PHONY: build test sandbox seed smoke scale devnet-login devnet-seed devnet-web devnet-smoke devnet-reset

# Build the Pari model, its tests and the demo package.
build:
	cd daml && $(DPM) build --all

# Run every Daml Script test (needs a Java 17+ runtime on PATH).
test: build
	cd daml/pari-tests && $(DPM) test

# A local Canton sandbox with Pari loaded and the JSON Ledger API on $(JSON_PORT).
sandbox: build
	$(DPM) sandbox --ledger-api-port $(LEDGER_PORT) --json-api-port $(JSON_PORT) --dar $(DEMO_DAR)

# Seed the running sandbox with a fresh demo deal and write its party ids for
# the web app. Run it again at any time to start the demo over.
seed:
	@mkdir -p $(dir $(CAST))
	$(SEED) $(CAST)

# Seed a deal of its own and drive it through every write the app offers,
# checking the ledger's figures and every privacy claim.
smoke:
	@mkdir -p $(dir $(SMOKE_CAST))
	$(SEED) $(SMOKE_CAST)
	cd web && PARI_CAST_FILE=.pari/smoke-cast.json npm run --silent smoke

# A hundred new lenders on the running sandbox: the closing, an interest
# payment and a prepayment, each one transaction, checked and timed.
scale:
	@mkdir -p $(dir $(CAST))
	$(DPM) script --dar $(DEMO_DAR) --script-name Pari.Demo:scale \
		--ledger-host localhost --ledger-port $(LEDGER_PORT) --wall-clock-time --output-file web/.pari/scale.json
	@cat web/.pari/scale.json; echo

# HackCanton DevNet. Create the parties and upload $(DEMO_DAR) in the node's
# Console first (docs/devnet.md), then sign in, seed and run the app.
devnet-login:
	scripts/devnet.sh login

devnet-seed:
	scripts/devnet.sh seed

devnet-web:
	scripts/devnet.sh web

devnet-smoke:
	scripts/devnet.sh smoke

# Archive the deal, so the same parties can be seeded again.
devnet-reset:
	scripts/devnet.sh reset
