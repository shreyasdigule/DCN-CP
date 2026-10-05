# Project Guidance

- Keep subnet calculations in the standard-library-backed engine under `src/subnet_design/engine.py`.
- Preserve the distinction between allocated addresses, usable host capacity, and unallocated parent-pool addresses in metrics and documentation.
- Keep API request validation at the FastAPI boundary and return clear validation errors.
- Configuration output is a reviewable example, not production-ready device configuration; do not remove its review warning.
- Add focused tests for allocation correctness, address utilization, and exported configuration behavior.