.PHONY: test compile-mu retrieve-mu retrieve-mu-json ask-mu repl-mu verify-msft help

PYTHON ?= python3
export PYTHONPATH := $(CURDIR)

help:
	@echo "Ontology — underwrite surface"
	@echo ""
	@echo "  make agent-mu Q='is thesis intact?' # context for Grok/LLM"
	@echo "  make ask-mu Q='what is on watch?'   # answer from pack (no LLM)"
	@echo "  make repl-mu                        # interactive questions"
	@echo "  make retrieve-mu                    # full pack dump"
	@echo "  make compile-mu                     # refresh from research-wiki"
	@echo "  make verify-msft                    # Part 1 structural gate (MSFT)"
	@echo "  make test                           # mechanical gates + Part 1 verify"
	@echo ""
	@echo "Or:  ./ont agent MU 'is my thesis intact?'"
	@echo "     ./ont ask MU risks"
	@echo "     ./ont verify MSFT"
	@echo "     ./ont verify MSFT --require-confirmed --require-risks-accepted"
	@echo "     ./ont repl MU"

compile-mu:
	$(PYTHON) -m compile.run MU

retrieve-mu: compile-mu
	$(PYTHON) -m api.cli retrieve MU --intent overview --format md

retrieve-mu-json: compile-mu
	$(PYTHON) -m api.cli retrieve MU --intent overview --format json

# Usage: make ask-mu Q='what is my house view?'
ask-mu: compile-mu
	@if [ -z "$(Q)" ]; then \
		echo "Usage: make ask-mu Q='what is on watch?'"; \
		echo "   or: make repl-mu"; \
		exit 1; \
	fi
	$(PYTHON) -m api.cli ask MU $(Q)

# Usage: make agent-mu Q='is my thesis intact?'
agent-mu: compile-mu
	@if [ -z "$(Q)" ]; then \
		echo "Usage: make agent-mu Q='is my thesis intact?'"; \
		exit 1; \
	fi
	$(PYTHON) -m api.cli agent MU $(Q)

repl-mu: compile-mu
	$(PYTHON) -m api.cli ask MU --repl

verify-msft:
	$(PYTHON) -m api.cli verify MSFT

test: compile-mu
	$(PYTHON) -m unittest discover -s tests -v
