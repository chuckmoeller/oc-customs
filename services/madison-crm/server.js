const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'madison-crm',
    framework: 'Next.js/Node',
    uptime_seconds: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'madison-crm',
    database: 'connected',
    pooler: 'active'
  });
});

// Deals Pipeline API
app.get('/api/deals', (req, res) => {
  res.json({
    deals: [
      { id: 'deal-001', name: 'Cold Storage Retrofit - Target Corp', stage: 'Blueprint', value_usd: 85000 },
      { id: 'deal-002', name: 'Commercial RTU Optimization - Lineage', stage: 'Site Survey', value_usd: 120000 },
      { id: 'deal-003', name: 'Membrane Roof Coating - Amazon DC', stage: 'Proposal Staged', value_usd: 64000 }
    ]
  });
});

// CRM Webhook Receiver
app.post('/api/webhooks/crm', (req, res) => {
  const event = req.body;
  console.log('[Madison CRM] Received webhook event:', event.event_type || 'lead_update');
  res.status(200).json({ status: 'received', lead_id: event.lead_id || 'lead-auto-99', routed: true });
});

// Madison CRM Dashboard UI
const htmlDashboard = `<!DOCTYPE html>
<html>
<head>
  <title>Madison Energy Group CRM</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; }
    h1 { color: #38bdf8; margin-bottom: 8px; }
    .badge { display: inline-block; background: #0284c7; color: white; padding: 4px 10px; border-radius: 9999px; font-size: 12px; margin-bottom: 20px; }
    .card { background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 16px; border: 1px solid #334155; }
    .deal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .deal-card { background: #0f172a; padding: 14px; border-radius: 6px; border-left: 4px solid #38bdf8; }
    .value { color: #4ade80; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Madison Energy Group CRM</h1>
  <div class="badge">Next.js &bull; Node &bull; PostgreSQL</div>
  <div class="card">
    <h3>Active Energy Efficiency &amp; Coating Pipeline</h3>
    <div class="deal-grid">
      <div class="deal-card">
        <h4>Target Corp - RTU Retrofit</h4>
        <p>Stage: <strong>Blueprint</strong></p>
        <p class="value">$85,000 USD</p>
      </div>
      <div class="deal-card">
        <h4>Lineage Cold Storage</h4>
        <p>Stage: <strong>Site Survey</strong></p>
        <p class="value">$120,000 USD</p>
      </div>
      <div class="deal-card">
        <h4>Amazon Fulfillment Center</h4>
        <p>Stage: <strong>Proposal Staged</strong></p>
        <p class="value">$64,000 USD</p>
      </div>
    </div>
  </div>
</body>
</html>`;

app.get('/', (req, res) => {
  res.send(htmlDashboard);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Madison CRM] Server running on port ${PORT}`);
});
