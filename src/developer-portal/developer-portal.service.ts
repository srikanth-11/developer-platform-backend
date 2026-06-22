import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * DeveloperPortalService — holds the generated OpenAPI document (set from
 * main.ts after Swagger builds it) and derives developer-portal artifacts from
 * it: a Postman collection and SDK guidance.
 *
 * The OpenAPI spec is the single source of truth; everything a developer portal
 * offers (docs, playground, Postman, SDKs) is generated FROM it.
 */
@Injectable()
export class DeveloperPortalService {
  private spec: OpenAPIObject | null = null;

  setSpec(spec: OpenAPIObject): void {
    this.spec = spec;
  }

  getOpenApi(): OpenAPIObject {
    if (!this.spec) {
      // Should never happen once bootstrap has run.
      return { openapi: '3.0.0', info: { title: 'API', version: '0' }, paths: {} };
    }
    return this.spec;
  }

  /**
   * Convert the OpenAPI spec into a Postman Collection v2.1.0. A developer can
   * import this straight into Postman and start calling the API.
   */
  toPostmanCollection() {
    const spec = this.getOpenApi();
    const items: unknown[] = [];

    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      for (const [method, op] of Object.entries(
        methods as Record<string, { summary?: string; operationId?: string }>,
      )) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          continue;
        }
        // Postman path segments; {param} stays as :param for Postman variables.
        const segments = path.split('/').filter(Boolean);
        items.push({
          name: op.summary ?? op.operationId ?? `${method.toUpperCase()} ${path}`,
          request: {
            method: method.toUpperCase(),
            header: [
              { key: 'Content-Type', value: 'application/json' },
              {
                key: 'Authorization',
                value: 'Bearer {{accessToken}}',
                description: 'JWT for dashboard routes',
              },
              {
                key: 'x-api-key',
                value: '{{apiKey}}',
                description: 'API key for /gateway routes',
              },
            ],
            url: {
              raw: `{{baseUrl}}/${segments.join('/')}`,
              host: ['{{baseUrl}}'],
              path: segments,
            },
          },
        });
      }
    }

    return {
      info: {
        name: spec.info?.title ?? 'Developer Platform API',
        description: spec.info?.description ?? '',
        schema:
          'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      variable: [
        { key: 'baseUrl', value: 'http://localhost:3333/api' },
        { key: 'accessToken', value: '' },
        { key: 'apiKey', value: '' },
      ],
      item: items,
    };
  }

  /** Info about generating client SDKs from the OpenAPI spec. */
  sdkInfo() {
    return {
      message:
        'SDKs are generated from the OpenAPI spec. Point any OpenAPI generator at the spec URL.',
      openApiUrl: '/docs-json',
      examples: [
        {
          language: 'typescript-axios',
          command:
            'npx @openapitools/openapi-generator-cli generate -i http://localhost:3333/docs-json -g typescript-axios -o ./sdk-ts',
        },
        {
          language: 'python',
          command:
            'npx @openapitools/openapi-generator-cli generate -i http://localhost:3333/docs-json -g python -o ./sdk-py',
        },
        {
          language: 'go',
          command:
            'npx @openapitools/openapi-generator-cli generate -i http://localhost:3333/docs-json -g go -o ./sdk-go',
        },
      ],
    };
  }
}
