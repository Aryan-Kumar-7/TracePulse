#!/usr/bin/env bash
set -e

ENDPOINT="http://localhost:4000/v1/traces"

echo "📡 Sending OpenTelemetry OTLP/HTTP JSON trace to $ENDPOINT..."

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}s" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [
      {
        "resource": {
          "attributes": [
            { "key": "service.name", "value": { "stringValue": "checkout-service" } },
            { "key": "deployment.environment", "value": { "stringValue": "production" } }
          ]
        },
        "scopeSpans": [
          {
            "scope": {
              "name": "@opentelemetry/instrumentation-http",
              "version": "0.45.0"
            },
            "spans": [
              {
                "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
                "spanId": "00f067aa0ba902b7",
                "name": "POST /api/checkout",
                "kind": 2,
                "startTimeUnixNano": "1710000000000000000",
                "endTimeUnixNano": "1710000000250000000",
                "attributes": [
                  { "key": "http.method", "value": { "stringValue": "POST" } },
                  { "key": "http.route", "value": { "stringValue": "/api/checkout" } },
                  { "key": "http.status_code", "value": { "intValue": 200 } }
                ],
                "status": {
                  "code": 1
                }
              },
              {
                "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
                "spanId": "5fb397be34d23b0f",
                "parentSpanId": "00f067aa0ba902b7",
                "name": "SELECT FROM accounts WHERE id = ?",
                "kind": 3,
                "startTimeUnixNano": "1710000000020000000",
                "endTimeUnixNano": "1710000000095000000",
                "attributes": [
                  { "key": "db.system", "value": { "stringValue": "postgresql" } },
                  { "key": "db.statement", "value": { "stringValue": "SELECT balance FROM accounts WHERE user_id = $1" } }
                ],
                "status": {
                  "code": 1
                }
              }
            ]
          }
        ]
      }
    ]
  }')

echo "Response:"
echo "$RESPONSE"
