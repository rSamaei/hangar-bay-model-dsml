import '../frontend/style.css';

const app = document.getElementById('app');

const exampleCode = `airfield KCL_MRO {
  aircraft A320 {
    wingspan 35.8m
    length   37.6m
    height   11.8m
  }

  hangar NorthBay {
    bays     10
    bayWidth 4.0m
    bayDepth 30.0m
    height   15.0m
  }

  auto-induct A320 for 5;
}`;

app.innerHTML = `
  <div class="container mx-auto p-8">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">Airfield Simulation</h1>
    
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Editor Panel -->
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h2 class="text-2xl font-semibold mb-4">DSL Editor</h2>
        <textarea 
          id="code-editor"
          class="w-full h-96 p-4 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter your airfield model..."
        >${exampleCode}</textarea>
        
        <div class="mt-4 flex gap-4">
          <button 
            id="parse-btn"
            class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition"
          >
            Parse Model
          </button>
          <button 
            id="simulate-btn"
            class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition"
          >
            Run Simulation
          </button>
        </div>
        
        <div id="diagnostics" class="mt-4"></div>
      </div>
      
      <!-- Results Panel -->
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h2 class="text-2xl font-semibold mb-4">Results</h2>
        <div id="results" class="space-y-4">
          <p class="text-gray-500">Run a simulation to see results...</p>
        </div>
      </div>
    </div>
    
    <!-- Visualization Panel -->
    <div class="mt-8 bg-white rounded-lg shadow-lg p-6">
      <h2 class="text-2xl font-semibold mb-4">Timeline Visualization</h2>
      <div id="timeline" class="overflow-x-auto"></div>
    </div>
  </div>
`;

const codeEditor = document.getElementById('code-editor');
const parseBtn = document.getElementById('parse-btn');
const simulateBtn = document.getElementById('simulate-btn');
const diagnosticsDiv = document.getElementById('diagnostics');
const resultsDiv = document.getElementById('results');
const timelineDiv = document.getElementById('timeline');

parseBtn.addEventListener('click', async () => {
  const code = codeEditor.value;
  
  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const data = await response.json();
    
    if (data.diagnostics?.length > 0) {
      diagnosticsDiv.innerHTML = `
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <h3 class="font-semibold text-yellow-800">Validation Issues:</h3>
          <ul class="mt-2 space-y-1">
            ${data.diagnostics.map(d => `
              <li class="text-sm text-yellow-700">Line ${d.line}: ${d.message}</li>
            `).join('')}
          </ul>
        </div>
      `;
    } else {
      diagnosticsDiv.innerHTML = `
        <div class="bg-green-50 border-l-4 border-green-400 p-4">
          <p class="text-green-800 font-semibold">✓ Model parsed successfully!</p>
        </div>
      `;
    }
    
    resultsDiv.innerHTML = `
      <div class="space-y-4">
        <div>
          <h3 class="font-semibold text-gray-700">Airfield: ${data.model.name}</h3>
        </div>
        <div>
          <h4 class="font-semibold text-gray-600">Aircraft Types (${data.model.aircraftTypes.length})</h4>
          <ul class="mt-2 space-y-1">
            ${data.model.aircraftTypes.map(ac => `
              <li class="text-sm">${ac.name} - wingspan: ${ac.wingspan}m</li>
            `).join('')}
          </ul>
        </div>
        <div>
          <h4 class="font-semibold text-gray-600">Hangars (${data.model.hangars.length})</h4>
          <ul class="mt-2 space-y-1">
            ${data.model.hangars.map(h => `
              <li class="text-sm">${h.name} - ${h.bays} bays (${h.bayWidth}m each)</li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;
  } catch (error) {
    diagnosticsDiv.innerHTML = `
      <div class="bg-red-50 border-l-4 border-red-400 p-4">
        <p class="text-red-800 font-semibold">Error: ${error.message}</p>
      </div>
    `;
  }
});

