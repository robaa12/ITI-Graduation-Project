import http from 'node:http'
import { WorkflowEngine } from './engine.mjs'

const port = Number(process.env.PORT ?? 4111)
const engine = new WorkflowEngine()

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

function route(url) {
  return url.pathname.match(/^\/api\/workflows\/(marketingStrategyWorkflow|contentCreationWorkflow)\/(create-run|start|resume|runs\/[^/]+)$/)
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, { status: 'ok', workflows: ['marketingStrategyWorkflow', 'contentCreationWorkflow'] })
  }

  const match = route(url)
  if (!match) return send(response, 404, { message: 'Not found' })
  if (!['GET', 'POST'].includes(request.method ?? '')) return send(response, 405, { message: 'Method not allowed' })

  const [, workflowId, action] = match
  const runId = action.startsWith('runs/') ? decodeURIComponent(action.slice(5)) : url.searchParams.get('runId')
  try {
    if (request.method === 'POST' && action === 'create-run') {
      const run = engine.createRun(workflowId, runId)
      return send(response, 201, run)
    }
    if (request.method === 'POST' && action === 'start') {
      const body = await readJson(request)
      const run = engine.startRun(workflowId, runId, body.inputData)
      return send(response, 200, run)
    }
    if (request.method === 'POST' && action === 'resume') {
      const run = engine.getRun(workflowId, runId)
      return send(response, 200, run)
    }
    if (request.method === 'GET' && action.startsWith('runs/')) {
      return send(response, 200, engine.getRun(workflowId, runId))
    }
    return send(response, 405, { message: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = /not found|Unknown workflow/i.test(message) ? 404 : /already exists|required/i.test(message) ? 400 : 500
    return send(response, status, { message })
  }
})

server.listen(port, () => {
  console.log(`AetherFlow workflow engine listening on http://localhost:${port}`)
})
