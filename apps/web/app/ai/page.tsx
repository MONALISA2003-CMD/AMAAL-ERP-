'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth';
import {
  chatAmaalAIApi,
  decideAmaalAIAwaitingApprovalApi,
  executeAmaalAIRecoveryPlanApi,
  getAmaalAIStatusApi,
  listAmaalAIActionPlansApi,
  listAmaalAIAwaitingApprovalsApi,
  submitAmaalAIActionPlanApi,
  type AmaalAIActionPlan,
  type AmaalAIAwaitingApproval,
  type AmaalAIChatResult,
  type AmaalAIStatus,
} from '../../lib/api';
import { BrandLogo } from '../../components/brand-logo';

type ChatTurn = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  result?: AmaalAIChatResult;
};

const suggestions = [
  'Which agents have the highest aging exposure today?',
  'Why did sales change this month?',
  'Show my current stock risk.',
  'Explain the current recovery bottlenecks.',
  'What operational signals need attention right now?',
];

function riskText(level: string): string {
  return level === 'LOW' ? 'Read' : level === 'MEDIUM' ? 'Analysis' : level === 'HIGH' ? 'Prepared action' : 'Critical';
}

export default function AmaalAIPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AmaalAIStatus | null>(null);
  const [plans, setPlans] = useState<AmaalAIActionPlan[]>([]);
  const [approvals, setApprovals] = useState<AmaalAIAwaitingApproval[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await authClient.getSession();
      if (!session?.data) { router.replace('/login'); return; }
      try {
        const [aiStatus, planResult] = await Promise.all([getAmaalAIStatusApi(), listAmaalAIActionPlansApi()]);
        if (!active) return;
        setStatus(aiStatus);
        setPlans(planResult.items ?? []);
        try { const approvalResult = await listAmaalAIAwaitingApprovalsApi(); if (active) setApprovals(approvalResult.items ?? []); } catch { /* non-approvers do not receive an approval inbox */ }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load Amaal AI.');
      }
    })();
    const polling = window.setInterval(() => {
      void refreshPlans();
      void listAmaalAIAwaitingApprovalsApi().then((result) => { if (active) setApprovals(result.items ?? []); }).catch(() => undefined);
    }, 15000);
    return () => { active = false; window.clearInterval(polling); };
  }, [router]);

  const draftCount = useMemo(() => plans.filter((p) => p.status === 'DRAFT').length, [plans]);
  const pendingCount = useMemo(() => plans.filter((p) => p.status === 'PENDING_APPROVAL').length, [plans]);

  async function refreshPlans() {
    const result = await listAmaalAIActionPlansApi();
    setPlans(result.items ?? []);
  }

  async function decideApproval(item: AmaalAIAwaitingApproval, decision: 'APPROVED'|'REJECTED') {
    const reason = window.prompt(`${decision === 'APPROVED' ? 'Approval' : 'Rejection'} reason:`, decision === 'APPROVED' ? `Approved ${item.toolName.replaceAll('_',' ')} after human review.` : `Rejected ${item.toolName.replaceAll('_',' ')} after human review.`);
    if (!reason?.trim()) return;
    setPlanBusy(item.planId); setError('');
    try {
      await decideAmaalAIAwaitingApprovalApi(item.approvalId,decision,reason.trim());
      const [approvalResult] = await Promise.all([listAmaalAIAwaitingApprovalsApi(),refreshPlans()]);
      setApprovals(approvalResult.items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to decide the AI approval request.'); }
    finally { setPlanBusy(null); }
  }

  async function sendMessage(raw?: string) {
    const message = (raw ?? input).trim();
    if (!message || busy) return;
    setBusy(true); setError(''); setInput('');
    const userTurn: ChatTurn = { id: `${Date.now()}-u`, role: 'USER', content: message };
    setTurns((current) => [...current, userTurn]);
    try {
      const result = await chatAmaalAIApi({ message, ...(conversationId ? { conversationId } : {}) });
      setConversationId(result.conversationId);
      setTurns((current) => [...current, { id: `${Date.now()}-a`, role: 'ASSISTANT', content: result.message, result }]);
      await refreshPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Amaal AI could not complete the request.');
    } finally { setBusy(false); }
  }

  async function submitPlan(plan: AmaalAIActionPlan) {
    const reason = window.prompt('Reason for submitting this Amaal AI action for human approval:', `Review ${plan.toolName.replaceAll('_', ' ')} prepared by Amaal AI.`);
    if (!reason?.trim()) return;
    setPlanBusy(plan.id); setError('');
    try {
      await submitAmaalAIActionPlanApi(plan.id, reason.trim());
      await refreshPlans();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit the AI action plan.'); }
    finally { setPlanBusy(null); }
  }

  async function executePlan(plan: AmaalAIActionPlan) {
    if (plan.toolName !== 'create_recovery_case') return;
    const confirmed = window.confirm('Execute this approved recovery plan through the normal Amaal recovery service?');
    if (!confirmed) return;
    setPlanBusy(plan.id); setError('');
    try {
      await executeAmaalAIRecoveryPlanApi(plan.id);
      await refreshPlans();
    } catch (e) { setError(e instanceof Error ? e.message : 'Approved AI action could not be executed.'); }
    finally { setPlanBusy(null); }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div className="topbar-subtitle">Amaal AI • Governed Operations</div></div>
      <div className="topbar-actions"><span className={`live-dot ${status?.enabled ? 'connected' : 'reconnecting'}`}>{status?.enabled ? 'AI live' : 'Foundation mode'}</span><a className="ghost-button" href="/dashboard">Command center</a></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="section-label">OPERATIONS</div>
        <nav>
          <a className="nav-item" href="/dashboard">Command Center</a>
          <a className="nav-item" href="/inventory">Inventory & IMEI</a>
          <a className="nav-item" href="/sales">Sales & Receipts</a>
          <a className="nav-item" href="/customers">Customers</a>
          <a className="nav-item" href="/finance">Finance</a>
          <a className="nav-item" href="/recovery">Recovery</a>
          <a className="nav-item" href="/reports">Reports</a>
          <a className="nav-item active" href="/ai">Amaal AI</a>
          <a className="nav-item" href="/organization">People & Structure</a>
        </nav>
        <div className="section-label lower">GOVERNANCE</div>
        <div className="ai-side-note">The model never receives unrestricted SQL or authority beyond the signed-in Amaal user.</div>
      </aside>

      <section className="content ai-content">
        <div className="content-header">
          <div>
            <div className="eyebrow">STAGE 8 • AI OPERATIONS</div>
            <h1>Amaal AI works inside the ERP boundary.</h1>
            <p className="muted">Ask operational questions, inspect governed evidence, and prepare high-impact work without bypassing Amaal authorization.</p>
          </div>
          <div className="ai-status-pill">{status ? `${status.governedTools} governed tools • ${status.maxToolRounds} max rounds • Gov ${status.governanceVersion} • Tools ${status.toolPolicyVersion}` : 'Loading AI policy…'}</div>
        </div>

        {error ? <div className="alert-card">{error}</div> : null}

        <div className="ai-policy-grid">
          <section className="card ai-mode-card"><div className="card-label">CURRENT MODE</div><strong>{status?.enabled ? 'LIVE GOVERNED AI' : 'FOUNDATION MODE'}</strong><p>{status?.enabled ? `Provider: ${status.provider}. Model: ${status.model ?? 'configured by environment'}.` : 'The page and governance layer are installed, but model execution is intentionally disabled until the provider environment is configured and enabled.'}</p></section>
          <section className="card ai-mode-card"><div className="card-label">AUTONOMY BOUNDARY</div><strong>READ → RECOMMEND → PREPARE</strong><p>High-risk requests become action plans. Supported mutations require the normal Amaal service and human approval.</p></section>
          <section className="card ai-mode-card"><div className="card-label">WORK QUEUE</div><strong>{pendingCount} pending • {draftCount} drafts</strong><p>Your latest AI action plans remain visible and auditable. High-risk plans expire after 24 hours and are rechecked before submission, approval and execution.</p></section>
        </div>

        <section className="card ai-chat-card">
          <div className="section-head"><div><div className="card-label">Amaal AI</div><h2>Ask the operation.</h2></div><span className="muted">Facts come from governed tools.</span></div>
          <div className="ai-suggestion-row">{suggestions.map((suggestion) => <button key={suggestion} className="chip ai-suggestion" onClick={() => void sendMessage(suggestion)}>{suggestion}</button>)}</div>
          <div className="ai-thread">
            {!turns.length ? <div className="ai-empty"><div className="ai-empty-mark">AI</div><strong>Start with a real operational question.</strong><p>Examples include aging exposure, sales movement, stock risk, recovery bottlenecks, commission explanations and approved company procedures.</p></div> : turns.map((turn) => <div className={`ai-bubble ${turn.role.toLowerCase()}`} key={turn.id}><div className="ai-role">{turn.role === 'USER' ? 'YOU' : 'AMAAL AI'}</div><div className="ai-bubble-content">{turn.content.split('\n').map((line, index) => <div key={`${turn.id}-${index}`}>{line || '\u00a0'}</div>)}</div>{turn.result ? <div className="ai-evidence-row"><span className="chip">{turn.result.route.agent}</span><span className="chip">{riskText(turn.result.route.risk)}</span>{turn.result.evidence.map((item) => <span className="chip" key={`${turn.id}-${item.tool}`}>{item.tool} • {item.classification ?? 'governed'}</span>)}</div> : null}</div>)}
          </div>
          <div className="ai-composer"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void sendMessage(); } }} placeholder="Ask Amaal AI about your authorized operation…" rows={3} /><button className="setup-primary" disabled={busy || !input.trim()} onClick={() => void sendMessage()}>{busy ? 'Working…' : 'Ask Amaal AI'}</button></div>
          <div className="ai-composer-note">Ctrl/Cmd + Enter to send. Amaal AI cannot approve, bypass permissions, or directly issue SQL.</div>
        </section>

        {approvals.length ? <section className="card ai-plans-card"><div className="section-head"><div><div className="card-label">APPROVAL INBOX</div><h2>Human governance queue</h2></div><span className="muted">AI cannot approve its own work.</span></div><div className="ai-plan-list">{approvals.map((item) => <div className="ai-plan" key={item.approvalId}><div className="ai-plan-main"><div className="chip-row"><span className="chip">{item.riskLevel}</span><span className="chip">AI_ACTION</span></div><strong>{item.toolName.replaceAll('_',' ')}</strong><p>{item.summary}</p><small>Requested by {item.requestedBy.slice(0,8)} • {new Date(item.createdAt).toLocaleString()} • {item.reason}</small></div><div className="ai-plan-actions"><button className="setup-secondary" disabled={planBusy===item.planId} onClick={() => void decideApproval(item,'REJECTED')}>{planBusy===item.planId ? 'Working…' : 'Reject'}</button><button className="setup-primary" disabled={planBusy===item.planId} onClick={() => void decideApproval(item,'APPROVED')}>{planBusy===item.planId ? 'Working…' : 'Approve'}</button></div></div>)}</div></section> : null}

        <section className="card ai-plans-card">
          <div className="section-head"><div><div className="card-label">ACTION PLANS</div><h2>Governed operational work</h2></div><span className="muted">Human approval remains outside the model.</span></div>
          {!plans.length ? <p className="muted">No AI action plans yet. High-risk requests will appear here as drafts.</p> : <div className="ai-plan-list">{plans.map((plan) => <div className="ai-plan" key={plan.id}><div className="ai-plan-main"><div className="chip-row"><span className="chip">{plan.riskLevel}</span><span className="chip">Autonomy {plan.autonomyLevel}</span><span className="chip">{plan.status}</span></div><strong>{plan.toolName.replaceAll('_',' ')}</strong><p>{plan.summary}</p><small>Created {new Date(plan.createdAt).toLocaleString()} {plan.expiresAt ? `• Expires ${new Date(plan.expiresAt).toLocaleString()}` : ''} {plan.approvalId ? `• Approval ${plan.approvalId.slice(0,8)}` : ''} {plan.executedTargetId ? `• Target ${plan.executedTargetId.slice(0,8)}` : ''}</small></div><div className="ai-plan-actions">{plan.status === 'DRAFT' ? <button className="setup-secondary" disabled={planBusy===plan.id} onClick={() => void submitPlan(plan)}>{planBusy===plan.id ? 'Submitting…' : 'Submit for approval'}</button> : null}{plan.status === 'PENDING_APPROVAL' ? <span className="ai-pending-label">Awaiting approval</span> : null}{plan.status === 'APPROVED' && plan.toolName === 'create_recovery_case' ? <button className="setup-primary" disabled={planBusy===plan.id} onClick={() => void executePlan(plan)}>{planBusy===plan.id ? 'Executing…' : 'Execute approved recovery'}</button> : null}</div></div>)}</div>}
        </section>

        <section className="grid two">
          <section className="card"><div className="card-label">SECURITY CONTRACT</div><h2>Complete mediation</h2><p className="muted">The model sees only tools selected for the current request and authorized user. Each call is checked again at the Amaal tool boundary.</p></section>
          <section className="card"><div className="card-label">EVIDENCE CONTRACT</div><h2>Fact vs inference</h2><p className="muted">Operational facts are labeled from ERP tool results. Recommendations and unknowns are kept distinct, reducing the risk of confident but unsupported claims.</p></section>
        </section>
      </section>
    </div>
  </main>;
}
