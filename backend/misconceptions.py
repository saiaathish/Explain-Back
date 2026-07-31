"""Misconception Matching Module

Provides regular expression pattern matching for common domain-specific misconceptions
and returns targeted refutation guidance.
"""

import re

MISCONCEPTIONS = [
    {
        "name": "Reversed pump stoichiometry",
        "patterns": [
            r"three\s+(?:K\+?|potassium)",
            r"two\s+(?:Na\+?|sodium)",
            r"potassium\s+(?:ions?\s+)?out",
            r"sodium\s+(?:ions?\s+)?in(?:to)?\s+the\s+cell",
        ],
        "refutation": "The pump exports three sodium ions and imports two potassium ions during each cycle.",
    },
    {
        "name": "Passive transport conflation",
        "patterns": [r"\bdiffus", r"\bpassive\b", r"down\s+(?:their|the)\s+gradient"],
        "refutation": "The pump uses ATP to move both ion species against their concentration gradients.",
    },
    {
        "name": "ATP as generic fuel",
        "patterns": [r"ATP\s+(?:gives|provides)\s+energy", r"uses\s+energy"],
        "refutation": "ATP phosphorylates the pump, and that phosphorylation drives a specific shape change.",
    },
    {
        "name": "Channel-pump conflation",
        "patterns": [r"\bchannel\b", r"pore\s+opens"],
        "refutation": "The pump alternates conformations; it is not an open channel through the membrane.",
    },
    {
        "name": "Gradient direction reversal",
        "patterns": [r"down\s+(?:a|the|their)\s+concentration\s+gradient"],
        "refutation": "Both sodium and potassium are transported against their concentration gradients.",
    },
    {
        "name": "Potassium released outside",
        "patterns": [r"potassium\s+(?:is\s+)?released\s+(?:outside|out)"],
        "refutation": "After dephosphorylation, potassium is released into the cytoplasm.",
    },
    {
        "name": "Sodium released inside",
        "patterns": [r"sodium\s+(?:is\s+)?released\s+(?:inside|in)"],
        "refutation": "Phosphorylation exposes sodium-binding sites outside, where sodium is released.",
    },
    {
        "name": "Charge-balance error",
        "patterns": [r"(?:no|zero)\s+net\s+charge", r"electrically\s+neutral"],
        "refutation": "Each cycle moves one net positive charge out, contributing a negative interior.",
    },
    {
        "name": "Dephosphorylation order error",
        "patterns": [r"potassium\s+is\s+released\s+before\s+phosphate"],
        "refutation": "Phosphate leaves first, returning the pump to the shape that releases potassium inside.",
    },
]


def match(claim: str) -> tuple[str | None, str | None]:
    for misconception in MISCONCEPTIONS:
        if any(re.search(pattern, claim, re.IGNORECASE) for pattern in misconception["patterns"]):
            return misconception["name"], misconception["refutation"]
    return None, None
