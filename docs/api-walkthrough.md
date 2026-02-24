# Captured API walkthrough

Every block below is output from a real run, captured on 2026-11-08 against
the Docker Compose stack in this repository (MySQL 8.4, Node.js 22, schema
applied by the `migrate` service), with the app published on port 38300
(`APP_HOST_PORT=38300 BASE_URL=http://localhost:38300 docker compose up --build`).
Configuration is otherwise the default.

## 1. Health probes

```console
$ curl -s http://localhost:38300/healthz
{"status":"ok"}
$ curl -s http://localhost:38300/readyz
{"status":"ready","storage":"mysql"}
```

## 2. Create a short URL

```console
$ curl -s -i -X POST http://localhost:38300/shorten -H 'Content-Type: application/json' -d '{"url":"https://dev.mysql.com/doc/refman/8.4/en/innodb-locking.html"}'
HTTP/1.1 201 Created
RateLimit-Limit: 10
RateLimit-Remaining: 9
RateLimit-Reset: 1794129674
Content-Type: application/json; charset=utf-8
Content-Length: 140
ETag: W/"8c-1OyRpsCjaBNALVlfJAnfC7mt3X4"
Date: Sun, 08 Nov 2026 09:20:13 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"shortUrl":"http://localhost:38300/M6KFG6Rv","code":"M6KFG6Rv","originalUrl":"https://dev.mysql.com/doc/refman/8.4/en/innodb-locking.html"}
```

A second `POST` stored `https://nodejs.org/api/test.html` under the code used
below (IBjETPcl).

## 3. Follow the short URL

```console
$ curl -s -o /dev/null -D - http://localhost:38300/IBjETPcl
HTTP/1.1 302 Found
RateLimit-Limit: 600
RateLimit-Remaining: 599
RateLimit-Reset: 1794129674
Cache-Control: private, no-store
Location: https://nodejs.org/api/test.html
Vary: Accept
Content-Type: text/plain; charset=utf-8
Content-Length: 54
Date: Sun, 08 Nov 2026 09:20:13 GMT
Connection: keep-alive
Keep-Alive: timeout=5
```

The same code was then requested twice more, so it has three clicks in
section 5.

## 4. Errors

```console
$ curl -s http://localhost:38300/zzzzzzzz
{"error":{"code":"NOT_FOUND","message":"Short URL not found.","details":null}}
$ curl -s -X POST http://localhost:38300/shorten -H 'Content-Type: application/json' -d '{"url":"javascript:alert(1)"}'
{"error":{"code":"VALIDATION_ERROR","message":"Only http and https URLs are supported.","details":{"allowedProtocols":["http:","https:"]}}}
$ curl -s -X POST http://localhost:38300/shorten -H 'Content-Type: application/json' -d '{}'
{"error":{"code":"VALIDATION_ERROR","message":"The `url` field is required and must be a string.","details":null}}
$ curl -s -X POST http://localhost:38300/shorten -H 'Content-Type: application/json' -d '{not json'
{"error":{"code":"BAD_REQUEST","message":"Malformed request body.","details":null}}
```

## 5. What landed in MySQL

Clicks reach the database on the click recorder's next flush (at most
`CLICK_FLUSH_MS`, 1 s by default) rather than during the redirect.

```console
$ docker compose exec -T mysql mysql -u root url_shortener \
    -e "SELECT short_code, original_url, click_count FROM urls ORDER BY id LIMIT 3;
        SELECT url_id, ip_address, user_agent FROM url_clicks ORDER BY id;"
short_code	original_url	click_count
M6KFG6Rv	https://dev.mysql.com/doc/refman/8.4/en/innodb-locking.html	0
IBjETPcl	https://nodejs.org/api/test.html	3
Kpmadvs3	https://example.com/burst/1	0
url_id	ip_address	user_agent
2	::ffff:172.22.0.1	curl/8.7.1
2	::ffff:172.22.0.1	curl/8.7.1
2	::ffff:172.22.0.1	curl/8.7.1
```

The client address is IPv4-mapped IPv6 (`::ffff:...`) because Node listens on a
dual-stack socket and the request came through Docker's port proxy. With
`CLICK_IP_MODE=anonymized` this would be stored as `::ffff:172.22.0.0`.

## 6. Rate limiting on the write endpoint (`RATE_LIMIT_MAX_REQUESTS=10`)

```console
$ for i in $(seq 1 10); do curl -s -o /dev/null -w "POST /shorten #$i -> %{http_code}\n" \
    -X POST http://localhost:38300/shorten -H 'Content-Type: application/json' \
    -d "{\"url\":\"https://example.com/burst/$i\"}"; done
POST /shorten #1 -> 201
POST /shorten #2 -> 201
POST /shorten #3 -> 201
POST /shorten #4 -> 201
POST /shorten #5 -> 201
POST /shorten #6 -> 201
POST /shorten #7 -> 429
POST /shorten #8 -> 429
POST /shorten #9 -> 429
POST /shorten #10 -> 429
$ curl -s -i -X POST http://localhost:38300/shorten -H 'Content-Type: application/json' -d '{"url":"https://example.com/one-more"}'
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 10
RateLimit-Remaining: 0
RateLimit-Reset: 1794129674
Retry-After: 58
Content-Type: application/json; charset=utf-8
Content-Length: 136
ETag: W/"88-koJHSmotEjzwUmM66joylLI+q4s"
Date: Sun, 08 Nov 2026 09:20:16 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Rate limit exceeded.","details":{"retryAfterSeconds":58,"limit":10,"windowMs":60000}}}
```

Six requests succeed rather than ten because four of the window's ten writes
were spent in sections 2 and 4. The malformed-JSON request in section 4 is
rejected by the body parser before it reaches the limiter, so it does not
count.
