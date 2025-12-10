import type { SimulationData } from '../types/api';

export function renderTimeline(timeline: SimulationData['timeline'] | undefined): void {
  const timelineDiv = document.getElementById('timeline');
  if (!timelineDiv || !timeline || timeline.length === 0) {
    if (timelineDiv) {
      timelineDiv.innerHTML = `
        <div class="text-center py-8">
          <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <p class="text-gray-400 font-medium">No timeline data available</p>
        </div>
      `;
    }
    return;
  }
  
  const hangars = Object.keys(timeline[0].occupied);
  
  let html = '<div class="inline-block min-w-full">';
  
  // Header
  html += '<div class="flex gap-3 mb-3">';
  html += '<div class="w-36 font-semibold text-gray-700 flex items-center gap-2">';
  html += '<svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
  html += 'Time →</div>';
  timeline.forEach(t => {
    html += `<div class="w-24 text-center text-sm font-semibold text-purple-700 bg-purple-50 rounded-lg py-2">t=${t.time}</div>`;
  });
  html += '</div>';
  
  // Each hangar row
  hangars.forEach(hangar => {
    html += '<div class="flex gap-3 mb-2">';
    html += `<div class="w-36 text-sm font-semibold text-gray-700 flex items-center px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">${hangar}</div>`;
    
    timeline.forEach(t => {
      const bays = t.occupied[hangar];
      const occupiedCount = bays.filter(b => b.occupied).length;
      const total = bays.length;
      const percentage = (occupiedCount / total) * 100;
      
      const color = percentage === 0 ? 'bg-gray-100 border-gray-300' : 
                    percentage < 50 ? 'bg-green-100 border-green-400' :
                    percentage < 80 ? 'bg-yellow-100 border-yellow-400' : 'bg-red-100 border-red-400';
      
      const textColor = percentage === 0 ? 'text-gray-600' :
                        percentage < 50 ? 'text-green-700' :
                        percentage < 80 ? 'text-yellow-700' : 'text-red-700';
      
      html += `
        <div class="w-24 h-10 ${color} border-2 rounded-lg flex items-center justify-center text-xs font-bold ${textColor} shadow-sm">
          ${occupiedCount}/${total}
        </div>
      `;
    });
    
    html += '</div>';
  });
  
  html += '</div>';
  timelineDiv.innerHTML = html;
}