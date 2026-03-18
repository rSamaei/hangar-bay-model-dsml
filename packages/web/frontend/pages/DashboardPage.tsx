import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAircraft } from '../services/aircraft-api';
import { getHangars } from '../services/hangars-api';
import { getSchedule } from '../services/scheduling-api';

const COLORS = {
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
} as const;

function StatCard({ title, value, color, icon }: {
  title: string; value: number | null; color: keyof typeof COLORS; icon: string;
}) {
  const c = COLORS[color];
  return (
    <div className={`p-6 ${c.bg} border ${c.border} rounded-xl`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-slate-400 text-sm">{title}</span>
        <div className={`w-10 h-10 ${c.bg} rounded-lg flex items-center justify-center`}>
          <svg className={`w-5 h-5 ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
      <p className="text-3xl font-bold text-white">
        {value === null ? <span className="text-slate-600">--</span> : value}
      </p>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<{
    aircraft: number | null;
    hangars: number | null;
    scheduled: number | null;
    unplaced: number | null;
  }>({ aircraft: null, hangars: null, scheduled: null, unplaced: null });

  useEffect(() => {
    Promise.all([getAircraft(), getHangars(), getSchedule()])
      .then(([aircraft, hangars, schedule]) => {
        setStats({
          aircraft: aircraft.length,
          hangars: hangars.length,
          scheduled: schedule.placements.filter(p => p.status === 'scheduled').length,
          unplaced: schedule.placements.filter(p => p.status === 'failed').length,
        });
      })
      .catch(err => console.error('Failed to load dashboard stats:', err));
  }, []);

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          Welcome, <span className="text-cyan-400">{user?.username || 'User'}</span>
        </h1>
        <p className="text-slate-400">Manage your aircraft, hangars, and scheduling</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Aircraft" value={stats.aircraft} color="cyan"
          icon="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        <StatCard title="Hangars" value={stats.hangars} color="blue"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        <StatCard title="Scheduled" value={stats.scheduled} color="indigo"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        <StatCard title="Unplaced" value={stats.unplaced} color="purple"
          icon="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Add Aircraft', desc: 'Define a new aircraft with dimensions', route: '/aircraft', color: 'cyan', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
          { label: 'Add Hangar', desc: 'Create a hangar with bays', route: '/hangars', color: 'blue', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
          { label: 'Schedule', desc: 'Manage induction schedule', route: '/schedule', color: 'indigo', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
        ].map(({ label, desc, route, color, icon }) => {
          const c = COLORS[color as keyof typeof COLORS];
          return (
            <button
              key={label}
              onClick={() => navigate(route)}
              className="p-6 bg-slate-800/30 border border-slate-700 hover:border-slate-600 rounded-xl text-left transition-all hover:scale-[1.02] group"
            >
              <div className="w-12 h-12 bg-slate-700/50 group-hover:bg-slate-700 rounded-xl flex items-center justify-center mb-4 transition-colors">
                <svg className={`w-6 h-6 ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">{label}</h3>
              <p className="text-sm text-slate-400">{desc}</p>
            </button>
          );
        })}
      </div>

      {/* Management Links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { label: 'Aircraft Fleet', desc: 'View and manage your aircraft', route: '/aircraft', color: 'cyan' },
          { label: 'Hangars', desc: 'View and manage your hangars', route: '/hangars', color: 'blue' },
        ].map(({ label, desc, route, color }) => {
          const c = COLORS[color as keyof typeof COLORS];
          return (
            <button
              key={label}
              onClick={() => navigate(route)}
              className={`p-6 bg-slate-800/30 border ${c.border} hover:border-opacity-80 rounded-xl text-left transition-all hover:scale-[1.01] group`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">{label}</h3>
                  <p className="text-sm text-slate-400">{desc}</p>
                </div>
                <svg className={`w-6 h-6 ${c.text} group-hover:translate-x-1 transition-transform`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
