"""Incident and change state for the demo, with the rules enforced here.

The tools in ``src/tools/`` are thin: they take the caller from the verified
bearer token and hand over to :class:`delivery.service.DeliveryService`, which
owns every rule. Nothing in this package trusts a user name, role or team that
arrives as an argument or a header.
"""
