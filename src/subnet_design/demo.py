"""Run a reproducible FLSM-versus-VLSM classroom demonstration."""

from __future__ import annotations

import json

from subnet_design.config import generate_cisco_ios_config
from subnet_design.engine import HostDemand, compare_strategies


def main() -> None:
    demands = [
        HostDemand("Engineering", 500, 10),
        HostDemand("Computer Lab", 120, 20),
        HostDemand("Administration", 50, 30),
        HostDemand("Point-to-point", 2, 40),
    ]
    result = compare_strategies("10.44.0.0/21", demands)
    print(json.dumps(result, indent=2))
    print("\nCisco IOS-style VLSM configuration (review before use):\n")
    print(generate_cisco_ios_config(result["vlsm"]))


if __name__ == "__main__":
    main()