simulateBtn.addEventListener('click', async () => {
  const code = codeEditor.value;
  
  try {
    const response = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const data = await response.json();
    
    let html = '<div class="space-y-6">';
    
    // Scheduling results
    if (data.scheduling) {
      html += `
        <div>
          <h3 class="font-semibold text-gray-700 mb-2">Auto-Scheduling</h3>
          <div class="bg-green-50 p-4 rounded">
            <p class="text-sm font-semibold text-green-800">✓ Scheduled: ${data.scheduling.scheduled.length}</p>
            ${data.scheduling.scheduled.map(s => `
              <div class="text-sm mt-1">${s.aircraft} → ${s.hangar} bays ${s.fromBay}..${s.toBay} at t=${s.start} for ${s.duration}</div>
            `).join('')}
          </div>
          ${data.scheduling.unscheduled.length > 0 ? `
            <div class="bg-yellow-50 p-4 rounded mt-2">
              <p class="text-sm font-semibold text-yellow-800">⚠ Could not schedule: ${data.scheduling.unscheduled.length}</p>
              ${data.scheduling.unscheduled.map(u => `
                <div class="text-sm mt-1">${u.aircraft} (${u.duration} slots)</div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }
    
    // Conflicts
    html += `
      <div>
        <h3 class="font-semibold text-gray-700 mb-2">Simulation Results</h3>
        ${data.simulation.conflicts.length > 0 ? `
          <div class="bg-red-50 p-4 rounded">
            <p class="text-sm font-semibold text-red-800">✗ Found ${data.simulation.conflicts.length} conflicts</p>
            ${data.simulation.conflicts.map(c => `
              <div class="text-sm mt-1">Time ${c.time}: ${c.aircraft} in ${c.hangarName} bays ${c.fromBay}..${c.toBay}</div>
            `).join('')}
          </div>
        ` : `
          <div class="bg-green-50 p-4 rounded">
            <p class="text-sm font-semibold text-green-800">✓ No conflicts detected</p>
          </div>
        `}
      </div>
    `;
    
    // Occupancy
    html += `
      <div>
        <h3 class="font-semibold text-gray-700 mb-2">Max Bay Occupancy</h3>
        ${Object.entries(data.simulation.maxOccupancy).map(([hangar, count]) => `
          <div class="text-sm">${hangar}: ${count} bays</div>
        `).join('')}
      </div>
    `;
    
    html += '</div>';
    resultsDiv.innerHTML = html;
    
    // Render timeline
    renderTimeline(data.simulation.timeline);
    
  } catch (error) {
    resultsDiv.innerHTML = `
      <div class="bg-red-50 border-l-4 border-red-400 p-4">
        <p class="text-red-800 font-semibold">Error: ${error.message}</p>
      </div>
    `;
  }
});

function renderTimeline(timeline) {
  if (!timeline || timeline.length === 0) {
    timelineDiv.innerHTML = '<p class="text-gray-500">No timeline data</p>';
    return;
  }
  
  let html = '<div class="inline-block">';
  
  // Get all hangars
  const hangars = Object.keys(timeline[0].occupied);
  
  // Header
  html += '<div class="flex gap-2 mb-2">';
  html += '<div class="w-32 font-semibold">Time →</div>';
  timeline.forEach(t => {
    html += `<div class="w-20 text-center text-sm font-semibold">t=${t.time}</div>`;
  });
  html += '</div>';
  
  // Each hangar
  hangars.forEach(hangar => {
    html += '<div class="flex gap-2 mb-1">';
    html += `<div class="w-32 text-sm font-semibold">${hangar}</div>`;
    
    timeline.forEach(t => {
      const bays = t.occupied[hangar];
      const occupiedCount = bays.filter(b => b.occupied).length;
      const total = bays.length;
      const percentage = (occupiedCount / total) * 100;
      
      const color = percentage === 0 ? 'bg-gray-200' : 
                    percentage < 50 ? 'bg-green-400' :
                    percentage < 80 ? 'bg-yellow-400' : 'bg-red-400';
      
      html += `
        <div class="w-20 h-8 ${color} rounded flex items-center justify-center text-xs font-semibold">
          ${occupiedCount}/${total}
        </div>
      `;
    });
    
    html += '</div>';
  });
  
  html += '</div>';
  timelineDiv.innerHTML = html;
}