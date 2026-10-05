import ipaddress
import unittest

from subnet_design.engine import HostDemand, allocate_flsm, allocate_vlsm, compare_strategies
from subnet_design.config import generate_cisco_ios_config


DEMANDS = [
    HostDemand("Engineering", 500, 10),
    HostDemand("Computer Lab", 120, 20),
    HostDemand("Administration", 50, 30),
    HostDemand("Point-to-point", 2, 40),
]


class SubnetEngineTests(unittest.TestCase):
    def test_vlsm_allocations_are_valid_and_non_overlapping(self):
        result = allocate_vlsm("10.44.0.0/21", DEMANDS)
        networks = [ipaddress.ip_network(item["network"]) for item in result["subnets"]]

        self.assertEqual(len(networks), len(DEMANDS))
        self.assertTrue(all(network.subnet_of(ipaddress.ip_network("10.44.0.0/21")) for network in networks))
        self.assertFalse(any(left.overlaps(right) for index, left in enumerate(networks) for right in networks[index + 1 :]))
        self.assertEqual({item["name"] for item in result["subnets"]}, {item.name for item in DEMANDS})

    def test_vlsm_uses_fewer_addresses_and_less_host_capacity_waste(self):
        result = compare_strategies("10.44.0.0/21", DEMANDS)
        self.assertEqual(result["comparison"]["address_savings_with_vlsm"], 1340)
        self.assertEqual(result["comparison"]["usable_host_waste_reduction_with_vlsm"], 1340)
        self.assertEqual(result["flsm"]["summary"]["allocated_addresses"], 2048)
        self.assertEqual(result["vlsm"]["summary"]["allocated_addresses"], 708)

    def test_flsm_allocates_same_prefix_for_every_demand(self):
        result = allocate_flsm("10.44.0.0/21", DEMANDS)
        prefixes = {item["prefix_length"] for item in result["subnets"]}
        self.assertEqual(prefixes, {23})

    def test_rejects_non_network_cidr(self):
        with self.assertRaises(ValueError):
            allocate_vlsm("10.44.0.1/21", DEMANDS)

    def test_rejects_insufficient_parent_network(self):
        with self.assertRaises(ValueError):
            allocate_vlsm("192.0.2.0/25", DEMANDS)

    def test_accepts_full_ipv4_usable_host_range(self):
        result = allocate_vlsm("0.0.0.0/0", [HostDemand("All IPv4", 4_294_967_294)])
        self.assertEqual(result["subnets"][0]["prefix_length"], 0)

    def test_rejects_duplicate_vlan_ids(self):
        demands = [HostDemand("Lab A", 30, 20), HostDemand("Lab B", 30, 20)]
        with self.assertRaisesRegex(ValueError, "Duplicate VLAN ID"):
            allocate_vlsm("10.0.0.0/24", demands)

    def test_cisco_config_uses_allocated_gateway_and_vlan(self):
        result = allocate_vlsm("10.44.0.0/21", DEMANDS)
        config = generate_cisco_ios_config(result)

        self.assertIn("encapsulation dot1Q 10", config)
        self.assertIn("ip address 10.44.0.1 255.255.254.0", config)
        self.assertIn("ip dhcp pool Engineering", config)
        self.assertIn("Review interface names", config)

    def test_cisco_config_autovlan_avoids_explicit_vlan_ids(self):
        demands = [HostDemand("Explicit", 20, 1), HostDemand("Automatic", 20)]
        config = generate_cisco_ios_config(allocate_vlsm("10.44.0.0/24", demands))
        self.assertIn("interface GigabitEthernet0/0.1", config)
        self.assertIn("interface GigabitEthernet0/0.2", config)


if __name__ == "__main__":
    unittest.main()