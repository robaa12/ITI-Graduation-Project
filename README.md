# iti-grad

## Setup

```bash
npm install
cp .env.example .env
```

Fill in the SMTP settings with a real provider before testing email delivery.
The example's local values are sufficient for application startup, but its SMTP
endpoint does not deliver mail. Replace `BETTER_AUTH_SECRET` with a unique,
high-entropy secret in every non-local environment.

## Development

```bash
docker-compose up -d db redis
npm run start:dev
```

Redis backs the content-generation queue and is required to boot: set
`REDIS_HOST` (and `REDIS_PORT`, default `6379`, plus `REDIS_PASSWORD` if your
instance needs one) in your env file. `POST /campaigns/:id/contents/generate`
and `POST /contents/:id/regenerate` only enqueue — they answer `202` with a
`PENDING` row, and the worker flips it to `READY` or `FAILED`.
