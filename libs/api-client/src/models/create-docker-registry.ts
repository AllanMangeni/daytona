/* tslint:disable */

/**
 * Daytona
 * Daytona AI platform API Docs
 *
 * The version of the OpenAPI document: 1.0
 * Contact: support@daytona.com
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

/**
 *
 * @export
 * @interface CreateDockerRegistry
 */
export interface CreateDockerRegistry {
  /**
   * Registry name
   * @type {string}
   * @memberof CreateDockerRegistry
   */
  name: string
  /**
   * Registry URL
   * @type {string}
   * @memberof CreateDockerRegistry
   */
  url: string
  /**
   * Registry username
   * @type {string}
   * @memberof CreateDockerRegistry
   */
  username: string
  /**
   * Registry password
   * @type {string}
   * @memberof CreateDockerRegistry
   */
  password: string
  /**
   * Registry project
   * @type {string}
   * @memberof CreateDockerRegistry
   */
  project?: string
  /**
   * Registry type
   * @type {string}
   * @memberof CreateDockerRegistry
   */
  registryType: CreateDockerRegistryRegistryTypeEnum
  /**
   * Set as default registry
   * @type {boolean}
   * @memberof CreateDockerRegistry
   */
  isDefault?: boolean
}

export const CreateDockerRegistryRegistryTypeEnum = {
  INTERNAL: 'internal',
  ORGANIZATION: 'organization',
  PUBLIC: 'public',
  TRANSIENT: 'transient',
} as const

export type CreateDockerRegistryRegistryTypeEnum =
  (typeof CreateDockerRegistryRegistryTypeEnum)[keyof typeof CreateDockerRegistryRegistryTypeEnum]
