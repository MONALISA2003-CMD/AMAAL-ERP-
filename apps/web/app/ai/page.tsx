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


function actionLabel(value: string): string {
  const labels: Record<string, string> = {
    create_recovery_case: 'Open recovery case',
    assign_recovery_case: 'Assign recovery work',
    create_customer: 'Add customer',
    create_sale: 'Prepare sale',
    create_inventory_allocation: 'Prepare stock transfer',
    create_inventory_correction: 'Prepare stock correction',
  };
  return labels[value] ?? 'Prepared business action';
}

function displayRisk(level: string): string {
  return level === 'CRITICAL' ? 'Requires careful review' : level === 'HIGH' ? 'Needs approval' : level === 'MEDIUM' ? 'Review suggested' : 'Information';
}

function displayPlanStatus(value: string): string {
  const labels: Record<string,string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Waiting for approval',
    APPROVED: 'Approved',
    REJECTED: 'Declined',
    EXECUTED: 'Completed',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
  };
  return labels[value] ?? 'Under review';
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
    const action = actionLabel(item.toolName);
    const reason = window.prompt(`${decision === 'APPROVED' ? 'Approval' : 'Rejection'} reason:`, decision === 'APPROVED' ? `Approved: ${action}.` : `Declined: ${action}.`);
    if (!reason?.trim()) return;
    setPlanBusy(item.planId); setError('');
    try {
      await decideAmaalAIAwaitingApprovalApi(item.approvalId,decision,reason.trim());
      const [approvalResult] = await Promise.all([listAmaalAIAwaitingApprovalsApi(),refreshPlans()]);
      setApprovals(approvalResult.items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'We could not record that decision. Please try again.'); }
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
    const reason = window.prompt('Why should this request be approved?', `Please review: ${actionLabel(plan.toolName)}.`);
    if (!reason?.trim()) return;
    setPlanBusy(plan.id); setError('');
    try {
      await submitAmaalAIActionPlanApi(plan.id, reason.trim());
      await refreshPlans();
    } catch (e) { setError(e instanceof Error ? e.message : 'We could not send this request for review. Please try again.'); }
    finally { setPlanBusy(null); }
  }

  async function executePlan(plan: AmaalAIActionPlan) {
    if (plan.toolName !== 'create_recovery_case') return;
    const confirmed = window.confirm('Carry out this approved recovery action now?');
    if (!confirmed) return;
    setPlanBusy(plan.id); setError('');
    try {
      await executeAmaalAIRecoveryPlanApi(plan.id);
      await refreshPlans();
    } catch (e) { setError(e instanceof Error ? e.message : 'The approved action could not be completed. Please try again.'); }
    finally { setPlanBusy(null); }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div className="topbar-subtitle">Amaal AI</div></div>
      <div className="topbar-actions"><span className={`live-dot ${status?.enabled ? 'connected' : 'reconnecting'}`}>{status?.enabled ? 'AI live' : 'Basic assistance'}</span><a className="ghost-button" href="/dashboard">Command center</a></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="section-label">OPERATIONS</div>
        <nav>
          <a className="nav-item" href="/dashboard">Command Center</a>
          <a className="nav-item" href="/inventory">Inventory & Devices</a>
          <a className="nav-item" href="/sales">Sales & Receipts</a>
          <a className="nav-item" href="/customers">Customers</a>
          <a className="nav-item" href="/finance">Finance</a>
          <a className="nav-item" href="/recovery">Recovery</a>
          <a className="nav-item" href="/reports">Reports</a>
          <a className="nav-item active" href="/ai">Amaal AI</a>
          <a className="nav-item" href="/organization">People & Structure</a>
        </nav>
        <div className="section-label lower">REVIEW & SAFETY</div>
        <div className="ai-side-note">Amaal AI only works with information you are allowed to use.</div>
      </aside>

      <section className="content ai-content">
        <div className="content-header">
          <div>
            <div className="eyebrow">AI OPERATIONS</div>
            <h1>Amaal AI helps you work with the information already available to you.</h1>
            <p className="muted">Ask business questions, review the information behind an answer, and prepare important work without changing company records without approval.</p>
          </div>
          <div className="ai-status-pill">{status ? `Guided assistance ` : 'Loading AI policy…'}</div>
        </div>

        {error ? <div className="alert-card">{error}</div> : null}

        <div className="ai-policy-grid">
          <section className="card ai-mode-card"><div className="card-label">ASSISTANT STATUS</div><strong>{status?.enabled ? 'READY TO HELP' : 'BASIC ASSISTANCE'}</strong><p>{status?.enabled ? `Amaal AI is ready to answer questions and help prepare work.` : 'Amaal AI is available for guided assistance. Some advanced tasks may require administrator setup.'}</p></section>
          <section className="card ai-mode-card"><div className="card-label">WHAT IT CAN DO</div><strong>EXPLAIN → RECOMMEND → PREPARE</strong><p>Important actions are prepared for review before they can change company records.</p></section>
          <section className="card ai-mode-card"><div className="card-label">WORK TO REVIEW</div><strong>{pendingCount} waiting • {draftCount} drafts</strong><p>Your latest requests stay visible for review. Important requests expire after 24 hours and are checked again before they are carried out.</p></section>
        </div>

        <section className="card ai-chat-card">
          <div className="section-head"><div><div className="card-label">Amaal AI</div><h2>Ask the operation.</h2></div><span className="muted">Answers are based on the information available in Amaal.</span></div>
          <div className="ai-suggestion-row">{suggestions.map((suggestion) => <button key={suggestion} className="chip ai-suggestion" onClick={() => void sendMessage(suggestion)}>{suggestion}</button>)}</div>
          <div className="ai-thread">
            {!turns.length ? <div className="ai-empty"><div className="ai-empty-mark">AI</div><strong>Start with a business question.</strong><p>Examples include aging exposure, sales movement, stock risk, recovery bottlenecks, commission explanations and approved company procedures.</p></div> : turns.map((turn) => <div className={`ai-bubble ${turn.role.toLowerCase()}`} key={turn.id}><div className="ai-role">{turn.role === 'USER' ? 'YOU' : 'AMAAL AI'}</div><div className="ai-bubble-content">{turn.content.split('\n').map((line, index) => <div key={`${turn.id}-${index}`}>{line || '\u00a0'}</div>)}</div>{turn.result ? <div className="ai-evidence-row"><span className="chip">{displayRisk(turn.result.route.risk)}</span><span className="chip">Amaal information</span></div> : null}</div>)}
          </div>
          <div className="ai-composer"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void sendMessage(); } }} placeholder="Ask Amaal AI about your work…" rows={3} /><button className="setup-primary" disabled={busy || !input.trim()} onClick={() => void sendMessage()}>{busy ? 'Working…' : 'Ask Amaal AI'}</button></div>
          <div className="ai-composer-note">Press Ctrl/Cmd + Enter to send. Important changes always need your approval.</div>
        </section>

        {approvals.length ? <section className="card ai-plans-card"><div className="section-head"><div><div className="card-label">APPROVAL INBOX</div><h2>REVIEW QUEUE</h2></div><span className="muted">Important actions always require human approval.</span></div><div className="ai-plan-list">{approvals.map((item) => <div className="ai-plan" key={item.approvalId}><div className="ai-plan-main"><div className="chip-row"><span className="chip">{displayRisk(item.riskLevel)}</span><span className="chip">Planned action</span></div><strong>{actionLabel(item.toolName)}</strong><p>{item.summary}</p><small>Requested {new Date(item.createdAt).toLocaleString()} • {item.reason}</small></div><div className="ai-plan-actions"><button className="setup-secondary" disabled={planBusy===item.planId} onClick={() => void decideApproval(item,'REJECTED')}>{planBusy===item.planId ? 'Working…' : 'Reject'}</button><button className="setup-primary" disabled={planBusy===item.planId} onClick={() => void decideApproval(item,'APPROVED')}>{planBusy===item.planId ? 'Working…' : 'Approve'}</button></div></div>)}</div></section> : null}

        <section className="card ai-plans-card">
          <div className="section-head"><div><div className="card-label">REQUESTS</div><h2>Prepared work</h2></div><span className="muted">Important work always stays under human control.</span></div>
          {!plans.length ? <p className="muted">No prepared requests yet. Important requests will appear here for review.</p> : <div className="ai-plan-list">{plans.map((plan) => <div className="ai-plan" key={plan.id}><div className="ai-plan-main"><div className="chip-row"><span className="chip">{displayRisk(plan.riskLevel)}</span><span className="chip">{displayPlanStatus(plan.status)}</span></div><strong>{actionLabel(plan.toolName)}</strong><p>{plan.summary}</p><small>Created {new Date(plan.createdAt).toLocaleString()} {plan.expiresAt ? `• Expires ${new Date(plan.expiresAt).toLocaleString()}` : ''}</small></div><div className="ai-plan-actions">{plan.status === 'DRAFT' ? <button className="setup-secondary" disabled={planBusy===plan.id} onClick={() => void submitPlan(plan)}>{planBusy===plan.id ? 'Submitting…' : 'Submit for approval'}</button> : null}{plan.status === 'PENDING_APPROVAL' ? <span className="ai-pending-label">Awaiting approval</span> : null}{plan.status === 'APPROVED' && plan.toolName === 'create_recovery_case' ? <button className="setup-primary" disabled={planBusy===plan.id} onClick={() => void executePlan(plan)}>{planBusy===plan.id ? 'Executing…' : 'Execute approved recovery'}</button> : null}</div></div>)}</div>}
        </section>

        <section className="grid two">
          <section className="card"><div className="card-label">SAFETY</div><h2>Built-in safeguards</h2><p className="muted">Amaal AI only uses information and actions available to your account. Important changes are checked again before they are carried out.</p></section>
          <section className="card"><div className="card-label">ANSWER QUALITY</div><h2>Facts and suggestions</h2><p className="muted">Business facts are kept separate from suggestions so you can see what is known and what is recommended.</p></section>
        </section>
      </section>
    </div>
  </main>;
}
