export const PIPELINE_STAGES = [
  { id: 1, label: 'Research',         short: 'Research',    color: 'bg-slate-500',    border: 'border-slate-500',    text: 'text-slate-300',    hex: '#64748b' },
  { id: 2, label: 'Cold Call',        short: 'Cold Call',   color: 'bg-blue-600',     border: 'border-blue-600',     text: 'text-blue-300',     hex: '#2563eb' },
  { id: 3, label: '1st Appointment',  short: '1st Appt',    color: 'bg-cyan-600',     border: 'border-cyan-600',     text: 'text-cyan-300',     hex: '#0891b2' },
  { id: 4, label: '2nd Appointment',  short: '2nd Appt',    color: 'bg-teal-600',     border: 'border-teal-600',     text: 'text-teal-300',     hex: '#0d9488' },
  { id: 5, label: 'Exclusive Listing',short: 'Excl. List',  color: 'bg-emerald-600',  border: 'border-emerald-600',  text: 'text-emerald-300',  hex: '#059669' },
  { id: 6, label: 'Market / Sell',    short: 'Market',      color: 'bg-green-500',    border: 'border-green-500',    text: 'text-green-300',    hex: '#22c55e' },
  { id: 7, label: 'Field Offers',     short: 'Offers',      color: 'bg-yellow-500',   border: 'border-yellow-500',   text: 'text-yellow-300',   hex: '#eab308' },
  { id: 8, label: 'Contract',         short: 'Contract',    color: 'bg-orange-500',   border: 'border-orange-500',   text: 'text-orange-300',   hex: '#f97316' },
  { id: 9, label: 'Close',            short: 'Close',       color: 'bg-red-500',      border: 'border-red-500',      text: 'text-red-300',      hex: '#ef4444' },
  { id: 10, label: 'Post-Close',      short: 'Post-Close',  color: 'bg-purple-600',   border: 'border-purple-600',   text: 'text-purple-300',   hex: '#9333ea' },
];

export const CLIENT_TYPES = ['Buyer', 'Seller'];

export const STORAGE_CLASSES = ['Class A', 'Class B', 'Class C'];

export const PROPERTY_TYPES = [
  { value: 'Self-Storage', label: 'Self-Storage', icon: '🏢' },
  { value: 'Boat/RV Storage', label: 'Boat/RV Storage', icon: '⛵' },
  { value: 'Land', label: 'Land', icon: '🌿' },
];

export const LEAD_TEMPS = [
  { value: 'hot',  label: 'HOT',  icon: '🔥', bg: 'bg-red-500/20',   border: 'border-red-500/40',   text: 'text-red-400'   },
  { value: 'warm', label: 'WARM', icon: '🟡', bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
  { value: 'cold', label: 'COLD', icon: '🧊', bg: 'bg-blue-500/20',  border: 'border-blue-500/40',  text: 'text-blue-400'  },
];

export const ACTION_TYPES = [
  { value: 'call',     label: 'Follow-Up Call',   icon: '📞' },
  { value: 'email',    label: 'Send Email',       icon: '📧' },
  { value: 'research', label: 'Market Research',  icon: '🔍' },
  { value: 'meeting',  label: 'Schedule Meeting', icon: '📅' },
  { value: 'bov',      label: 'BOV Presentation', icon: '📊' },
];

// Universal Task engine (Sprint 2) — richer type/priority vocab than the
// legacy single-slot ACTION_TYPES above, since one entity can now have
// several open tasks at once.
export const TASK_TYPES = [
  { value: 'call',                label: 'Call',                icon: '📞' },
  { value: 'email',               label: 'Email',                icon: '📧' },
  { value: 'meeting',             label: 'Meeting',              icon: '📅' },
  { value: 'send_report',         label: 'Send Report',          icon: '📈' },
  { value: 'request_financials',  label: 'Request Financials',   icon: '📄' },
  { value: 'bov',                 label: 'BOV',                  icon: '📊' },
  { value: 'follow_up',           label: 'Follow Up',            icon: '🔁' },
  { value: 'contract',            label: 'Contract',             icon: '📝' },
  { value: 'general',             label: 'General',              icon: '✅' },
];

export const TASK_PRIORITIES = [
  { value: 'low',    label: 'Low',    text: 'text-slate-400',  bg: 'bg-slate-700/50' },
  { value: 'normal', label: 'Normal', text: 'text-blue-400',   bg: 'bg-blue-500/10' },
  { value: 'high',   label: 'High',   text: 'text-amber-400',  bg: 'bg-amber-500/10' },
  { value: 'urgent', label: 'Urgent', text: 'text-red-400',    bg: 'bg-red-500/10' },
];

// Quick-pick presets shown in the Add Task modal, matching Brandon's most
// common broker follow-ups (Sprint 2 brief).
export const TASK_QUICK_PICKS = [
  { title: 'Call back tomorrow',            taskType: 'call',               offsetDays: 1 },
  { title: 'Send TractIQ report',           taskType: 'send_report',        offsetDays: 1 },
  { title: 'Ask for T-12',                  taskType: 'request_financials', offsetDays: 3 },
  { title: 'Ask for rent roll',             taskType: 'request_financials', offsetDays: 3 },
  { title: 'Schedule valuation call',       taskType: 'meeting',            offsetDays: 2 },
  { title: 'Follow up after BOV',           taskType: 'follow_up',          offsetDays: 5 },
  { title: 'Send exclusivity agreement',    taskType: 'contract',           offsetDays: 1 },
  { title: 'Check in next quarter',         taskType: 'follow_up',          offsetDays: 90 },
  { title: 'Revisit in 6 months',           taskType: 'follow_up',          offsetDays: 182 },
];
