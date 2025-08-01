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
import pprint
import re  # noqa: F401
import json

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt
from typing import Any, ClassVar, Dict, List, Optional, Union
from typing import Optional, Set
from typing_extensions import Self

class CreateOrganizationQuota(BaseModel):
    """
    CreateOrganizationQuota
    """ # noqa: E501
    total_cpu_quota: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="totalCpuQuota")
    total_memory_quota: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="totalMemoryQuota")
    total_disk_quota: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="totalDiskQuota")
    max_cpu_per_sandbox: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="maxCpuPerSandbox")
    max_memory_per_sandbox: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="maxMemoryPerSandbox")
    max_disk_per_sandbox: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="maxDiskPerSandbox")
    snapshot_quota: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="snapshotQuota")
    max_snapshot_size: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="maxSnapshotSize")
    volume_quota: Optional[Union[StrictFloat, StrictInt]] = Field(default=None, alias="volumeQuota")
    additional_properties: Dict[str, Any] = {}
    __properties: ClassVar[List[str]] = ["totalCpuQuota", "totalMemoryQuota", "totalDiskQuota", "maxCpuPerSandbox", "maxMemoryPerSandbox", "maxDiskPerSandbox", "snapshotQuota", "maxSnapshotSize", "volumeQuota"]

    model_config = ConfigDict(
        populate_by_name=True,
        validate_assignment=True,
        protected_namespaces=(),
    )


    def to_str(self) -> str:
        """Returns the string representation of the model using alias"""
        return pprint.pformat(self.model_dump(by_alias=True))

    def to_json(self) -> str:
        """Returns the JSON representation of the model using alias"""
        # TODO: pydantic v2: use .model_dump_json(by_alias=True, exclude_unset=True) instead
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, json_str: str) -> Optional[Self]:
        """Create an instance of CreateOrganizationQuota from a JSON string"""
        return cls.from_dict(json.loads(json_str))

    def to_dict(self) -> Dict[str, Any]:
        """Return the dictionary representation of the model using alias.

        This has the following differences from calling pydantic's
        `self.model_dump(by_alias=True)`:

        * `None` is only added to the output dict for nullable fields that
          were set at model initialization. Other fields with value `None`
          are ignored.
        * Fields in `self.additional_properties` are added to the output dict.
        """
        excluded_fields: Set[str] = set([
            "additional_properties",
        ])

        _dict = self.model_dump(
            by_alias=True,
            exclude=excluded_fields,
            exclude_none=True,
        )
        # puts key-value pairs in additional_properties in the top level
        if self.additional_properties is not None:
            for _key, _value in self.additional_properties.items():
                _dict[_key] = _value

        return _dict

    @classmethod
    def from_dict(cls, obj: Optional[Dict[str, Any]]) -> Optional[Self]:
        """Create an instance of CreateOrganizationQuota from a dict"""
        if obj is None:
            return None

        if not isinstance(obj, dict):
            return cls.model_validate(obj)

        _obj = cls.model_validate({
            "totalCpuQuota": obj.get("totalCpuQuota"),
            "totalMemoryQuota": obj.get("totalMemoryQuota"),
            "totalDiskQuota": obj.get("totalDiskQuota"),
            "maxCpuPerSandbox": obj.get("maxCpuPerSandbox"),
            "maxMemoryPerSandbox": obj.get("maxMemoryPerSandbox"),
            "maxDiskPerSandbox": obj.get("maxDiskPerSandbox"),
            "snapshotQuota": obj.get("snapshotQuota"),
            "maxSnapshotSize": obj.get("maxSnapshotSize"),
            "volumeQuota": obj.get("volumeQuota")
        })
        # store additional fields in additional_properties
        for _key in obj.keys():
            if _key not in cls.__properties:
                _obj.additional_properties[_key] = obj.get(_key)

        return _obj


