# coding: utf-8

"""
    Daytona

    Daytona AI platform API Docs

    The version of the OpenAPI document: 1.0
    Contact: support@daytona.com
    Generated by OpenAPI Generator (https://openapi-generator.tech)

    Do not edit the class manually.
"""  # noqa: E501


from __future__ import annotations
import json
from enum import Enum
from typing_extensions import Self


class RunnerRegion(str, Enum):
    """
    The region of the runner
    """

    """
    allowed enum values
    """
    EU = 'eu'
    US = 'us'
    ASIA = 'asia'

    @classmethod
    def from_json(cls, json_str: str) -> Self:
        """Create an instance of RunnerRegion from a JSON string"""
        return cls(json.loads(json_str))


