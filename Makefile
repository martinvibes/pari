DPM ?= dpm

.PHONY: build test

# Build the Pari model and its test package.
build:
	cd daml && $(DPM) build --all

# Run every Daml Script test (needs a Java 17+ runtime on PATH).
test: build
	cd daml/pari-tests && $(DPM) test
