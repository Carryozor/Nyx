process.env.DB_PATH        = ':memory:'
process.env.JWT_SECRET     = 'a'.repeat(32)
process.env.WORKER_SECRET  = 'b'.repeat(32)
process.env.NODE_ENV       = 'test'
process.env.WEBHOOK_SECRET = 'test-webhook-secret-1234567890ab'
