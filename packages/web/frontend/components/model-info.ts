import type { ExportModel } from '../types/api';

export function renderModelInfo(exportModel: ExportModel): string {
    const { airfieldName, inductions, autoSchedule, derived } = exportModel;
    
    const manualCount = inductions.filter(i => i.kind === 'manual').length;
    const autoCount = inductions.filter(i => i.kind === 'auto').length;
    const conflictCount = inductions.filter(i => i.conflicts.length > 0).length;
    
    return `
        <div class="model-info-container">
            <div class="model-header">
                <h2>${airfieldName}</h2>
                <div class="model-stats">
                    <div class="stat">
                        <span class="label">Total Inductions:</span>
                        <span class="value">${inductions.length}</span>
                    </div>
                    <div class="stat">
                        <span class="label">Manual:</span>
                        <span class="value">${manualCount}</span>
                    </div>
                    ${autoCount > 0 ? `
                        <div class="stat">
                            <span class="label">Auto-scheduled:</span>
                            <span class="value">${autoCount}</span>
                        </div>
                    ` : ''}
                    ${conflictCount > 0 ? `
                        <div class="stat warning">
                            <span class="label">With Conflicts:</span>
                            <span class="value">${conflictCount}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="adjacency-info">
                <h3>Adjacency Configuration</h3>
                ${Object.entries(derived.adjacencyModeByHangar).map(([hangar, mode]) => `
                    <div class="adjacency-item">
                        <span class="hangar-name">${hangar}:</span>
                        <span class="mode ${mode}">${mode}</span>
                    </div>
                `).join('')}
            </div>
            
            ${autoSchedule && autoSchedule.unscheduled.length > 0 ? `
                <div class="unscheduled-section">
                    <h3>Unscheduled Auto-Inductions (${autoSchedule.unscheduled.length})</h3>
                    ${autoSchedule.unscheduled.map(u => `
                        <div class="unscheduled-item">
                            <div class="unscheduled-header">
                                <strong>${u.id}</strong> (${u.aircraft})
                                ${u.preferredHangar ? `<span class="preferred-hangar">Preferred: ${u.preferredHangar}</span>` : ''}
                            </div>
                            <div class="unscheduled-reason">
                                <code>${u.reasonRuleId}</code>
                            </div>
                            <details class="unscheduled-evidence">
                                <summary>Rejection Details</summary>
                                <pre>${JSON.stringify(u.evidence, null, 2)}</pre>
                            </details>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="inductions-list">
                <h3>All Inductions</h3>
                ${inductions.map(ind => renderInductionCard(ind)).join('')}
            </div>
        </div>
    `;
}

function renderInductionCard(induction: ReturnType<typeof import('../types/api')>['ExportedInduction']): string {
    const hasConflicts = induction.conflicts.length > 0;
    
    return `
        <div class="induction-card ${induction.kind} ${hasConflicts ? 'has-conflicts' : ''}">
            <div class="induction-header">
                <span class="induction-id">${induction.id}</span>
                <span class="kind-badge">${induction.kind}</span>
            </div>
            
            <div class="induction-body">
                <div class="induction-info">
                    <div><strong>Aircraft:</strong> ${induction.aircraft}</div>
                    <div><strong>Hangar:</strong> ${induction.hangar}</div>
                    ${induction.door ? `<div><strong>Door:</strong> ${induction.door}</div>` : ''}
                    <div><strong>Bays:</strong> ${induction.bays.join(', ')}</div>
                    <div><strong>Time:</strong> ${new Date(induction.start).toLocaleString()} → ${new Date(induction.end).toLocaleString()}</div>
                </div>
                
                <div class="derived-properties">
                    <h4>Derived Properties</h4>
                    <div class="derived-grid">
                        <div><strong>Wingspan (eff):</strong> ${induction.derived.wingspanEff.toFixed(2)}m</div>
                        <div><strong>Length (eff):</strong> ${induction.derived.lengthEff.toFixed(2)}m</div>
                        <div><strong>Tail Height (eff):</strong> ${induction.derived.tailEff.toFixed(2)}m</div>
                        <div><strong>Bays Required:</strong> ${induction.derived.baysRequired}</div>
                        <div><strong>Connected:</strong> ${induction.derived.connected ? '✓' : '✗'}</div>
                    </div>
                </div>
                
                ${hasConflicts ? `
                    <div class="conflicts-section">
                        <h4>Conflicts (${induction.conflicts.length})</h4>
                        <div class="conflicts-list">
                            ${induction.conflicts.map(c => `<span class="conflict-tag">${c}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}