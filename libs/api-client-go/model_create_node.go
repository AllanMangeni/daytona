/*
Daytona

Daytona AI platform API Docs

API version: 1.0
Contact: support@daytona.com
*/

// Code generated by OpenAPI Generator (https://openapi-generator.tech); DO NOT EDIT.

package daytonaapiclient

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// checks if the CreateNode type satisfies the MappedNullable interface at compile time
var _ MappedNullable = &CreateNode{}

// CreateNode struct for CreateNode
type CreateNode struct {
	Domain   string  `json:"domain"`
	ApiUrl   string  `json:"apiUrl"`
	ApiKey   string  `json:"apiKey"`
	Cpu      float32 `json:"cpu"`
	Memory   float32 `json:"memory"`
	Disk     float32 `json:"disk"`
	Gpu      float32 `json:"gpu"`
	GpuType  string  `json:"gpuType"`
	Class    string  `json:"class"`
	Capacity float32 `json:"capacity"`
	Region   string  `json:"region"`
}

type _CreateNode CreateNode

// NewCreateNode instantiates a new CreateNode object
// This constructor will assign default values to properties that have it defined,
// and makes sure properties required by API are set, but the set of arguments
// will change when the set of required properties is changed
func NewCreateNode(domain string, apiUrl string, apiKey string, cpu float32, memory float32, disk float32, gpu float32, gpuType string, class string, capacity float32, region string) *CreateNode {
	this := CreateNode{}
	this.Domain = domain
	this.ApiUrl = apiUrl
	this.ApiKey = apiKey
	this.Cpu = cpu
	this.Memory = memory
	this.Disk = disk
	this.Gpu = gpu
	this.GpuType = gpuType
	this.Class = class
	this.Capacity = capacity
	this.Region = region
	return &this
}

// NewCreateNodeWithDefaults instantiates a new CreateNode object
// This constructor will only assign default values to properties that have it defined,
// but it doesn't guarantee that properties required by API are set
func NewCreateNodeWithDefaults() *CreateNode {
	this := CreateNode{}
	return &this
}

// GetDomain returns the Domain field value
func (o *CreateNode) GetDomain() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.Domain
}

// GetDomainOk returns a tuple with the Domain field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetDomainOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Domain, true
}

// SetDomain sets field value
func (o *CreateNode) SetDomain(v string) {
	o.Domain = v
}

// GetApiUrl returns the ApiUrl field value
func (o *CreateNode) GetApiUrl() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.ApiUrl
}

// GetApiUrlOk returns a tuple with the ApiUrl field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetApiUrlOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.ApiUrl, true
}

// SetApiUrl sets field value
func (o *CreateNode) SetApiUrl(v string) {
	o.ApiUrl = v
}

// GetApiKey returns the ApiKey field value
func (o *CreateNode) GetApiKey() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.ApiKey
}

// GetApiKeyOk returns a tuple with the ApiKey field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetApiKeyOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.ApiKey, true
}

// SetApiKey sets field value
func (o *CreateNode) SetApiKey(v string) {
	o.ApiKey = v
}

// GetCpu returns the Cpu field value
func (o *CreateNode) GetCpu() float32 {
	if o == nil {
		var ret float32
		return ret
	}

	return o.Cpu
}

// GetCpuOk returns a tuple with the Cpu field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetCpuOk() (*float32, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Cpu, true
}

// SetCpu sets field value
func (o *CreateNode) SetCpu(v float32) {
	o.Cpu = v
}

// GetMemory returns the Memory field value
func (o *CreateNode) GetMemory() float32 {
	if o == nil {
		var ret float32
		return ret
	}

	return o.Memory
}

// GetMemoryOk returns a tuple with the Memory field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetMemoryOk() (*float32, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Memory, true
}

// SetMemory sets field value
func (o *CreateNode) SetMemory(v float32) {
	o.Memory = v
}

// GetDisk returns the Disk field value
func (o *CreateNode) GetDisk() float32 {
	if o == nil {
		var ret float32
		return ret
	}

	return o.Disk
}

// GetDiskOk returns a tuple with the Disk field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetDiskOk() (*float32, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Disk, true
}

// SetDisk sets field value
func (o *CreateNode) SetDisk(v float32) {
	o.Disk = v
}

// GetGpu returns the Gpu field value
func (o *CreateNode) GetGpu() float32 {
	if o == nil {
		var ret float32
		return ret
	}

	return o.Gpu
}

