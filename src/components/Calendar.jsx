import { useState } from 'react';
import MeetingModal from './MeetingModal';

export default function Calendar({ meetings, clients, onAdd, onUpdate, onDelete }) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showModal, setShowModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const meetingsByDate = {};
  meetings.forEach(m => {
    if (!meetingsByDate[m.date]) meetingsByDate[m.date] = [];
    meetingsByDate[m.date].push(m);
  });

  const selectedMeetings = (meetingsByDate[selectedDate] ?? []).sort((a, b) =>
    (a.startTime ?? '').localeCompare(b.startTime ?? '')
  );

  const upcoming = [...meetings]
    .filter(m => m.date >= todayStr)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
    .slice(0, 6);

  function handleSave(data) {
    if (editingMeeting) {
      onUpdate(editingMeeting.id, data);
    } else {
      onAdd(data);
    }
    setShowModal(false);
    setEditingMeeting(null);
  }

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('default', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Calendar */}
      <div className="flex-shrink-0 w-full lg:w-80">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all text-lg leading-none"
            >
              ‹
            </button>
            <h2 className="text-sm font-bold text-white">{monthLabel}</h2>
            <button
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all text-lg leading-none"
            >
              ›
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-600 py-1">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const count = meetingsByDate[dateStr]?.length ?? 0;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-slate-900'
                      : isToday
                        ? 'bg-slate-700 text-white ring-1 ring-amber-500'
                        : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  {day}
                  {count > 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isSelected ? 'bg-slate-900' : 'bg-amber-500'
                    }`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Upcoming */}
        <div className="mt-4 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Upcoming</h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No upcoming meetings scheduled</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(m => {
                const client = clients.find(c => c.id === m.clientId);
                const isPast = m.date < todayStr;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedDate(m.date)}
                    className="w-full text-left bg-slate-800 hover:border-slate-600 border border-slate-700 rounded-lg px-3 py-2 transition-all"
                  >
                    <p className="text-xs font-semibold text-white truncate">{m.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(m.date + 'T12:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                      {m.startTime ? ` · ${m.startTime}` : ''}
                    </p>
                    {client && <p className="text-xs text-amber-500/70 truncate">{client.name}</p>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Day detail */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">{selectedLabel}</h3>
          <button
            onClick={() => { setEditingMeeting(null); setShowModal(true); }}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5"
          >
            <span className="text-lg font-black leading-none">+</span> Schedule Meeting
          </button>
        </div>

        {selectedMeetings.length === 0 ? (
          <div className="text-center py-20 text-slate-600">
            <div className="text-5xl mb-3">📅</div>
            <p className="text-sm">No meetings on this day</p>
            <button
              onClick={() => { setEditingMeeting(null); setShowModal(true); }}
              className="mt-3 text-amber-500 hover:text-amber-400 text-sm font-semibold transition-colors"
            >
              + Schedule one
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedMeetings.map(m => (
              <MeetingCard
                key={m.id}
                meeting={m}
                client={clients.find(c => c.id === m.clientId)}
                onEdit={() => { setEditingMeeting(m); setShowModal(true); }}
                onDelete={() => onDelete(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <MeetingModal
          meeting={editingMeeting}
          defaultDate={selectedDate}
          clients={clients}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingMeeting(null); }}
        />
      )}
    </div>
  );
}

function MeetingCard({ meeting, client, onEdit, onDelete }) {
  function openInOutlook() {
    const startDate = meeting.date.replace(/-/g, '');
    const endDate = meeting.date.replace(/-/g, '');
    const startTime = (meeting.startTime ?? '09:00').replace(':', '') + '00';
    const endTime = (meeting.endTime ?? '10:00').replace(':', '') + '00';
    const params = new URLSearchParams({
      subject: meeting.title,
      startdt: `${meeting.date}T${meeting.startTime ?? '09:00'}:00`,
      enddt: `${meeting.date}T${meeting.endTime ?? '10:00'}:00`,
      body: meeting.notes ?? '',
      location: meeting.location ?? '',
    });
    window.open(`https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`, '_blank');
  }

  function downloadICS() {
    const fmt = (dateStr, timeStr, fallback) => {
      const t = (timeStr ?? fallback).replace(':', '');
      return dateStr.replace(/-/g, '') + 'T' + t + '00';
    };
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SelfStorage CRM//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${meeting.title}`,
      `DTSTART:${fmt(meeting.date, meeting.startTime, '09:00')}`,
      `DTEND:${fmt(meeting.date, meeting.endTime, '10:00')}`,
      `LOCATION:${meeting.location ?? ''}`,
      `DESCRIPTION:${meeting.notes ?? ''}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting.title}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-white text-sm">{meeting.title}</h4>
          {(meeting.startTime || meeting.endTime) && (
            <p className="text-xs text-slate-400 mt-0.5">
              🕐 {meeting.startTime ?? ''}{meeting.startTime && meeting.endTime ? ' – ' : ''}{meeting.endTime ?? ''}
            </p>
          )}
          {meeting.location && (
            <p className="text-xs text-slate-400 mt-0.5">📍 {meeting.location}</p>
          )}
          {client && (
            <p className="text-xs text-amber-400/80 mt-0.5">👤 {client.name}{client.facilityName ? ` · ${client.facilityName}` : ''}</p>
          )}
          {meeting.notes && (
            <p className="text-xs text-slate-500 mt-1.5 italic line-clamp-2">{meeting.notes}</p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-xs"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-900/50 text-slate-400 hover:text-red-400 transition-all text-xs"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
        <button
          onClick={openInOutlook}
          className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-blue-600/20 border border-blue-700/50 text-blue-400 hover:bg-blue-600/30 transition-all"
        >
          📧 Open in Outlook
        </button>
        <button
          onClick={downloadICS}
          className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition-all"
        >
          ⬇ Download .ics
        </button>
      </div>
    </div>
  );
}
