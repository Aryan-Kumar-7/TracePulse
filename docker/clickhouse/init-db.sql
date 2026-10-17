-- ClickHouse Initialization Schema for TracePulse
CREATE DATABASE IF NOT EXISTS default;

CREATE TABLE IF NOT EXISTS default.spans (
    trace_id UUID,
    span_id String,
    parent_span_id String,
    service_name LowCardinality(String),
    name LowCardinality(String),
    kind LowCardinality(String),
    start_time DateTime64(6, 'UTC'),
    end_time DateTime64(6, 'UTC'),
    duration_ms Float64,
    status_code LowCardinality(String), -- 'OK', 'ERROR', 'UNSET'
    status_message String,
    attributes Map(String, String),
    events_nested Nested(
        time DateTime64(6, 'UTC'),
        name String,
        attributes Map(String, String)
    )
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, status_code, start_time, trace_id);