// GetGpuOk returns a tuple with the Gpu field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetGpuOk() (*float32, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Gpu, true
}

// SetGpu sets field value
func (o *CreateNode) SetGpu(v float32) {
	o.Gpu = v
}

// GetGpuType returns the GpuType field value
func (o *CreateNode) GetGpuType() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.GpuType
}

// GetGpuTypeOk returns a tuple with the GpuType field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetGpuTypeOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.GpuType, true
}

// SetGpuType sets field value
func (o *CreateNode) SetGpuType(v string) {
	o.GpuType = v
}

// GetClass returns the Class field value
func (o *CreateNode) GetClass() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.Class
}

// GetClassOk returns a tuple with the Class field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetClassOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Class, true
}

// SetClass sets field value
func (o *CreateNode) SetClass(v string) {
	o.Class = v
}

// GetCapacity returns the Capacity field value
func (o *CreateNode) GetCapacity() float32 {
	if o == nil {
		var ret float32
		return ret
	}

	return o.Capacity
}

// GetCapacityOk returns a tuple with the Capacity field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetCapacityOk() (*float32, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Capacity, true
}

// SetCapacity sets field value
func (o *CreateNode) SetCapacity(v float32) {
	o.Capacity = v
}

// GetRegion returns the Region field value
func (o *CreateNode) GetRegion() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.Region
}

// GetRegionOk returns a tuple with the Region field value
// and a boolean to check if the value has been set.
func (o *CreateNode) GetRegionOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Region, true
}

// SetRegion sets field value
func (o *CreateNode) SetRegion(v string) {
	o.Region = v
}

func (o CreateNode) MarshalJSON() ([]byte, error) {
	toSerialize, err := o.ToMap()
	if err != nil {
		return []byte{}, err
	}
	return json.Marshal(toSerialize)
}

func (o CreateNode) ToMap() (map[string]interface{}, error) {
	toSerialize := map[string]interface{}{}
	toSerialize["domain"] = o.Domain
	toSerialize["apiUrl"] = o.ApiUrl
	toSerialize["apiKey"] = o.ApiKey
	toSerialize["cpu"] = o.Cpu
	toSerialize["memory"] = o.Memory
	toSerialize["disk"] = o.Disk
	toSerialize["gpu"] = o.Gpu
	toSerialize["gpuType"] = o.GpuType
	toSerialize["class"] = o.Class
	toSerialize["capacity"] = o.Capacity
	toSerialize["region"] = o.Region
	return toSerialize, nil
}

func (o *CreateNode) UnmarshalJSON(data []byte) (err error) {
	// This validates that all required properties are included in the JSON object
	// by unmarshalling the object into a generic map with string keys and checking
	// that every required field exists as a key in the generic map.
	requiredProperties := []string{
		"domain",
		"apiUrl",
		"apiKey",
		"cpu",
		"memory",
		"disk",
		"gpu",
		"gpuType",
		"class",
		"capacity",
		"region",
	}

	allProperties := make(map[string]interface{})

	err = json.Unmarshal(data, &allProperties)

	if err != nil {
		return err
	}

	for _, requiredProperty := range requiredProperties {
		if _, exists := allProperties[requiredProperty]; !exists {
			return fmt.Errorf("no value given for required property %v", requiredProperty)
		}
	}

	varCreateNode := _CreateNode{}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	err = decoder.Decode(&varCreateNode)

	if err != nil {
		return err
	}

	*o = CreateNode(varCreateNode)

	return err
}

type NullableCreateNode struct {
	value *CreateNode
	isSet bool
}

func (v NullableCreateNode) Get() *CreateNode {
	return v.value
}

func (v *NullableCreateNode) Set(val *CreateNode) {
	v.value = val
	v.isSet = true
}

func (v NullableCreateNode) IsSet() bool {
	return v.isSet
}

func (v *NullableCreateNode) Unset() {
	v.value = nil
	v.isSet = false
}

func NewNullableCreateNode(val *CreateNode) *NullableCreateNode {
	return &NullableCreateNode{value: val, isSet: true}
}

func (v NullableCreateNode) MarshalJSON() ([]byte, error) {
	return json.Marshal(v.value)
}

func (v *NullableCreateNode) UnmarshalJSON(src []byte) error {
	v.isSet = true
	return json.Unmarshal(src, &v.value)
}
