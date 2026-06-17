const owner = 'badtothebone430'
const repo = 'simco-indices'
const workflow = 'collect-market.yml'

exports.handler = async function handler(event) {
  const token = process.env.GITHUB_WORKFLOW_TOKEN
  const manualSecret = process.env.CRON_SECRET
  const providedSecret = event.headers['x-cron-secret'] || event.queryStringParameters?.secret
  const isManualRequest = event.httpMethod !== 'POST' || providedSecret

  if (!token) {
    return jsonResponse(500, { ok: false, error: 'Missing GITHUB_WORKFLOW_TOKEN' })
  }

  if (isManualRequest && manualSecret && providedSecret !== manualSecret) {
    return jsonResponse(401, { ok: false, error: 'Unauthorized' })
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'simco-indices-netlify-scheduler',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    return jsonResponse(response.status, {
      ok: false,
      error: `GitHub workflow dispatch failed with ${response.status}`,
      body,
    })
  }

  return jsonResponse(200, { ok: true, workflow })
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}
